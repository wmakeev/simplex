import { parse } from '../parser/index.js'
import { TOPIC_TOKEN, SCOPE_NAMES, SCOPE_VALUES, SCOPE_PARENT } from './constants.js'
import { Expression, ExpressionStatement, Location } from './simplex-tree.js'
import { ExpressionError, SimplexError } from './errors.js'
import { resolveContext } from './runtime.js'
import { validate } from './validate.js'
import type {
  ContextHelpers,
  ExpressionOperators
} from './runtime.js'
import type { CompileOptions } from './compiler.js'

// --- Types ---

/**
 * Lexical scope as a linked list of frames: `[names, values, parent]`.
 * Indices are the `SCOPE_*` constants. `null` is the root (no frame).
 */
type Scope = [string[], unknown[], Scope | null]

/** Any AST node carrying a source location (used to attribute runtime errors). */
interface Located { location: Location }

/**
 * Runtime context with all defaults filled in by {@link resolveContext}.
 * Unlike {@link ContextOptions}, every helper and operator map is present.
 */
type ResolvedContext<Data, Globals> = ContextHelpers<Data, Globals> &
  ExpressionOperators & { globals?: Globals }

/**
 * Options for {@link interpret} — identical to {@link CompileOptions} minus
 * `errorMapper`, which is codegen-specific (the interpreter builds errors
 * directly from the source node, so no stack-trace mapping is needed).
 */
export type InterpretOptions<Data, Globals> = Omit<
  CompileOptions<Data, Globals>,
  'errorMapper'
>

// --- Helpers ---

/** Override a function's reported arity (used for currying / lambdas). */
function withArity<F extends Function>(fn: F, length: number): F {
  return Object.defineProperty(fn, 'length', {
    value: length,
    configurable: true
  })
}

/**
 * Convert a runtime error thrown while evaluating `node` into an
 * {@link ExpressionError} carrying the node's source location. Mirrors what the
 * codegen backend does via its `errorMapper`, so both backends report the same
 * message + location (Phase 4 verifies parity).
 *
 * - Non-`Error` throws pass through unmapped (matches `mapError` returning null).
 * - An error already located by an inner frame keeps its precise location.
 */
function locateError(
  err: unknown,
  node: Located,
  expression: string
): unknown {
  if (!(err instanceof Error)) return err
  if (err instanceof SimplexError && err.location !== null) return err
  return new ExpressionError(err.message, expression, node.location, {
    cause: err
  })
}

// --- Public API ---

/**
 * Interpret a SimplEx expression string into an executable function, without
 * `new Function`/`eval`. Suitable for environments with a strict CSP
 * (MV3 extensions, Cloudflare Workers, Deno Deploy, edge runtimes).
 *
 * Shares the runtime semantics of {@link compile} via the common `runtime.ts`
 * and the compile-time checks via the common `validate.ts`; only the control
 * flow differs (tree-walking vs codegen).
 */
export function interpret<
  Data = Record<string, unknown>,
  Globals = Record<string, unknown>
>(
  expression: string,
  options?: InterpretOptions<Data, Globals>
): (data?: Data) => unknown {
  const tree = parse(expression) as ExpressionStatement
  validate(tree, expression)

  const ctx = resolveContext(options) as ResolvedContext<Data, Globals>
  const globals = (ctx.globals ?? null) as Globals

  // Source node of the most recent throwing helper call. Read only in the
  // top-level catch after `evalNode` throws, so the value is always the node
  // that actually caused the throw (it is set right before each such call).
  let errNode: Located = tree.expression

  /**
   * Resolve an identifier through the scope chain, falling back to
   * globals/data via `getIdentifierValue`. Mirrors the codegen `_get` bootstrap.
   */
  function lookup(scope: Scope | null, name: string, data: Data): unknown {
    while (scope !== null) {
      const i = scope[SCOPE_NAMES].indexOf(name)
      if (i !== -1) return scope[SCOPE_VALUES][i]
      scope = scope[SCOPE_PARENT]
    }
    return ctx.getIdentifierValue(name, globals, data)
  }

  /**
   * Tree-walking evaluator. Mirrors `visitors.ts` but returns values directly
   * instead of generating code. Scope frames are allocated only in
   * `LambdaExpression` / `LetExpression` / `PipeSequence`, as in codegen.
   * `errNode` is set right before each helper call that may throw.
   */
  function evalNode(node: Expression, scope: Scope | null, data: Data): unknown {
    switch (node.type) {
      case 'Literal':
        return node.value

      case 'Identifier':
        errNode = node
        return lookup(scope, node.name, data)

      case 'TopicReference':
        errNode = node
        return lookup(scope, TOPIC_TOKEN, data)

      case 'UnaryExpression': {
        const arg = evalNode(node.argument, scope, data)
        errNode = node
        return ctx.unaryOperators[node.operator](arg)
      }

      case 'BinaryExpression': {
        const left = evalNode(node.left, scope, data)
        const right = evalNode(node.right, scope, data)
        errNode = node
        return ctx.binaryOperators[node.operator](left, right)
      }

      case 'LogicalExpression':
        errNode = node
        return ctx.logicalOperators[node.operator](
          () => evalNode(node.left, scope, data),
          () => evalNode(node.right, scope, data)
        )

      case 'ConditionalExpression': {
        const test = evalNode(node.test, scope, data)
        errNode = node
        return ctx.castToBoolean(test)
          ? evalNode(node.consequent, scope, data)
          : node.alternate !== null
            ? evalNode(node.alternate, scope, data)
            : undefined
      }

      case 'NullishCoalescingExpression': {
        const left = evalNode(node.left, scope, data)
        // null / undefined / NaN fall through to the right-hand side
        return left == null || left !== left
          ? evalNode(node.right, scope, data)
          : left
      }

      case 'ArrayExpression': {
        const result: unknown[] = []
        for (const el of node.elements) {
          if (el === null) {
            // Sparse hole: `[1, , 3]`
            result.length += 1
          } else if (el.type === 'SpreadElement') {
            const arg = evalNode(el.argument, scope, data)
            errNode = el
            const arr = ctx.ensureArray(arg)
            for (const item of arr) result.push(item)
          } else {
            result.push(evalNode(el, scope, data))
          }
        }
        return result
      }

      case 'ObjectExpression': {
        const result: Record<PropertyKey, unknown> = {}
        for (const p of node.properties) {
          if (p.type === 'SpreadElement') {
            const arg = evalNode(p.argument, scope, data)
            errNode = p
            Object.assign(result, ctx.ensureObject(arg))
            continue
          }

          let key: PropertyKey
          if (p.computed) {
            key = evalNode(p.key, scope, data) as PropertyKey
          } else if (p.key.type === 'Identifier') {
            key = p.key.name
          } else if (p.key.type === 'Literal') {
            // Non-finite keys are rejected up front by validate().
            key = p.key.value as PropertyKey
          } else {
            // Unreachable: grammar restricts keys to Identifier and Literal
            throw new Error(`Unsupported object key type: ${p.key.type}`)
          }

          result[key] = evalNode(p.value, scope, data)
        }
        return result
      }

      case 'MemberExpression': {
        const obj = evalNode(node.object, scope, data)
        const key = node.computed
          ? evalNode(node.property, scope, data)
          : node.property.name
        const extension = node.computed === false && node.extension === true
        errNode = node
        return ctx.getProperty(obj, key, extension)
      }

      case 'CallExpression': {
        const args = node.arguments

        let hasPlaceholder = false
        for (const a of args) {
          if (a.type === 'CurryPlaceholder') {
            hasPlaceholder = true
            break
          }
        }

        // Currying: `fn(#, y, #)` → a function of arity = number of placeholders
        if (hasPlaceholder) {
          let arity = 0
          for (const a of args) if (a.type === 'CurryPlaceholder') arity++

          const fn = (...provided: unknown[]): unknown => {
            const callee = evalNode(node.callee, scope, data)
            const argv = new Array<unknown>(args.length)
            let i = 0
            let p = 0
            for (const a of args) {
              argv[i++] =
                a.type === 'CurryPlaceholder'
                  ? provided[p++]
                  : evalNode(a, scope, data)
            }
            errNode = node
            return ctx.callFunction(callee, argv)
          }

          return withArity(fn, arity)
        }

        const callee = evalNode(node.callee, scope, data)

        if (args.length > 0) {
          const argv = args.map(a => evalNode(a as Expression, scope, data))
          errNode = node
          return ctx.callFunction(callee, argv)
        }

        errNode = node
        return ctx.callFunction(callee, null)
      }

      case 'NonNullAssertExpression': {
        const value = evalNode(node.expression, scope, data)
        errNode = node
        return ctx.nonNullAssert(value)
      }

      case 'PipeSequence': {
        const head = evalNode(node.head, scope, data)
        const tail = node.tail.map(t => ({
          opt: t.operator === '|?',
          fwd: t.operator === '|>',
          next: (topic: unknown): unknown =>
            evalNode(t.expression, [[TOPIC_TOKEN], [topic], scope], data)
        }))
        errNode = node
        return ctx.pipe(head, tail)
      }

      case 'LambdaExpression': {
        const body = node.expression

        if (node.params.length > 0) {
          const paramNames = node.params.map(p => p.name)
          const fn = (...args: unknown[]): unknown =>
            evalNode(body, [paramNames, args, scope], data)
          return withArity(fn, paramNames.length)
        }

        // No-param lambda captures the current scope
        return (): unknown => evalNode(body, scope, data)
      }

      case 'LetExpression': {
        // Sequential bindings: each init sees the previous ones.
        // Duplicate-name validation is handled by validate().
        const names: string[] = []
        const values: unknown[] = []
        const letScope: Scope = [names, values, scope]

        for (const d of node.declarations) {
          values.push(evalNode(d.init, letScope, data))
          names.push(d.id.name)
        }

        return evalNode(node.expression, letScope, data)
      }

      case 'TemplateLiteral': {
        const { quasis, expressions, tag } = node

        // Tagged: values are passed through uncoerced
        if (tag !== null) {
          const tagFn = evalNode(tag, scope, data)
          const values = expressions.map(e => evalNode(e, scope, data))
          const strings = quasis.map(q => q.value)
          errNode = node
          return ctx.callFunction(tagFn, [strings, ...values])
        }

        // No interpolations → the single static part
        if (expressions.length === 0) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          return quasis[0]!.value
        }

        let result = ''
        for (let i = 0; i < quasis.length; i++) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          result += quasis[i]!.value
          if (i < expressions.length) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const value = evalNode(expressions[i]!, scope, data)
            errNode = node
            result += ctx.castToString(value)
          }
        }
        return result
      }

      default: {
        // Unreachable: every Expression node type is handled above.
        const exhaustive: never = node
        throw new Error(
          `No interpreter handler for node type - ${(exhaustive as Expression).type}`
        )
      }
    }
  }

  return (data?: Data) => {
    try {
      return evalNode(tree.expression, null, data as Data)
    } catch (err) {
      throw locateError(err, errNode, expression)
    }
  }
}

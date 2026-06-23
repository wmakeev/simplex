import { CompileError } from './errors.js'
import { TOPIC_TOKEN } from './constants.js'
import { Expression, ExpressionStatement } from './simplex-tree.js'

/**
 * Backend-agnostic compile-time validation pass.
 *
 * Walks the AST once and throws {@link CompileError} for violations that must be
 * caught before evaluation, independent of how the expression is later executed
 * (codegen via `new Function` or tree-walking interpreter). Shared by both
 * backends so they report identical errors (message + location).
 *
 * Checks performed:
 * - duplicate names inside a `let` expression;
 * - non-finite numeric object keys (`{ [Infinity]: 1 }`-style literals);
 * - a topic reference (`%`) used outside of a pipe body.
 *
 * `insidePipe` tracks whether the current node is within a pipe tail expression,
 * where `%` is bound. It stays `true` for the whole subtree of a pipe step.
 */
function validateNode(
  node: Expression,
  expression: string,
  insidePipe: boolean
): void {
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
      return

    case 'TopicReference':
      if (!insidePipe) {
        throw new CompileError(
          `Topic reference "${TOPIC_TOKEN}" is unbound; it must be inside a pipe body`,
          expression,
          node.location
        )
      }
      return

    case 'UnaryExpression':
      validateNode(node.argument, expression, insidePipe)
      return

    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'NullishCoalescingExpression':
      validateNode(node.left, expression, insidePipe)
      validateNode(node.right, expression, insidePipe)
      return

    case 'ConditionalExpression':
      validateNode(node.test, expression, insidePipe)
      validateNode(node.consequent, expression, insidePipe)
      if (node.alternate !== null) {
        validateNode(node.alternate, expression, insidePipe)
      }
      return

    case 'ArrayExpression':
      for (const el of node.elements) {
        if (el === null) continue
        validateNode(
          el.type === 'SpreadElement' ? el.argument : el,
          expression,
          insidePipe
        )
      }
      return

    case 'ObjectExpression':
      for (const p of node.properties) {
        if (p.type === 'SpreadElement') {
          validateNode(p.argument, expression, insidePipe)
          continue
        }
        if (p.computed) {
          validateNode(p.key, expression, insidePipe)
        } else if (
          p.key.type === 'Literal' &&
          typeof p.key.value === 'number' &&
          !Number.isFinite(p.key.value)
        ) {
          // JSON.stringify(Infinity) → "null" in codegen; reject for parity.
          throw new CompileError(
            `Invalid object key: ${p.key.value}`,
            expression,
            p.key.location
          )
        }
        validateNode(p.value, expression, insidePipe)
      }
      return

    case 'MemberExpression':
      validateNode(node.object, expression, insidePipe)
      if (node.computed) validateNode(node.property, expression, insidePipe)
      return

    case 'CallExpression':
      validateNode(node.callee, expression, insidePipe)
      for (const arg of node.arguments) {
        if (arg.type === 'CurryPlaceholder') continue
        validateNode(arg, expression, insidePipe)
      }
      return

    case 'NonNullAssertExpression':
      validateNode(node.expression, expression, insidePipe)
      return

    case 'PipeSequence':
      // The head is evaluated outside the pipe body — `%` is not bound there.
      validateNode(node.head, expression, insidePipe)
      for (const t of node.tail) {
        validateNode(t.expression, expression, true)
      }
      return

    case 'LambdaExpression':
      validateNode(node.expression, expression, insidePipe)
      return

    case 'LetExpression': {
      const seen = new Set<string>()
      for (const d of node.declarations) {
        if (seen.has(d.id.name)) {
          throw new CompileError(
            `"${d.id.name}" name defined inside let expression was repeated`,
            expression,
            d.id.location
          )
        }
        seen.add(d.id.name)
        validateNode(d.init, expression, insidePipe)
      }
      validateNode(node.expression, expression, insidePipe)
      return
    }

    case 'TemplateLiteral':
      if (node.tag !== null) validateNode(node.tag, expression, insidePipe)
      for (const e of node.expressions) {
        validateNode(e, expression, insidePipe)
      }
      return

    default: {
      // Unreachable: every Expression node type is handled above.
      const exhaustive: never = node
      throw new Error(
        `No validate handler for node type - ${(exhaustive as Expression).type}`
      )
    }
  }
}

/**
 * Run the shared compile-time validation pass over a parsed expression.
 * Throws {@link CompileError} on the first violation found.
 */
export function validate(tree: ExpressionStatement, expression: string): void {
  validateNode(tree.expression, expression, false)
}

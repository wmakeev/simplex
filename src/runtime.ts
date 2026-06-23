import { ExpressionError, UnexpectedTypeError } from './errors.js'
import {
  BinaryExpression,
  LogicalExpression,
  UnaryExpression
} from './simplex-tree.js'
import {
  castToBoolean,
  castToString,
  ensureFunction,
  ensureNumber,
  ensureArray,
  ensureObject,
  ensureRelationalComparable,
  isSimpleValue,
  objToStringAlias,
  typeOf
} from './tools/index.js'

// --- Context Helpers ---

export interface ContextHelpers<Data, Globals> {
  castToBoolean(this: void, val: unknown): boolean
  castToString(this: void, val: unknown): string
  ensureFunction(this: void, val: unknown): Function
  ensureObject(this: void, val: unknown): object
  ensureArray(this: void, val: unknown): unknown[]
  nonNullAssert(this: void, val: unknown): unknown
  getIdentifierValue(
    this: void,
    identifierName: string,
    globals: Globals,
    data: Data
  ): unknown
  getProperty(
    this: void,
    obj: unknown,
    key: unknown,
    extension: boolean
  ): unknown
  callFunction(this: void, fn: unknown, args: unknown[] | null): unknown
  pipe(
    this: void,
    head: unknown,
    tail: { opt: boolean; fwd: boolean; next: (topic: unknown) => unknown }[]
  ): unknown
}

var hasOwn = Object.hasOwn

/** Look up an identifier in globals first, then data; throw on miss. */
function defaultGetIdentifierValue(
  identifierName: string,
  globals: Record<string, unknown>,
  data: Record<string, unknown>
): unknown {
  if (identifierName === 'undefined') return undefined

  if (globals != null && Object.hasOwn(globals, identifierName)) {
    return globals[identifierName]
  }

  if (data != null && Object.hasOwn(data, identifierName)) {
    return data[identifierName]
  }

  throw new Error(`Unknown identifier - ${identifierName}`)
}

/** Look up an extension method for the given object type and bind obj as first argument. */
export function getExtensionMethod(
  obj: unknown,
  key: unknown,
  extensionMap: Map<string | object | Function, Record<string, Function>>
): Function {
  var typeofObj = typeof obj
  var methods = extensionMap.get(
    typeofObj === 'object' ? (obj as object).constructor : typeofObj
  )

  if (methods === undefined) {
    throw new TypeError(`No extension methods defined for type "${typeofObj}"`)
  }

  var method = methods[key as string]
  if (method === undefined) {
    throw new TypeError(
      `Extension method "${String(key)}" is not defined for type "${typeofObj}"`
    )
  }

  return method.bind(null, obj) as Function
}

/** Resolve property access on an object, Map, or string (null-safe). */
export function defaultGetProperty(
  obj: unknown,
  key: unknown,
  extension: boolean
): unknown {
  if (obj == null) return undefined

  // TODO Нужно ли это убрать отсюда? Вроде как сюда всегда передается false?
  if (extension) {
    throw new ExpressionError(
      'Extension member expression (::) is reserved and not implemented',
      '',
      null
    )
  }

  var typeofObj = typeof obj

  if (typeofObj === 'string' && typeof key === 'number') {
    return (obj as string)[key]
  }

  if (typeofObj !== 'object') {
    throw new UnexpectedTypeError(['object'], obj)
  }

  if (isSimpleValue(key) === false) {
    throw new UnexpectedTypeError(['simple type object key'], key)
  }

  if (hasOwn(obj, key as any)) {
    // @ts-expect-error Type cannot be used as an index type
    return obj[key] as unknown
  }

  if (obj instanceof Map) {
    return obj.get(key) as unknown
  }

  return undefined
}

/** Call a function value; null/undefined silently returns undefined. */
function defaultCallFunction(fn: unknown, args: unknown[] | null): unknown {
  return fn == null
    ? undefined
    : ((args === null
        ? ensureFunction(fn)()
        : ensureFunction(fn).apply(null, args)) as unknown)
}

/** Assert that a value is not null or undefined; throw on null/undefined. */
function defaultNonNullAssert(val: unknown): unknown {
  if (val == null) {
    throw new ExpressionError(
      'Non-null assertion failed: value is ' +
        (val === null ? 'null' : 'undefined'),
      '',
      null
    )
  }
  return val
}

/** Execute a pipe sequence, threading each result through the next step. */
function defaultPipe(
  head: unknown,
  tail: { opt: boolean; fwd: boolean; next: (topic: unknown) => unknown }[]
): unknown {
  var result = head
  for (const it of tail) {
    if (it.fwd) {
      throw new ExpressionError(
        'Pipe forward operator (|>) is reserved and not implemented',
        '',
        null
      )
    }
    if (it.opt && (result == null || result !== result)) return result
    result = it.next(result)
  }
  return result
}

export const defaultContextHelpers: ContextHelpers<
  Record<string, unknown>,
  Record<string, unknown>
> = {
  castToBoolean,
  castToString,
  ensureFunction,
  ensureObject,
  ensureArray,
  nonNullAssert: defaultNonNullAssert,
  getIdentifierValue: defaultGetIdentifierValue,
  getProperty: defaultGetProperty,
  callFunction: defaultCallFunction,
  pipe: defaultPipe
}

// --- Operators ---

export type ExpressionUnaryOperators = Record<
  UnaryExpression['operator'],
  (val: unknown) => unknown
>

/** Create the default unary operator map (+, -, not, typeof). */
export function createDefaultUnaryOperators(
  bool: (val: unknown) => boolean
): ExpressionUnaryOperators {
  return {
    '+': val => ensureNumber(val),
    '-': val => -ensureNumber(val),
    'not': val => !bool(val),
    'typeof': val => typeof val
  }
}

export const defaultUnaryOperators: ExpressionUnaryOperators =
  createDefaultUnaryOperators(castToBoolean)

export type ExpressionBinaryOperators = Record<
  BinaryExpression['operator'],
  (left: unknown, right: unknown) => unknown
>

const numericOp =
  (
    fn: (a: number, b: number) => number
  ): ((a: unknown, b: unknown) => unknown) =>
  (a, b) =>
    fn(ensureNumber(a) as number, ensureNumber(b) as number)

export const defaultBinaryOperators: ExpressionBinaryOperators = {
  '!=': (a, b) => a !== b,

  '==': (a, b) => a === b,

  '*': numericOp((a, b) => a * b),
  '+': numericOp((a, b) => a + b),
  '-': numericOp((a, b) => a - b),
  '/': numericOp((a, b) => a / b),
  'mod': numericOp((a, b) => a % b),
  '^': numericOp((a, b) => a ** b),

  '&': (a, b) => castToString(a) + castToString(b),

  '<': (a, b) => ensureRelationalComparable(a) < ensureRelationalComparable(b),

  '<=': (a, b) =>
    ensureRelationalComparable(a) <= ensureRelationalComparable(b),

  '>': (a, b) => ensureRelationalComparable(a) > ensureRelationalComparable(b),

  '>=': (a, b) =>
    ensureRelationalComparable(a) >= ensureRelationalComparable(b),

  // Check if key exists in container (Object/Array/Map)
  'in': (a, b) => {
    const bType = objToStringAlias.call(b)

    switch (bType) {
      case '[object Object]': {
        return Object.hasOwn(b as object, a as any)
      }

      case '[object Array]': {
        if (Number.isSafeInteger(a)) {
          // @ts-expect-error a is checked as safe integer index
          return a in b
        } else {
          throw new TypeError(
            `Wrong "in" operator usage - key value must be a safe integer`
          )
        }
      }

      case '[object Map]':
        // @ts-expect-error b is Map, has() exists
        return b.has(a) as boolean

      default:
        throw new TypeError(
          `Cannot use "in" operator to ensure ${typeOf(a)} key in ${typeOf(b)}`
        )
    }
  }
}

export type LogicalOperatorFunction = (
  left: () => unknown,
  right: () => unknown
) => unknown

export type ExpressionLogicalOperators = Record<
  LogicalExpression['operator'],
  LogicalOperatorFunction
>

/** Create the default logical operator map (and/&&, or/||). */
export function createDefaultLogicalOperators(
  bool: (val: unknown) => boolean
): ExpressionLogicalOperators {
  const and: LogicalOperatorFunction = (a, b) => bool(a()) && bool(b())
  const or: LogicalOperatorFunction = (a, b) => bool(a()) || bool(b())
  return { 'and': and, '&&': and, 'or': or, '||': or }
}

export const defaultLogicalOperators: ExpressionLogicalOperators =
  createDefaultLogicalOperators(castToBoolean)

export interface ExpressionOperators {
  unaryOperators: Record<UnaryExpression['operator'], (val: unknown) => unknown>
  binaryOperators: Record<
    BinaryExpression['operator'],
    (left: unknown, right: unknown) => unknown
  >
  logicalOperators: Record<
    LogicalExpression['operator'],
    (left: () => unknown, right: () => unknown) => unknown
  >
}

// --- Context Resolution ---

/**
 * Options that configure the shared runtime context (everything in
 * {@link CompileOptions} except `errorMapper`, which is codegen-specific).
 */
export type ContextOptions<Data, Globals> = Partial<
  ContextHelpers<Data, Globals> &
    ExpressionOperators & {
      globals: Globals
      extensions: Map<string | object | Function, Record<string, Function>>
    }
>

/**
 * Build the resolved runtime context shared by both backends (codegen and
 * interpreter): fill defaults, rebuild operators under a custom `castToBoolean`,
 * and inject an extension-aware `getProperty` when `extensions` are provided.
 */
export function resolveContext<Data, Globals>(
  options?: ContextOptions<Data, Globals>
): ContextOptions<Data, Globals> {
  const resolvedBool = options?.castToBoolean ?? castToBoolean

  const ctx: ContextOptions<Data, Globals> = {
    ...defaultContextHelpers,
    // Recreate operators with custom castToBoolean so compile options
    // are honored by logical (and/or) and unary (not) operators
    ...{
      unaryOperators: options?.castToBoolean
        ? createDefaultUnaryOperators(resolvedBool)
        : defaultUnaryOperators,
      binaryOperators: defaultBinaryOperators,
      logicalOperators: options?.castToBoolean
        ? createDefaultLogicalOperators(resolvedBool)
        : defaultLogicalOperators
    },
    ...(options as any)
  }

  if (
    options?.extensions &&
    options.extensions.size > 0 &&
    !options.getProperty
  ) {
    const extensionMap = options.extensions

    ctx.getProperty = (obj, key, extension) => {
      if (obj == null) return undefined
      if (extension) return getExtensionMethod(obj, key, extensionMap)
      return defaultGetProperty(obj, key, false)
    }
  }

  return ctx
}

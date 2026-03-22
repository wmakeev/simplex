/* eslint-disable @typescript-eslint/ban-ts-comment */

// eslint-disable-next-line n/no-missing-import
import { parse } from '../parser/index.js'
import { ExpressionError, UnexpectedTypeError } from './errors.js'
import {
  getActiveErrorMapper,
  getExpressionErrorLocation
} from './error-mapping.js'
import type { ErrorMapper } from './error-mapping.js'
import {
  BinaryExpression,
  ExpressionStatement,
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
import { traverse } from './visitors.js'
import type { SourceLocation, VisitResult } from './visitors.js'
import { GEN, SCOPE_NAMES, SCOPE_VALUES, SCOPE_PARENT } from './constants.js'

export type { SourceLocation, VisitResult, ErrorMapper }
export { traverse, getExpressionErrorLocation }

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
function getExtensionMethod(
  obj: unknown,
  key: unknown,
  extensionMap: Map<string | object | Function, Record<string, Function>>,
  classesKeys: (object | Function)[],
  classesValues: Record<string, Function>[]
): Function {
  var typeofObj = typeof obj
  var methods: Record<string, Function> | undefined

  if (typeofObj === 'object') {
    for (var i = 0; i < classesKeys.length; i++) {
      // @ts-expect-error supports objects with Symbol.hasInstance
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (obj instanceof classesKeys[i]!) {
        methods = classesValues[i]
        break
      }
    }
  } else {
    methods = extensionMap.get(typeofObj)
  }

  if (methods === undefined) {
    throw new TypeError(
      `No extension methods defined for type "${typeofObj}"`
    )
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
function defaultGetProperty(
  obj: unknown,
  key: unknown,
  extension: boolean
): unknown {
  if (obj == null) return undefined

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
    if (it.opt && result == null) return result
    result = it.next(result)
  }
  return result
}

const defaultContextHelpers: ContextHelpers<
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
          // @ts-ignore
          return a in b
        } else {
          throw new TypeError(
            `Wrong "in" operator usage - key value must be a safe integer`
          )
        }
      }

      case '[object Map]':
        // @ts-ignore
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

// --- Bootstrap Code ---

const bootstrapCodeHead =
  `
    var ${GEN.bool}=ctx.castToBoolean;
    var ${GEN.str}=ctx.castToString;
    var ${GEN.bop}=ctx.binaryOperators;
    var ${GEN.lop}=ctx.logicalOperators;
    var ${GEN.uop}=ctx.unaryOperators;
    var ${GEN.call}=ctx.callFunction;
    var ${GEN.ensObj}=ctx.ensureObject;
    var ${GEN.ensArr}=ctx.ensureArray;
    var ${GEN.getIdentifierValue}=ctx.getIdentifierValue;
    var ${GEN.prop}=ctx.getProperty;
    var ${GEN.pipe}=ctx.pipe;
    var ${GEN.nna}=ctx.nonNullAssert;
    var ${GEN.globals}=ctx.globals??null;

    function ${GEN._get}(${GEN._scope},name){
      if(${GEN._scope}===null)return ${GEN.getIdentifierValue}(name,${GEN.globals},this);
      var paramIndex=${GEN._scope}[${SCOPE_NAMES}].findIndex(it=>it===name);
      if(paramIndex===-1)return ${GEN._get}.call(this,${GEN._scope}[${SCOPE_PARENT}],name);
      return ${GEN._scope}[${SCOPE_VALUES}][paramIndex]
    };

    return data=>{
      var ${GEN.scope}=null;
      var ${GEN.get}=${GEN._get}.bind(data);
      return
  `
    .split('\n')
    .map(it => it.trim())
    .filter(it => it !== '')
    .join('') + ' '

const bootstrapCodeHeadLen = bootstrapCodeHead.length

// --- Compile ---

export type CompileOptions<Data, Globals> = Partial<
  ContextHelpers<Data, Globals> &
    ExpressionOperators & {
      globals: Globals
      extensions: Map<string | object | Function, Record<string, Function>>
      errorMapper: ErrorMapper | null
    }
>

/** Compile a SimplEx expression string into an executable function. */
export function compile<
  Data = Record<string, unknown>,
  Globals = Record<string, unknown>
>(
  expression: string,
  options?: CompileOptions<Data, Globals>
): (data?: Data) => unknown {
  const tree = parse(expression) as ExpressionStatement
  const traverseResult = traverse(tree, expression)

  const { code: expressionCode, offsets } = traverseResult

  const functionCode = bootstrapCodeHead + expressionCode + '}'

  const resolvedBool = options?.castToBoolean ?? castToBoolean

  const defaultOptions: CompileOptions<Data, Globals> = {
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

  if (options?.extensions && options.extensions.size > 0 && !options.getProperty) {
    const extensionMap = options.extensions
    const classesKeys: (object | Function)[] = []
    const classesValues: Record<string, Function>[] = []

    for (const [key, methods] of extensionMap) {
      if (typeof key !== 'string') {
        classesKeys.push(key)
        classesValues.push(methods)
      }
    }

    defaultOptions.getProperty = (obj, key, extension) => {
      if (obj == null) return undefined
      if (extension)
        return getExtensionMethod(
          obj,
          key,
          extensionMap,
          classesKeys,
          classesValues
        )
      return defaultGetProperty(obj, key, false)
    }
  }

  const func = new Function('ctx', functionCode)(defaultOptions) as (
    data?: Data
  ) => unknown

  const errorMapper =
    options?.errorMapper !== undefined
      ? options.errorMapper
      : getActiveErrorMapper()

  if (errorMapper === null) return func

  return function (data?: Data) {
    try {
      return func(data)
    } catch (err) {
      throw (
        errorMapper.mapError(err, expression, offsets, bootstrapCodeHeadLen) ??
        err
      )
    }
  }
}

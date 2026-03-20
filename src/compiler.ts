/* eslint-disable @typescript-eslint/ban-ts-comment */

// eslint-disable-next-line n/no-missing-import
import { parse } from '../parser/index.js'
import { CompileError, ExpressionError, UnexpectedTypeError } from './errors.js'
import {
  BinaryExpression,
  ExpressionStatement,
  Location,
  LogicalExpression,
  UnaryExpression
} from './simplex-tree.js'
import {
  castToBoolean,
  castToString,
  ensureFunction,
  ensureNumber,
  ensureRelationalComparable,
  isSimpleValue,
  objToStringAlias,
  typeOf
} from './tools/index.js'
import { traverse } from './visitors.js'
import type { SourceLocation, VisitResult } from './visitors.js'
import {
  TOPIC_TOKEN,
  GEN,
  SCOPE_NAMES,
  SCOPE_VALUES,
  SCOPE_PARENT
} from './constants.js'

export type { SourceLocation, VisitResult }
export { traverse }

interface ContextHelpers<Data, Globals> {
  castToBoolean(this: void, val: unknown): boolean
  ensureFunction(this: void, val: unknown): Function
  getIdentifierValue(
    this: void,
    identifierName: string,
    globals: Globals,
    data: Data
  ): unknown
  getProperty(this: void, obj: unknown, key: unknown, extension: boolean): unknown
  callFunction(this: void, fn: unknown, args: unknown[] | null): unknown
  pipe(
    this: void,
    head: unknown,
    tail: { opt: boolean; fwd: boolean; next: (topic: unknown) => unknown }[]
  ): unknown
}

var hasOwn = Object.hasOwn
var ERROR_STACK_REGEX = /<anonymous>:(?<row>\d+):(?<col>\d+)/g

function defaultGetIdentifierValue(
  identifierName: string,
  globals: Record<string, unknown>,
  data: Record<string, unknown>
): unknown {
  // TODO Should test on parse time?
  if (identifierName === TOPIC_TOKEN) {
    throw new Error(
      `Topic reference "${TOPIC_TOKEN}" is unbound; it must be inside a pipe body.`
    )
  }

  if (identifierName === 'undefined') return undefined

  if (globals != null && Object.hasOwn(globals, identifierName)) {
    return globals[identifierName]
  }

  if (data != null && Object.hasOwn(data, identifierName)) {
    return data[identifierName]
  }

  throw new Error(`Unknown identifier - ${identifierName}`)
}

function defaultGetProperty(
  obj: unknown,
  key: unknown,
  extension: boolean
): unknown {
  if (extension) {
    throw new ExpressionError(
      'Extension member expression (::) is reserved and not implemented',
      '',
      null
    )
  }

  if (obj == null) return undefined

  const typeofObj = typeof obj

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

function defaultCallFunction(fn: unknown, args: unknown[] | null): unknown {
  return fn == null
    ? undefined
    : ((args === null
        ? ensureFunction(fn)()
        : ensureFunction(fn).apply(null, args)) as unknown)
}

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
  ensureFunction,
  getIdentifierValue: defaultGetIdentifierValue,
  getProperty: defaultGetProperty,
  callFunction: defaultCallFunction,
  pipe: defaultPipe
}

type ExpressionUnaryOperators = Record<
  UnaryExpression['operator'],
  (val: unknown) => unknown
>

export const defaultUnaryOperators: ExpressionUnaryOperators = {
  '+': val => ensureNumber(val),
  '-': val => -ensureNumber(val),
  'not': val => !castToBoolean(val),
  'typeof': val => typeof val
}

type ExpressionBinaryOperators = Record<
  BinaryExpression['operator'],
  (left: unknown, right: unknown) => unknown
>

const numericOp =
  (fn: (a: number, b: number) => number): ((a: unknown, b: unknown) => unknown) =>
  (a, b) => fn(ensureNumber(a) as number, ensureNumber(b) as number)

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

  // Is some container has specified key
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
            `Wrong "in" operator usage - key value should to be safe integer`
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

type LogicalOperatorFunction = (
  left: () => unknown,
  right: () => unknown
) => unknown

type ExpressionLogicalOperators = Record<
  LogicalExpression['operator'],
  LogicalOperatorFunction
>

const logicalAndOperatorFn: LogicalOperatorFunction = (a, b) =>
  castToBoolean(a()) && castToBoolean(b())

const logicalOrOperatorFn: LogicalOperatorFunction = (a, b) =>
  castToBoolean(a()) || castToBoolean(b())

export const defaultLogicalOperators: ExpressionLogicalOperators = {
  // TODO Use castToBoolean from compile options?
  'and': logicalAndOperatorFn,
  '&&': logicalAndOperatorFn,
  'or': logicalOrOperatorFn,
  '||': logicalOrOperatorFn
}

interface ExpressionOperators {
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

function mapRuntimeError(
  err: unknown,
  expression: string,
  offsets: SourceLocation[]
): ExpressionError | null {
  if (!(err instanceof Error)) return null

  const evalRow = err.stack
    ?.split('\n')
    .map(r => r.trim())
    .find(r => r.startsWith('at eval '))
  if (!evalRow) return null

  ERROR_STACK_REGEX.lastIndex = 0
  const match = ERROR_STACK_REGEX.exec(evalRow)
  const rowStr = match?.groups?.['row']
  const colStr = match?.groups?.['col']
  if (!rowStr || !colStr) return null

  const row = Number.parseInt(rowStr)
  if (row !== 3) return null

  const col = Number.parseInt(colStr)
  const adjustedCol = col - bootstrapCodeHeadLen
  if (adjustedCol < 0) return null

  const location = getExpressionErrorLocation(adjustedCol, offsets)
  return new ExpressionError(err.message, expression, location, { cause: err })
}

function getExpressionErrorLocation(
  colOffset: number,
  locations: SourceLocation[]
): Location | null {
  var curCol = 0
  for (const loc of locations) {
    curCol += loc.len
    if (curCol >= colOffset) return loc.location
  }
  return null
}

const bootstrapCodeHead =
  `
    var ${GEN.bool}=ctx.castToBoolean;
    var ${GEN.bop}=ctx.binaryOperators;
    var ${GEN.lop}=ctx.logicalOperators;
    var ${GEN.uop}=ctx.unaryOperators;
    var ${GEN.call}=ctx.callFunction;
    var ${GEN.getIdentifierValue}=ctx.getIdentifierValue;
    var ${GEN.prop}=ctx.getProperty;
    var ${GEN.pipe}=ctx.pipe;
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

export type CompileOptions<Data, Globals> = Partial<
  ContextHelpers<Data, Globals> & ExpressionOperators & { globals: Globals }
>

export function compile<
  Data = Record<string, unknown>,
  Globals = Record<string, unknown>
>(
  expression: string,
  options?: CompileOptions<Data, Globals>
): (data?: Data) => unknown {
  const tree = parse(expression) as ExpressionStatement
  let traverseResult

  try {
    traverseResult = traverse(tree)
  } catch (err) {
    // TODO Use class to access expression from visitors?
    if (err instanceof CompileError) {
      err.expression = expression
    }
    throw err
  }

  const { code: expressionCode, offsets } = traverseResult

  const functionCode = bootstrapCodeHead + expressionCode + '}'

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const defaultOptions: CompileOptions<Data, Globals> = {
    ...defaultContextHelpers,
    ...{
      unaryOperators: defaultUnaryOperators,
      binaryOperators: defaultBinaryOperators,
      logicalOperators: defaultLogicalOperators
    },
    ...(options as any)
  }

  const func = new Function('ctx', functionCode)(defaultOptions) as (
    data?: Data
  ) => unknown

  return function (data?: Data) {
    try {
      return func(data)
    } catch (err) {
      throw mapRuntimeError(err, expression, offsets) ?? err
    }
  }
}

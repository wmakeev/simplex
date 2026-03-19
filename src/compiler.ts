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
import assert from 'node:assert'
import { castToBoolean } from './tools/cast.js'
import {
  ensureFunction,
  ensureRelationalComparable,
  ensureNumber
} from './tools/ensure.js'
import { isSimpleValue } from './tools/guards.js'
import { castToString, objToStringAlias, typeOf } from './tools/index.js'
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
  getProperty(this: void, obj: unknown, key: unknown): unknown
  callFunction(this: void, fn: unknown, args: unknown[] | null): unknown
  pipe(
    this: void,
    head: unknown,
    tail: { opt: boolean; next: (topic: unknown) => unknown }[]
  ): unknown
}

var hasOwn = Object.hasOwn
var ERROR_STACK_REGEX = /<anonymous>:(?<row>\d+):(?<col>\d+)/g

const defaultContextHelpers: ContextHelpers<
  Record<string, unknown>,
  Record<string, unknown>
> = {
  castToBoolean,

  ensureFunction,

  getIdentifierValue: (identifierName, globals, data) => {
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
  },

  getProperty(obj, key) {
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
  },

  callFunction(fn, args) {
    return fn == null
      ? undefined
      : ((args === null
          ? ensureFunction(fn)()
          : ensureFunction(fn).apply(null, args)) as unknown)
  },

  pipe(head, tail) {
    var result = head
    for (const it of tail) {
      if (it.opt && result == null) return result
      result = it.next(result)
    }
    return result
  }
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

export const defaultBinaryOperators: ExpressionBinaryOperators = {
  '!=': (a, b) => a !== b,

  '==': (a, b) => a === b,

  // TIPS give the opportunity to get a base js error

  '*': (a, b) => {
    // @ts-expect-error
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return ensureNumber(a) * ensureNumber(b)
  },

  '+': (a, b) => {
    // @ts-expect-error
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-plus-operands
    return ensureNumber(a) + ensureNumber(b)
  },

  '-': (a, b) => {
    // @ts-expect-error
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return ensureNumber(a) - ensureNumber(b)
  },

  '/': (a, b) => {
    // @ts-expect-error
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return ensureNumber(a) / ensureNumber(b)
  },

  'mod': (a, b) => {
    // @ts-expect-error
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return ensureNumber(a) % ensureNumber(b)
  },

  '^': (a, b) => {
    // @ts-expect-error
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return ensureNumber(a) ** ensureNumber(b)
  },

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
      if (err instanceof Error === false) throw err

      const stackRows = err.stack?.split('\n').map(row => row.trim())

      const evalRow = stackRows?.find(row => row.startsWith('at eval '))

      if (evalRow === undefined) {
        throw err
      }

      ERROR_STACK_REGEX.lastIndex = 0
      const match = ERROR_STACK_REGEX.exec(evalRow)

      if (match == null) {
        throw err
      }

      const rowOffsetStr = match.groups?.['row']
      const colOffsetStr = match.groups?.['col']

      if (rowOffsetStr === undefined || colOffsetStr === undefined) {
        throw err
      }

      const rowOffset = Number.parseInt(rowOffsetStr)
      assert.equal(rowOffset, 3)

      const colOffset = Number.parseInt(colOffsetStr)
      const adjustedColOffset = colOffset - bootstrapCodeHeadLen
      assert.ok(adjustedColOffset >= 0)

      const errorLocation = getExpressionErrorLocation(
        adjustedColOffset,
        offsets
      )

      throw new ExpressionError(err.message, expression, errorLocation, {
        cause: err
      })
    }
  }
}

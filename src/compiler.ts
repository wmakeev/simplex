/* eslint-disable @typescript-eslint/ban-ts-comment */

// eslint-disable-next-line n/no-missing-import
import { parse } from '../parser/index.js'
import { ExpressionError, UnexpectedTypeError } from './errors.js'
import {
  BinaryExpression,
  Expression,
  ExpressionByType,
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
import { castToString, typeOf } from './tools/index.js'

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
    tail: { opt: boolean; next: (_: unknown) => unknown }[]
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
    if (obj == null) return obj

    if (typeof obj !== 'object') {
      throw new UnexpectedTypeError(['object'], obj)
    }

    if (isSimpleValue(key) === false) {
      throw new UnexpectedTypeError(['simple type object key'], key)
    }

    if (hasOwn(obj, key as any)) {
      // @ts-expect-error Type cannot be used as an index type
      return obj[key] as unknown
    }

    return undefined
  },

  callFunction(fn, args) {
    return (
      args === null
        ? ensureFunction(fn)()
        : ensureFunction(fn).apply(null, args)
    ) as unknown
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
  BinaryExpression['operator'] | LogicalExpression['operator'],
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

  'in': (a, b) => {
    if (isSimpleValue(a) && b != null && typeof b === 'object') {
      return Object.hasOwn(b, a as any)
    } else {
      throw new TypeError(
        `Cannot use "in" operator to search for ${typeOf(a)} key in ${typeOf(b)}`
      )
    }
  },

  'and': (a, b) => castToBoolean(a) && castToBoolean(b),

  'or': (a, b) => castToBoolean(a) || castToBoolean(b)
}

interface ExpressionOperators {
  unaryOperators: Record<UnaryExpression['operator'], (val: unknown) => unknown>
  binaryOperators: Record<
    BinaryExpression['operator'] | LogicalExpression['operator'],
    (left: unknown, right: unknown) => unknown
  >
}

const PIPE_LTR = '_'

export interface SourceLocation {
  len: number
  location: Location
}

export interface VisitResult {
  code: string
  offsets: SourceLocation[]
}

type Visit = (node: Expression) => VisitResult[]

const codePart = (
  codePart: string,
  ownerNode: { location: Location }
): VisitResult => ({
  code: codePart,
  offsets: [{ len: codePart.length, location: ownerNode.location }]
})

const combineVisitResults = (parts: VisitResult[]) => {
  return parts.reduce((res, it) => {
    return {
      code: res.code + it.code,
      offsets: res.offsets.concat(it.offsets)
    } as VisitResult
  })
}

const visitors: {
  [P in keyof ExpressionByType]: (
    node: ExpressionByType[P],
    visit: Visit
  ) => VisitResult[]
} = {
  Literal: node => {
    const parts: VisitResult[] = [codePart(JSON.stringify(node.value), node)]

    return parts
  },

  Identifier: node => {
    if (node.name === PIPE_LTR) return [codePart(PIPE_LTR, node)]

    const parts: VisitResult[] = [
      codePart(`get(${JSON.stringify(node.name)})`, node)
    ]

    return parts
  },

  UnaryExpression: (node, visit) => {
    const parts: VisitResult[] = [
      codePart(`uop["${node.operator}"](`, node),
      ...visit(node.argument),
      codePart(')', node)
    ]

    return parts
  },

  BinaryExpression: (node, visit) => {
    const parts: VisitResult[] = [
      codePart(`bop["${node.operator}"](`, node),
      ...visit(node.left),
      codePart(',', node),
      ...visit(node.right),
      codePart(')', node)
    ]

    return parts
  },

  LogicalExpression: (node, visit) => {
    const parts: VisitResult[] = [
      codePart(`bop["${node.operator}"](`, node),
      ...visit(node.left),
      codePart(',', node),
      ...visit(node.right),
      codePart(')', node)
    ]

    return parts
  },

  ConditionalExpression: (node, visit) => {
    const parts: VisitResult[] = [
      codePart('(bool(', node),
      ...visit(node.test),
      codePart(')?', node),
      ...visit(node.consequent),
      codePart(':', node),
      ...(node.alternate !== null
        ? visit(node.alternate)
        : [codePart('undefined', node)]),
      codePart(')', node)
    ]

    return parts
  },

  ObjectExpression: (node, visit) => {
    const innerObj = node.properties
      .map((p): [VisitResult, VisitResult[]] => {
        if (p.key.type === 'Identifier') {
          return [codePart(p.key.name, p), visit(p.value)]
        }
        //
        else if (p.key.type === 'Literal') {
          // TODO look for ECMA spec
          return [codePart(JSON.stringify(p.key.value), p), visit(p.value)]
        }
        //
        else {
          // TODO Restrict on parse step
          // TODO Error with locations
          throw new TypeError(`Incorrect object key type ${p.key.type}`)
        }
      })
      .flatMap(([k, v]) => {
        return [k, codePart(':', node), ...v, codePart(',', node)]
      })

    // remove last comma
    if (innerObj.length > 1) {
      innerObj.pop()
    }

    const parts: VisitResult[] = [
      codePart('{', node),
      ...innerObj,
      codePart('}', node)
    ]

    return parts
  },

  ArrayExpression: (node, visit) => {
    const innerArrParts = node.elements.flatMap(el => {
      return el === null
        ? [codePart(',', node)]
        : [...visit(el), codePart(',', node)]
    })

    // remove last comma
    if (innerArrParts.length > 1) {
      innerArrParts.pop()
    }

    const parts: VisitResult[] = [
      codePart('[', node),
      ...innerArrParts,
      codePart(']', node)
    ]

    return parts
  },

  MemberExpression: (node, visit) => {
    const { computed, object, property } = node

    // TODO Pass computed to prop?

    const parts: VisitResult[] = [
      codePart('prop(', node),
      ...visit(object),
      codePart(',', node),
      ...(computed
        ? visit(property)
        : [codePart(JSON.stringify(property.name), property)]),
      codePart(')', node)
    ]

    return parts
  },

  CallExpression: (node, visit) => {
    const innerArgs =
      node.arguments.length > 0
        ? node.arguments.flatMap(arg => [...visit(arg), codePart(',', node)])
        : null

    // remove last comma
    innerArgs?.pop()

    const parts: VisitResult[] = [
      codePart('call(', node),
      ...visit(node.callee),
      codePart(',', node),
      ...(innerArgs === null
        ? [codePart('null', node)]
        : [codePart('[', node), ...innerArgs, codePart(']', node)]),
      codePart(')', node)
    ]

    return parts
  },

  NullishCoalescingExpression: (node, visit) => {
    const parts: VisitResult[] = [
      codePart('(', node),
      ...visit(node.left),
      codePart('??', node),
      ...visit(node.right),
      codePart(')', node)
    ]

    return parts
  },

  PipeSequence: (node, visit) => {
    const headCode = visit(node.head)

    const tailsCodeArrInner = node.tail.flatMap(t => {
      const opt = t.operator === '|?'

      const tailParts: VisitResult[] = [
        codePart(
          `{opt:${opt},next:function(${PIPE_LTR}){return `,
          t.expression
        ),
        ...visit(t.expression),
        codePart(`}}`, t.expression),
        codePart(`,`, t.expression)
      ]

      return tailParts
    })

    // remove last comma
    tailsCodeArrInner.pop()

    const parts: VisitResult[] = [
      codePart('pipe(', node),
      ...headCode,
      codePart(',[', node),
      ...tailsCodeArrInner,
      codePart('])', node)
    ]

    return parts
  }
}

const visit: (
  node: Expression,
  parentNode: Expression | null
) => VisitResult[] = node => {
  const nodeTypeVisitor = visitors[node.type]

  if (nodeTypeVisitor === undefined) {
    throw new Error(`No handler for node type - ${node.type}`)
  }

  const innerVisit: Visit = (childNode: Expression) => {
    return visit(childNode, node)
  }

  // @ts-expect-error skip node is never
  return nodeTypeVisitor(node, innerVisit)
}

export function traverse(tree: ExpressionStatement): VisitResult {
  return combineVisitResults(visit(tree.expression, null))
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

export type CompileOptions<Data, Globals> = Partial<
  ContextHelpers<Data, Globals> & ExpressionOperators & { globals: Globals }
>

export function compile<Data = Record<string, unknown>, Globals = null>(
  expression: string,
  options?: CompileOptions<Data, Globals>
): (data?: Data) => unknown {
  const tree = parse(expression) as ExpressionStatement
  const traverseResult = traverse(tree)

  const { code: expressionCode, offsets } = traverseResult

  const bootstrapCodeHead = [
    `var bool = ctx.castToBoolean;`,
    `var bop = ctx.binaryOperators;`,
    `var uop = ctx.unaryOperators;`,
    `var call = ctx.callFunction;`,
    `var getIdentifierValue = ctx.getIdentifierValue;`,
    `var prop = ctx.getProperty;`,
    `var pipe = ctx.pipe;`,
    `var globals = ctx.globals ?? null;`,
    `return data => {`,
    `var get = name => getIdentifierValue(name, globals, data);`,
    `return `
  ].join('')

  const bootstrapCodeHeadLen = bootstrapCodeHead.length

  const functionCode = bootstrapCodeHead + expressionCode + ';}'

  const func = new Function('ctx', functionCode)({
    ...defaultContextHelpers,
    ...{
      unaryOperators: defaultUnaryOperators,
      binaryOperators: defaultBinaryOperators
    },
    ...options
  }) as (data?: Data) => unknown

  return function (data?: Data) {
    try {
      return func(data)
    } catch (err) {
      assert.ok(err instanceof Error)

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

      throw new ExpressionError(err, errorLocation)
    }
  }
}

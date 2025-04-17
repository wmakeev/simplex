/* eslint-disable @typescript-eslint/ban-ts-comment */

// eslint-disable-next-line n/no-missing-import
import { parse } from '../parser/index.js'
import { CompileError, ExpressionError, UnexpectedTypeError } from './errors.js'
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
    tail: { opt: boolean; next: (topic: unknown) => unknown }[]
  ): unknown
}

var hasOwn = Object.hasOwn
var ERROR_STACK_REGEX = /<anonymous>:(?<row>\d+):(?<col>\d+)/g
var TOPIC_TOKEN = '%'

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

  'in': (a, b) => {
    if (isSimpleValue(a) && b != null && typeof b === 'object') {
      return Object.hasOwn(b, a as any)
    } else {
      throw new TypeError(
        `Cannot use "in" operator to search for ${typeOf(a)} key in ${typeOf(b)}`
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
    const parts: VisitResult[] = [
      codePart(`get(scope,${JSON.stringify(node.name)})`, node)
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
      codePart(`lop["${node.operator}"](()=>(`, node),
      ...visit(node.left),
      codePart('),()=>(', node),
      ...visit(node.right),
      codePart('))', node)
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
    if (node.arguments.length > 0) {
      const innerArgs = node.arguments.flatMap((arg, index) => [
        ...(arg.type === 'CurryPlaceholder'
          ? [codePart(`a${index}`, arg)]
          : visit(arg)),
        codePart(',', node)
      ])

      const curriedArgs = node.arguments.flatMap((arg, index) =>
        arg.type === 'CurryPlaceholder' ? [`a${index}`] : []
      )

      // remove last comma
      innerArgs?.pop()

      // call({{callee}},[{{arguments}}])
      let parts: VisitResult[] = [
        codePart('call(', node),
        ...visit(node.callee),
        codePart(',[', node),
        ...innerArgs,
        codePart('])', node)
      ]

      if (curriedArgs.length > 0) {
        parts = [
          codePart(`(scope=>(${curriedArgs.join()})=>`, node),
          ...parts,
          codePart(')(scope)', node)
        ]
      }

      return parts
    }

    //
    else {
      const parts: VisitResult[] = [
        codePart('call(', node),
        ...visit(node.callee),
        codePart(',null)', node)
      ]

      return parts
    }
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
          `{opt:${opt},next:(scope=>topic=>{scope=[["%"],[topic],scope];return `,
          t.expression
        ),
        ...visit(t.expression),
        codePart(`})(scope)}`, t.expression),
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
  },

  TopicReference: node => {
    const parts: VisitResult[] = [codePart(`get(scope,"${TOPIC_TOKEN}")`, node)]
    return parts
  },

  LambdaExpression: (node, visit) => {
    // Lambda with parameters
    if (node.params.length > 0) {
      const paramsNames = node.params.map(p => p.name)

      const fnParams = Array.from(
        { length: paramsNames.length },
        (_, index) => `p${index}`
      )

      const fnParamsList = fnParams.join()
      const fnParamsNamesList = paramsNames.map(p => JSON.stringify(p)).join()

      // TODO Is "...args" more performant?
      // (params => function (p0, p1) {
      //   var scope = [params, [p0, p1], scope]
      //   return {{code}}
      // })(["a", "b"])
      const parts: VisitResult[] = [
        codePart(
          `((scope,params)=>function(${fnParamsList}){scope=[params,[${fnParamsList}],scope];return `,
          node
        ),
        ...visit(node.expression),
        codePart(`})(scope,[${fnParamsNamesList}])`, node)
      ]

      return parts
    }

    // Lambda without parameters
    else {
      // (() => {{code}})
      const parts: VisitResult[] = [
        codePart(`(()=>`, node),
        ...visit(node.expression),
        codePart(`)`, node)
      ]

      return parts
    }
  },

  LetExpression: (node, visit) => {
    const declarationsNamesSet = new Set()

    for (const d of node.declarations) {
      if (declarationsNamesSet.has(d.id.name)) {
        throw new CompileError(
          `"${d.id.name}" name defined inside let expression was repeated`,
          '',
          d.id.location
        )
      }
      declarationsNamesSet.add(d.id.name)
    }

    // (scope=> {
    //   var _varNames = [];
    //   var _varValues = [];
    //   scope = [_varNames, _varValues, scope];

    //   // a = {{init}}
    //   _varNames.push("a");
    //   _varValues.push({{init}});

    //   // {{expression}}
    //   return {{expression}}
    // })(scope)

    const parts: VisitResult[] = [
      codePart(
        `(scope=>{var _varNames=[];var _varValues=[];scope=[_varNames,_varValues,scope];`,
        node
      ),
      ...node.declarations.flatMap(d => [
        codePart(`_varValues.push(`, d),
        ...visit(d.init),
        codePart(`);`, d),
        codePart(`_varNames.push(`, d),
        codePart(JSON.stringify(d.id.name), d.id),
        codePart(`);`, d)
      ]),
      codePart(`return `, node),
      ...visit(node.expression),
      codePart(`})(scope)`, node)
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

  const bootstrapCodeHead =
    `
    var bool=ctx.castToBoolean;
    var bop=ctx.binaryOperators;
    var lop=ctx.logicalOperators;
    var uop=ctx.unaryOperators;
    var call=ctx.callFunction;
    var getIdentifierValue=ctx.getIdentifierValue;
    var prop=ctx.getProperty;
    var pipe=ctx.pipe;
    var globals=ctx.globals??null;

    function _get(_scope,name){
      if(_scope===null)return getIdentifierValue(name,globals,this);
      var paramIndex=_scope[0].findIndex(it=>it===name);
      if(paramIndex===-1)return _get.call(this,_scope[2],name);
      return _scope[1][paramIndex]
    };

    return data=>{
      var scope=null;
      var get=_get.bind(data);
      return
  `
      .split('\n')
      .map(it => it.trim())
      .filter(it => it !== '')
      .join('') + ' '

  const bootstrapCodeHeadLen = bootstrapCodeHead.length

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

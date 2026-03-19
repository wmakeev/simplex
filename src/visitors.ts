import { CompileError } from './errors.js'
import { TOPIC_TOKEN, GEN } from './constants.js'
import {
  Expression,
  ExpressionByType,
  ExpressionStatement,
  Location
} from './simplex-tree.js'

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

/** Build a comma-separated list of VisitResult[] segments. */
const commaSeparated = (
  items: VisitResult[][],
  commaNode: { location: Location }
): VisitResult[] => {
  if (items.length === 0) return []
  return items.flatMap((item, i) =>
    i < items.length - 1 ? [...item, codePart(',', commaNode)] : item
  )
}

/** Wrap visited args as `fnName(arg1, arg2, ...)`. */
const wrapCall = (
  fnName: string,
  node: { location: Location },
  ...args: VisitResult[][]
): VisitResult[] => [
  codePart(`${fnName}(`, node),
  ...commaSeparated(args, node),
  codePart(')', node)
]

/** Wrap visited args as `registry["op"](arg1, arg2, ...)`. */
const wrapOp = (
  registry: string,
  operator: string,
  node: { location: Location },
  ...args: VisitResult[][]
): VisitResult[] => [
  codePart(`${registry}["${operator}"](`, node),
  ...commaSeparated(args, node),
  codePart(')', node)
]

/** Wrap visit results as a thunk: `()=>(...)`. */
const thunk = (
  node: { location: Location },
  parts: VisitResult[]
): VisitResult[] => [codePart('()=>(', node), ...parts, codePart(')', node)]

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
      codePart(`${GEN.get}(${GEN.scope},${JSON.stringify(node.name)})`, node)
    ]

    return parts
  },

  UnaryExpression: (node, visit) =>
    wrapOp(GEN.uop, node.operator, node, visit(node.argument)),

  BinaryExpression: (node, visit) =>
    wrapOp(GEN.bop, node.operator, node, visit(node.left), visit(node.right)),

  LogicalExpression: (node, visit) =>
    wrapOp(
      GEN.lop,
      node.operator,
      node,
      thunk(node, visit(node.left)),
      thunk(node, visit(node.right))
    ),

  ConditionalExpression: (node, visit) => {
    const parts: VisitResult[] = [
      codePart(`(${GEN.bool}(`, node),
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
    const items = node.properties.map(p => {
      let key: VisitResult
      if (p.key.type === 'Identifier') {
        key = codePart(p.key.name, p)
      } else if (p.key.type === 'Literal') {
        // TODO look for ECMA spec
        key = codePart(JSON.stringify(p.key.value), p)
      } else {
        // TODO Restrict on parse step
        // TODO Error with locations
        throw new TypeError(`Incorrect object key type ${p.key.type}`)
      }
      return [key, codePart(':', node), ...visit(p.value)]
    })

    return [
      codePart('{', node),
      ...commaSeparated(items, node),
      codePart('}', node)
    ]
  },

  ArrayExpression: (node, visit) => {
    const items = node.elements.map(el => (el === null ? [] : visit(el)))

    return [
      codePart('[', node),
      ...commaSeparated(items, node),
      codePart(']', node)
    ]
  },

  MemberExpression: (node, visit) => {
    const { computed, object, property } = node

    // TODO Pass computed to prop?

    const propertyPart = computed
      ? visit(property)
      : [codePart(JSON.stringify(property.name), property)]

    return wrapCall(GEN.prop, node, visit(object), propertyPart)
  },

  CallExpression: (node, visit) => {
    if (node.arguments.length > 0) {
      const items = node.arguments.map((arg, index) =>
        arg.type === 'CurryPlaceholder'
          ? [codePart(`a${index}`, arg)]
          : visit(arg)
      )

      const curriedArgs = node.arguments.flatMap((arg, index) =>
        arg.type === 'CurryPlaceholder' ? [`a${index}`] : []
      )

      // call({{callee}},[{{arguments}}])
      let parts: VisitResult[] = [
        codePart(`${GEN.call}(`, node),
        ...visit(node.callee),
        codePart(',[', node),
        ...commaSeparated(items, node),
        codePart('])', node)
      ]

      if (curriedArgs.length > 0) {
        parts = [
          codePart(`(${GEN.scope}=>(${curriedArgs.join()})=>`, node),
          ...parts,
          codePart(`)(${GEN.scope})`, node)
        ]
      }

      return parts
    }

    //
    else {
      const parts: VisitResult[] = [
        codePart(`${GEN.call}(`, node),
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

    const items = node.tail.map(t => {
      const opt = t.operator === '|?'
      return [
        codePart(
          `{opt:${opt},next:(${GEN.scope}=>topic=>{${GEN.scope}=[["${TOPIC_TOKEN}"],[topic],${GEN.scope}];return `,
          t.expression
        ),
        ...visit(t.expression),
        codePart(`})(${GEN.scope})}`, t.expression)
      ]
    })

    return [
      codePart(`${GEN.pipe}(`, node),
      ...headCode,
      codePart(',[', node),
      ...commaSeparated(items, node),
      codePart('])', node)
    ]
  },

  TopicReference: node => {
    const parts: VisitResult[] = [
      codePart(`${GEN.get}(${GEN.scope},"${TOPIC_TOKEN}")`, node)
    ]
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
          `((${GEN.scope},params)=>function(${fnParamsList}){${GEN.scope}=[params,[${fnParamsList}],${GEN.scope}];return `,
          node
        ),
        ...visit(node.expression),
        codePart(`})(${GEN.scope},[${fnParamsNamesList}])`, node)
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
        `(${GEN.scope}=>{var ${GEN._varNames}=[];var ${GEN._varValues}=[];${GEN.scope}=[${GEN._varNames},${GEN._varValues},${GEN.scope}];`,
        node
      ),
      ...node.declarations.flatMap(d => [
        codePart(`${GEN._varValues}.push(`, d),
        ...visit(d.init),
        codePart(`);`, d),
        codePart(`${GEN._varNames}.push(`, d),
        codePart(JSON.stringify(d.id.name), d.id),
        codePart(`);`, d)
      ]),
      codePart(`return `, node),
      ...visit(node.expression),
      codePart(`})(${GEN.scope})`, node)
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

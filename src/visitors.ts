import { CompileError } from './errors.js'
import { TOPIC_TOKEN, GEN } from './constants.js'
import {
  Expression,
  ExpressionByType,
  ExpressionStatement,
  Location
} from './simplex-tree.js'

// --- Visitor Helpers ---

export interface SourceLocation {
  len: number
  location: Location
}

export interface VisitResult {
  code: string
  offsets: SourceLocation[]
}

export interface TraverseContext {
  expression: string
  insidePipe: boolean
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

// --- AST Visitors ---

const visitors: {
  [P in keyof ExpressionByType]: (
    node: ExpressionByType[P],
    visit: Visit,
    context: TraverseContext
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

  ObjectExpression: (node, visit, context) => {
    const items = node.properties.map(p => {
      if (p.type === 'SpreadElement') {
        return [
          codePart(`...${GEN.ensObj}(`, p),
          ...visit(p.argument),
          codePart(')', p)
        ]
      }
      let keyParts: VisitResult[]
      if (p.computed) {
        keyParts = [codePart('[', p), ...visit(p.key), codePart(']', p)]
      } else if (p.key.type === 'Identifier') {
        keyParts = [codePart(p.key.name, p)]
      } else if (p.key.type === 'Literal') {
        // JSON.stringify(Infinity) returns "null", producing wrong key
        if (typeof p.key.value === 'number' && !Number.isFinite(p.key.value)) {
          throw new CompileError(
            `Invalid object key: ${p.key.value}`,
            context.expression,
            p.key.location
          )
        }
        keyParts = [codePart(JSON.stringify(p.key.value), p)]
      } else {
        // Unreachable: grammar restricts keys to Identifier and Literal
        throw new CompileError(
          `Unsupported object key type: ${p.key.type}`,
          context.expression,
          p.key.location
        )
      }
      return [...keyParts, codePart(':', node), ...visit(p.value)]
    })

    return [
      codePart('{', node),
      ...commaSeparated(items, node),
      codePart('}', node)
    ]
  },

  ArrayExpression: (node, visit) => {
    const items = node.elements.map(el => {
      if (el === null) return []
      if (el.type === 'SpreadElement') {
        return [
          codePart(`...${GEN.ensArr}(`, el),
          ...visit(el.argument),
          codePart(')', el)
        ]
      }
      return visit(el)
    })

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

    const extension = !computed && node.extension === true
    return wrapCall(GEN.prop, node, visit(object), propertyPart, [
      codePart(String(extension), node)
    ])
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
    } else {
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

  PipeSequence: (node, visit, context) => {
    const headCode = visit(node.head)

    const prevInsidePipe = context.insidePipe
    context.insidePipe = true

    const items = node.tail.map(t => {
      const opt = t.operator === '|?'
      const fwd = t.operator === '|>'
      return [
        codePart(
          `{opt:${opt},fwd:${fwd},next:(${GEN.scope}=>topic=>{${GEN.scope}=[["${TOPIC_TOKEN}"],[topic],${GEN.scope}];return `,
          t.expression
        ),
        ...visit(t.expression),
        codePart(`})(${GEN.scope})}`, t.expression)
      ]
    })

    context.insidePipe = prevInsidePipe

    return [
      codePart(`${GEN.pipe}(`, node),
      ...headCode,
      codePart(',[', node),
      ...commaSeparated(items, node),
      codePart('])', node)
    ]
  },

  TopicReference: (node, _visit, context) => {
    if (!context.insidePipe) {
      throw new CompileError(
        `Topic reference "${TOPIC_TOKEN}" is unbound; it must be inside a pipe body`,
        context.expression,
        node.location
      )
    }
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

  TemplateLiteral: (node, visit) => {
    const { quasis, expressions, tag } = node

    // --- Tagged template literal ---
    if (tag !== null) {
      const quasisItems = quasis.map(q => [codePart(JSON.stringify(q.value), q)])
      const quasisArray: VisitResult[] = [
        codePart('[', node),
        ...commaSeparated(quasisItems, node),
        codePart(']', node)
      ]
      const allArgs = [quasisArray, ...expressions.map(e => visit(e))]
      return [
        codePart(`${GEN.call}(`, node),
        ...visit(tag),
        codePart(',[', node),
        ...commaSeparated(allArgs, node),
        codePart('])', node)
      ]
    }

    // No interpolations → emit as plain string literal
    if (expressions.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return [codePart(JSON.stringify(quasis[0]!.value), node)]
    }

    const parts: VisitResult[] = [codePart('(', node)]

    for (let i = 0; i < quasis.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const quasi = quasis[i]!
      const expr = expressions[i]

      // Add "+" between parts (skip before the first part)
      if (i > 0) {
        parts.push(codePart('+', node))
      }

      // Emit the static string part
      if (quasi.value !== '' || expr == null) {
        parts.push(codePart(JSON.stringify(quasi.value), quasi))
        if (expr != null) {
          parts.push(codePart('+', node))
        }
      }

      // Emit the interpolated expression wrapped in castToString
      if (expr != null) {
        parts.push(codePart(`${GEN.str}(`, node))
        parts.push(...visit(expr))
        parts.push(codePart(')', node))
      }
    }

    parts.push(codePart(')', node))
    return parts
  },

  LetExpression: (node, visit, context) => {
    const declarationsNamesSet = new Set()

    for (const d of node.declarations) {
      if (declarationsNamesSet.has(d.id.name)) {
        throw new CompileError(
          `"${d.id.name}" name defined inside let expression was repeated`,
          context.expression,
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

// --- Traverse ---

const visit = (
  node: Expression,
  _parentNode: Expression | null,
  context: TraverseContext
): VisitResult[] => {
  const nodeTypeVisitor = visitors[node.type]

  if (nodeTypeVisitor === undefined) {
    throw new Error(`No handler for node type - ${node.type}`)
  }

  const innerVisit: Visit = (childNode: Expression) => {
    return visit(childNode, node, context)
  }

  // @ts-expect-error skip node is never
  return nodeTypeVisitor(node, innerVisit, context)
}

/** Walk the AST and produce generated JS code with source location offsets. */
export function traverse(
  tree: ExpressionStatement,
  expression: string
): VisitResult {
  const context: TraverseContext = { expression, insidePipe: false }
  return combineVisitResults(visit(tree.expression, null, context))
}

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
        // Non-finite keys are rejected up front by the shared validate() pass.
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

  NonNullAssertExpression: (node, visit) =>
    wrapCall(GEN.nna, node, visit(node.expression)),

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
      codePart('((_v=>_v==null||_v!==_v?(', node),
      ...visit(node.right),
      codePart('):_v)(', node),
      ...visit(node.left),
      codePart('))', node)
    ]

    return parts
  },

  PipeSequence: (node, visit) => {
    const headCode = visit(node.head)

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

    return [
      codePart(`${GEN.pipe}(`, node),
      ...headCode,
      codePart(',[', node),
      ...commaSeparated(items, node),
      codePart('])', node)
    ]
  },

  TopicReference: node => {
    // Unbound `%` (outside a pipe body) is rejected by the shared validate() pass.
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

      // The frame must be a fresh per-invocation local (`var scope`), NOT a
      // reassignment of the closure-captured variable: all invocations of one
      // lambda instance share that captured binding, so mutating it leaks
      // frames of completed calls into subsequent ones (breaks expressions
      // with two+ recursive self-calls, e.g. Fibonacci — see issue #30).
      const parts: VisitResult[] = [
        codePart(
          `((${GEN._scope},params)=>function(${fnParamsList}){var ${GEN.scope}=[params,[${fnParamsList}],${GEN._scope}];return `,
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

  LetExpression: (node, visit) => {
    // Duplicate binding names are rejected by the shared validate() pass.

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
  const context: TraverseContext = { expression }
  return combineVisitResults(visit(tree.expression, null, context))
}

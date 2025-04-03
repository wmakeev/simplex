export type Expression =
  | ArrayExpression
  | BinaryExpression
  | CallExpression
  | ConditionalExpression
  | IdentifierExpression
  | LogicalExpression
  | LiteralExpression
  | MemberExpression
  | ObjectExpression
  | NullishCoalescingExpression
  | PipeSequence
  | UnaryExpression
  | LambdaExpression
  | LetExpression

export type ExpressionType = Expression['type']

export type ExpressionByType = {
  [P in ExpressionType]: Extract<Expression, { type: P }>
}

export interface LocationOffset {
  offset: number
  line: number
  column: number
}

export interface Location {
  start: LocationOffset
  end: LocationOffset
}

export interface ExpressionStatement {
  type: 'ExpressionStatement'
  expression: Expression
  location: Location
}

export interface LiteralExpression {
  type: 'Literal'
  value: string | number | null | boolean
  location: Location
}

export interface IdentifierExpression {
  type: 'Identifier'
  name: string
  location: Location
}

export interface PropertyAssignment {
  type: 'Property'
  key: Expression
  value: Expression
  kind: 'init'
  location: Location
}

export interface ObjectExpression {
  type: 'ObjectExpression'
  properties: PropertyAssignment[]
  location: Location
}

export interface ArrayExpression {
  type: 'ArrayExpression'
  elements: (Expression | null)[]
  location: Location
}

export type MemberExpression =
  | {
      type: 'MemberExpression'
      computed: false
      extension: boolean
      object: IdentifierExpression | ObjectExpression | ArrayExpression
      property: IdentifierExpression
      location: Location
    }
  | {
      type: 'MemberExpression'
      computed: true
      object: IdentifierExpression | ObjectExpression | ArrayExpression
      property: Expression
      location: Location
    }

export interface CallExpression {
  type: 'CallExpression'
  callee: Expression
  arguments: (Expression | CurryPlaceholder)[]
  location: Location
}

export interface CurryPlaceholder {
  type: 'CurryPlaceholder'
  location: Location
}

export interface UnaryExpression {
  type: 'UnaryExpression'
  operator: '-' | '+' | 'not' | 'typeof'
  argument: Expression
  prefix: true
  location: Location
}

export interface BinaryExpression {
  type: 'BinaryExpression'
  operator:
    | '+'
    | '-'
    | '*'
    | '/'
    | 'mod'
    | '=='
    | '!='
    | '>'
    | '>='
    | '<'
    | '<='
    | 'in'
    | '^'
    | '&'
  left: Expression
  right: Expression
  location: Location
}

export interface LogicalExpression {
  type: 'LogicalExpression'
  operator: 'and' | 'or'
  left: Expression
  right: Expression
  location: Location
}

export interface ConditionalExpression {
  type: 'ConditionalExpression'
  test: Expression
  consequent: Expression
  alternate: Expression | null
  location: Location
}

export interface NullishCoalescingExpression {
  type: 'NullishCoalescingExpression'
  operator: '??'
  left: Expression
  right: Expression
  location: Location
}

export interface PipeSequence {
  type: 'PipeSequence'
  head: Expression
  tail: {
    operator: '|?' | '|'
    expression: Expression
  }[]
  location: Location
}

export interface LambdaExpression {
  type: 'LambdaExpression'
  params: IdentifierExpression[]
  expression: Expression
  location: Location
}

export interface VariableDeclarator {
  type: 'VariableDeclarator'
  id: IdentifierExpression
  init: Expression
  location: Location
}

export interface LetExpression {
  type: 'LetExpression'
  declarations: VariableDeclarator[]
  expression: Expression
  location: Location
}

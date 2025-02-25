import { Location } from './simplex-tree.js'

export class ExpressionError extends Error {
  constructor(
    error: Error,
    public location: Location | null
  ) {
    super(error.message, { cause: error })
  }
}

export class UnexpectedTypeError extends TypeError {
  I18N_STRING = 'UNEXPECTED_TYPE'

  constructor(
    public expectedType: string,
    public receivedType: string
  ) {
    super(`Expected ${expectedType}, but got ${receivedType} instead.`)
  }
}

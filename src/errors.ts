import { Location } from './simplex-tree.js'
import { typeOf } from './tools/index.js'

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
    public expectedTypes: string[],
    public receivedValue: unknown
  ) {
    super(
      `Expected ${
        expectedTypes.length === 1
          ? expectedTypes[0]
          : expectedTypes
              .flatMap((t, index) => {
                return [t, index === expectedTypes.length - 2 ? ' or ' : ', ']
              })
              .slice(0, -1)
              .join('')
      }, but got ${typeOf(receivedValue)} instead`
    )
  }
}

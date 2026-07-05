import { mulberry32 } from './_prng.mjs'

// Guaranteed throw on the eval path: `obj.missing` is undefined, `!` asserts
// non-null and throws ExpressionError (protocol §10.11 — cost of the error
// path). Default error mapping (auto-detected V8 mapper).
export default {
  name: 'throwing-nonnull',
  tags: ['throwing', 'micro', 'property'],
  expression: 'obj.missing!',
  makeData() {
    mulberry32(10001)
    return { obj: {} }
  }
}

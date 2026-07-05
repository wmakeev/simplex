import { mulberry32 } from './_prng.mjs'

// Same guaranteed throw as `throwing-nonnull`, but with `errorMapper: null`
// (mapping disabled, original error re-thrown). Isolates the cost of the
// source-location mapping wrapping vs. the raw throw (protocol §10.11).
// `errorMapper` is codegen-only; the interpreter backend ignores it.
export default {
  name: 'throwing-nonnull-nomap',
  tags: ['throwing', 'micro'],
  options: { errorMapper: null },
  expression: 'obj.missing!',
  makeData() {
    mulberry32(10002)
    return { obj: {} }
  }
}

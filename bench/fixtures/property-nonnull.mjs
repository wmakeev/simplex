import { mulberry32, randInt } from './_prng.mjs'

// Non-null assertion in the middle of a member chain: `a.b!.c`. `b` is present,
// so the assert passes and access continues — measures the happy-path cost of
// the `!` guard (roadmap §7; contrast the throwing-* fixtures, protocol §10.11).
export default {
  name: 'property-nonnull',
  tags: ['property', 'micro'],
  expression: 'a.b!.c',
  makeData() {
    const r = mulberry32(5004)
    return { a: { b: { c: randInt(r, 1, 1000) } } }
  }
}

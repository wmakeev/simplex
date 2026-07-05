import { mulberry32, chance, randInt } from './_prng.mjs'

// Nested `??` chains — each `??` allocates a thunk for its right side (roadmap
// §3). `a` is a deterministic null hole so the fallback branch is exercised.
export default {
  name: 'logic-nullish-nested',
  tags: ['logic', 'micro'],
  expression: '(a ?? b) + (c ?? d ?? e)',
  makeData() {
    const r = mulberry32(2002)
    return {
      a: chance(r, 0.5) ? null : randInt(r, 1, 9),
      b: randInt(r, 1, 9),
      c: null,
      d: chance(r, 0.5) ? null : randInt(r, 1, 9),
      e: randInt(r, 1, 9)
    }
  }
}

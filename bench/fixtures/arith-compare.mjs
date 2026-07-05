import { mulberry32, randInt } from './_prng.mjs'

// Relational + equality: `<` (prec 6) binds tighter than `==` (prec 7), so this
// parses as `(a < b) == (c < d)` — two comparisons feeding a strict equality.
export default {
  name: 'arith-compare',
  tags: ['arith', 'micro'],
  expression: 'a < b == c < d',
  makeData() {
    const r = mulberry32(1003)
    return {
      a: randInt(r, 1, 100),
      b: randInt(r, 1, 100),
      c: randInt(r, 1, 100),
      d: randInt(r, 1, 100)
    }
  }
}

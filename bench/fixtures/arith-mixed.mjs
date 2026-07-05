import { mulberry32, randInt } from './_prng.mjs'

// Mixed multiplicative / additive / mod chain — the arithmetic + operator
// dispatch hot path (roadmap §1, §2). Cold representative for `arith`.
export default {
  name: 'arith-mixed',
  tags: ['arith', 'micro', 'cold'],
  expression: 'a * b + c / d - e mod f',
  makeData() {
    const r = mulberry32(1001)
    return {
      a: randInt(r, 2, 50),
      b: randInt(r, 2, 50),
      c: randInt(r, 10, 500),
      d: randInt(r, 2, 9),
      e: randInt(r, 10, 90),
      f: randInt(r, 3, 7)
    }
  }
}

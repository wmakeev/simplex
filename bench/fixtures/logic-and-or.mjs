import { mulberry32, chance, randInt } from './_prng.mjs'

// `and` (prec 8) > `or` (prec 9) > `??` (prec 10): `((a and b) or c) ?? d`.
// Short-circuit logical operators — thunk-allocation hot path (roadmap §3).
// Cold representative for `logic`.
export default {
  name: 'logic-and-or',
  tags: ['logic', 'micro', 'cold'],
  expression: 'a and b or c ?? d',
  makeData() {
    const r = mulberry32(2001)
    return {
      a: chance(r, 0.5),
      b: chance(r, 0.5),
      c: chance(r, 0.5),
      d: randInt(r, 1, 9)
    }
  }
}

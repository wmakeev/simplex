import { mulberry32, randInt } from './_prng.mjs'

// Right-associative exponentiation: `x ^ 2 ^ 3` is `x ^ (2 ^ 3)` = x^8.
export default {
  name: 'arith-pow',
  tags: ['arith', 'micro'],
  expression: 'x ^ 2 ^ 3',
  makeData() {
    const r = mulberry32(1002)
    return { x: randInt(r, 1, 4) }
  }
}

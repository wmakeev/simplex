import { mulberry32, randInt } from './_prng.mjs'

// Deeply nested lambdas reading `data` from several scope-frames up: the
// innermost body touches `p` and `q` (from data) across three closure levels
// (roadmap §4b: scope-chain depth).
export default {
  name: 'scope-nested-lambda',
  tags: ['scope', 'micro'],
  expression: 'let f = x => y => z => x + y + z + p + q, f(a)(b)(c)',
  makeData() {
    const r = mulberry32(7002)
    return {
      a: randInt(r, 1, 20),
      b: randInt(r, 1, 20),
      c: randInt(r, 1, 20),
      p: randInt(r, 1, 20),
      q: randInt(r, 1, 20)
    }
  }
}

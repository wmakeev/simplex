import { mulberry32, randInt } from './_prng.mjs'

// Long standard-pipe chain threading `%` through several stages (roadmap §9:
// pipe descriptor arrays, topic capture). Cold representative for `pipe`.
export default {
  name: 'pipe-chain-long',
  tags: ['pipe', 'micro', 'cold'],
  expression: 'x | % + 1 | % * 2 | % - 3 | % * %',
  makeData() {
    const r = mulberry32(3001)
    return { x: randInt(r, 1, 20) }
  }
}

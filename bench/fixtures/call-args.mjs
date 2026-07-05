import { mulberry32, randInt } from './_prng.mjs'

// Multi-argument call — args-array construction hot path (roadmap §5, §8). The
// callee is a local lambda so the fixture stays self-contained (no function
// globals to serialise). Cold representative for `call`.
export default {
  name: 'call-args',
  tags: ['call', 'micro', 'cold'],
  expression: 'let f = (a, b, c) => a + b + c, f(x, y, z)',
  makeData() {
    const r = mulberry32(6001)
    return { x: randInt(r, 1, 99), y: randInt(r, 1, 99), z: randInt(r, 1, 99) }
  }
}

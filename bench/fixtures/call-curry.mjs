import { mulberry32, randInt } from './_prng.mjs'

// Currying placeholder `#`: `add(#, k)` builds a partially-applied function
// `arg => add(arg, k)` which is then called (roadmap §8).
export default {
  name: 'call-curry',
  tags: ['call', 'micro'],
  expression: 'let add = (a, b) => a + b, g = add(#, k), g(x)',
  makeData() {
    const r = mulberry32(6002)
    return { x: randInt(r, 1, 99), k: randInt(r, 1, 99) }
  }
}

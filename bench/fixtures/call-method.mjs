import { mulberry32, randInt } from './_prng.mjs'

// Method call on an object literal: member-access to a function value followed
// by a call (roadmap §5, §8).
export default {
  name: 'call-method',
  tags: ['call', 'micro'],
  expression: 'let o = { double: n => n * 2 }, o.double(x)',
  makeData() {
    const r = mulberry32(6003)
    return { x: randInt(r, 1, 500) }
  }
}

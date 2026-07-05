import { mulberry32, randInt } from './_prng.mjs'

// Curried lambda `a => b => a + b` applied twice — nested closure allocation
// (roadmap §12).
export default {
  name: 'lambda-curried',
  tags: ['lambda', 'micro'],
  expression: 'let add = a => b => a + b, add(x)(y)',
  makeData() {
    const r = mulberry32(4002)
    return { x: randInt(r, 1, 100), y: randInt(r, 1, 100) }
  }
}

import { mulberry32, randInt } from './_prng.mjs'

// Computed member access chained: `obj[k]` yields an array, `[i]` indexes it
// (roadmap §6, §7).
export default {
  name: 'property-computed',
  tags: ['property', 'micro'],
  expression: 'obj[k][i]',
  makeData() {
    const r = mulberry32(5003)
    const bucket = []
    for (let j = 0; j < 8; j++) bucket.push(randInt(r, 1, 1000))
    return { obj: { row0: [0], row1: bucket }, k: 'row1', i: randInt(r, 0, 7) }
  }
}

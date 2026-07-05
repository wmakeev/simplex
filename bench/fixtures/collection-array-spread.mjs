import { mulberry32, randInt } from './_prng.mjs'

// Array literal with a spread element: `[first, ...mid, last, extra]` — array
// literal + spread construction. Cold representative for `collection`.
export default {
  name: 'collection-array-spread',
  tags: ['collection', 'micro', 'cold'],
  expression: '[first, ...mid, last, extra]',
  makeData() {
    const r = mulberry32(9001)
    const mid = []
    for (let i = 0; i < 6; i++) mid.push(randInt(r, 1, 100))
    return {
      first: randInt(r, 1, 100),
      mid,
      last: randInt(r, 1, 100),
      extra: randInt(r, 1, 100)
    }
  }
}

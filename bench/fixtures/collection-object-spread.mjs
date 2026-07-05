import { mulberry32, randInt, pick } from './_prng.mjs'

// Object literal combining spread, a computed key and a derived field:
// `{ ...base, status: "active", [key]: val, count: base.count + 1 }`.
export default {
  name: 'collection-object-spread',
  tags: ['collection', 'micro'],
  expression: '{ ...base, status: "active", [key]: val, count: base.count + 1 }',
  makeData() {
    const r = mulberry32(9002)
    return {
      base: { id: randInt(r, 1, 999), count: randInt(r, 0, 50), status: 'draft' },
      key: pick(r, ['priority', 'tier', 'flag']),
      val: randInt(r, 1, 9)
    }
  }
}

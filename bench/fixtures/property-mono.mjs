import { mulberry32, randInt } from './_prng.mjs'

// Deep dotted access on a single, stable object shape — monomorphic `get` /
// member-access hidden class (protocol §10.6; roadmap §6, §7). Cold
// representative for `property`.
export default {
  name: 'property-mono',
  tags: ['property', 'micro', 'mono', 'cold'],
  expression: 'obj.a.b.c',
  makeData() {
    const r = mulberry32(5001)
    return { obj: { a: { b: { c: randInt(r, 1, 1000) } } } }
  }
}

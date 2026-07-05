import { mulberry32, randInt, pick } from './_prng.mjs'

// Same access pattern (`r.value + r.weight`) applied over an array of
// DIFFERENTLY-shaped objects — every element carries `value` and `weight` but
// with varying extra keys and key order, so member access sees polymorphic
// hidden classes (protocol §10.6: "data from an API"). This is also part of the
// corpus's ic-pressure contribution (§10.2): it feeds `get` objects of many
// shapes. Needs stdlib for `Arr.map`.
export default {
  name: 'property-poly',
  tags: ['property', 'micro', 'poly'],
  options: { stdlib: true },
  expression: 'Arr.map(rows, r => r.value + r.weight)',
  makeData() {
    const r = mulberry32(5002)
    const shapes = [
      v => ({ value: v.value, weight: v.weight }),
      v => ({ id: v.id, value: v.value, weight: v.weight, kind: 'a' }),
      v => ({ weight: v.weight, label: 'x', value: v.value }),
      v => ({ value: v.value, extra: true, tag: 'z', weight: v.weight }),
      v => ({ ns: 1, id: v.id, weight: v.weight, meta: null, value: v.value })
    ]
    const rows = []
    for (let i = 0; i < 40; i++) {
      const base = { id: i, value: randInt(r, 1, 100), weight: randInt(r, 1, 100) }
      rows.push(pick(r, shapes)(base))
    }
    return { rows }
  }
}

import { mulberry32, pick } from './_prng.mjs'

// String concatenation with `&` (coerces to string) — the `&` operator hot
// path. Cold representative for `string`.
export default {
  name: 'string-concat',
  tags: ['string', 'micro', 'cold'],
  expression: 'first & " " & last & " <" & role & ">"',
  makeData() {
    const r = mulberry32(8001)
    return {
      first: pick(r, ['Ada', 'Grace', 'Alan', 'Edsger']),
      last: pick(r, ['Lovelace', 'Hopper', 'Turing', 'Dijkstra']),
      role: pick(r, ['admin', 'editor', 'guest'])
    }
  }
}

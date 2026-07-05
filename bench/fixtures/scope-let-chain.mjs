import { mulberry32, randInt } from './_prng.mjs'

// Sequential `let` chain — each binding sees the previous ones plus `data`,
// stressing scope-chain construction and lookup depth (roadmap §4b). Cold
// representative for `scope`.
export default {
  name: 'scope-let-chain',
  tags: ['scope', 'micro', 'cold'],
  expression:
    'let base = n, a = base + 1, b = a + base, c = b + a, d = c + b, a + b + c + d + base',
  makeData() {
    const r = mulberry32(7001)
    return { n: randInt(r, 1, 50) }
  }
}

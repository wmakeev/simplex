import { mulberry32, randInt, pick, chance } from './_prng.mjs'

// Realistic filter → derive → sort pipeline with predicate reuse and currying:
// two named predicate lambdas, a curried `atLeast(minRating, #)`, an `if`
// derived field, spread, Math.round and a final sort + slice (protocol §5
// macro; roadmap §8 currying, §1 arithmetic, §9 pipe). Dataset: 2000 products
// with null-hole ratings and empty-string names.
const EXPRESSION = [
  'let minRating = 3,',
  '    inStock = p => p.stock > 0 and not empty(p.name),',
  '    atLeast = (min, p) => (p.rating ?? 0) >= min,',
  '    byScore = (a, b) => b.score - a.score,',
  'products',
  '  | Arr.filter(%, inStock)',
  '  | Arr.filter(%, atLeast(minRating, #))',
  '  | Arr.map(%, p =>',
  '      let discount = if p.onSale == true then 0.2 else 0,',
  '          finalPrice = Math.round(p.price * (1 - discount) * 100) / 100,',
  '      { ...p, finalPrice: finalPrice, score: (p.rating ?? 0) * 10 + p.stock })',
  '  | Arr.sort(%, byScore)',
  '  | Arr.slice(%, 0, 10)'
].join('\n')

export default {
  name: 'macro-filter-sort',
  tags: ['filter-sort', 'macro'],
  options: { stdlib: true },
  expression: EXPRESSION,
  makeData() {
    const r = mulberry32(20003)
    const names = ['widget', 'gadget', 'gizmo', 'sprocket', 'cog']
    const products = []
    for (let i = 0; i < 2000; i++) {
      products.push({
        id: i,
        // Empty-string name hole (~10%) filtered out by `not empty(p.name)`.
        name: chance(r, 0.1) ? '' : pick(r, names) + '-' + i,
        stock: chance(r, 0.2) ? 0 : randInt(r, 1, 200),
        // Null rating hole (~15%) → `?? 0`.
        rating: chance(r, 0.15) ? null : randInt(r, 1, 5),
        price: randInt(r, 5, 500),
        onSale: chance(r, 0.3)
      })
    }
    return { products }
  }
}

import { mulberry32, randInt } from './_prng.mjs'

// Extension-method map with an inline lambda (roadmap §4, §12: closures). Uses
// the `::` path, so it needs stdlib extensions. Cold representative for `lambda`.
export default {
  name: 'lambda-map',
  tags: ['lambda', 'micro', 'cold'],
  options: { stdlib: true },
  expression: 'xs::map(x => x * 2)',
  makeData() {
    const r = mulberry32(4001)
    const xs = []
    for (let i = 0; i < 16; i++) xs.push(randInt(r, 1, 100))
    return { xs }
  }
}

import { mulberry32 } from './_prng.mjs'

// Optional pipe on a null branch: `|?` short-circuits on null/undefined/NaN,
// returning it as-is. `x` is null, so both stages are skipped and the result is
// null — exercises the short-circuit path of `|?` (roadmap §9).
export default {
  name: 'pipe-optional-null',
  tags: ['pipe', 'micro'],
  expression: 'x |? % + 1 |? % * 2',
  makeData() {
    // Seeded for symmetry with the rest of the corpus; the value is fixed null.
    mulberry32(3002)
    return { x: null }
  }
}

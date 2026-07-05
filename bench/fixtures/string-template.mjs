import { mulberry32, randInt, pick } from './_prng.mjs'

// Template literal with a nested template and an inline `if` interpolation —
// interpolation + `castToString` + nested template construction.
export default {
  name: 'string-template',
  tags: ['string', 'micro'],
  expression:
    '`${greet}, ${name}! You have ${count} item${if count == 1 then "" else "s"} in ${`bucket-${bucket}`}`',
  makeData() {
    const r = mulberry32(8002)
    return {
      greet: pick(r, ['Hi', 'Hello', 'Hey']),
      name: pick(r, ['Sam', 'Lee', 'Max']),
      count: randInt(r, 0, 5),
      bucket: randInt(r, 1, 9)
    }
  }
}

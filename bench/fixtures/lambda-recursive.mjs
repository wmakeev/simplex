import { mulberry32, randInt } from './_prng.mjs'

// Named recursion via `let`: a binding whose initializer is a lambda calls
// itself by name (roadmap §4b scope depth; §12 recursion). Factorial of x.
export default {
  name: 'lambda-recursive',
  tags: ['lambda', 'micro'],
  expression: 'let fac = n => if n <= 1 then 1 else n * fac(n - 1), fac(x)',
  makeData() {
    const r = mulberry32(4003)
    return { x: randInt(r, 3, 10) }
  }
}

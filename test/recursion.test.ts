import assert from 'node:assert/strict'
import { suite, test } from 'node:test'
import { compile } from './helpers.js'

/**
 * Regression tests for issue #30: the codegen backend reassigned the
 * closure-captured `scope` variable on every lambda invocation, leaking
 * frames of completed calls into subsequent ones. Any recursive lambda with
 * two or more self-calls in one expression resolved identifiers against a
 * stale frame after the first self-call returned.
 *
 * All cases run through the parity helper, so both backends are covered.
 */

suite('recursion: multiple self-calls per expression (issue #30)', () => {
  test('fibonacci via named let-recursion', () => {
    const fn = compile(
      'let f = n => if n <= 1 then n else f(n - 1) + f(n - 2), f(10)'
    )
    assert.equal(fn(), 55)
  })

  test('minimal case: fib(2)', () => {
    const fn = compile(
      'let f = n => if n <= 1 then n else f(n - 1) + f(n - 2), f(2)'
    )
    assert.equal(fn(), 1)
  })

  test('two base cases (previously stack overflow)', () => {
    const fn = compile(
      'let f = n => if n == 0 then 0 else if n == 1 then 1 else f(n - 1) + f(n - 2), f(10)'
    )
    assert.equal(fn(), 55)
  })

  test('two identical self-calls', () => {
    const fn = compile(
      'let f = n => if n <= 1 then 2 else f(n - 1) * f(n - 1), f(3)'
    )
    assert.equal(fn(), 16)
  })

  test('three self-calls', () => {
    const fn = compile(
      'let f = n => if n <= 1 then 1 else f(n - 1) + f(n - 1) + f(n - 1), f(3)'
    )
    assert.equal(fn(), 9)
  })

  test('self-call followed by a non-recursive operand', () => {
    const fn = compile(
      'let f = n => if n <= 0 then 1 else f(n - 1) + 100, f(3)'
    )
    assert.equal(fn(), 301)
  })

  test('self-calls inside an array literal', () => {
    const fn = compile(
      'let f = n => if n <= 1 then n else [f(n - 1), f(n - 2)], f(3)'
    )
    assert.deepEqual(fn(), [[1, 0], 1])
  })

  test('self-calls passed as arguments to a global function', () => {
    const fn = compile(
      'let f = n => if n <= 1 then n else add(f(n - 1), f(n - 2)), f(10)',
      { globals: { add: (a: number, b: number) => a + b } }
    )
    assert.equal(fn(), 55)
  })

  test('named recursion inside a pipe stage', () => {
    const fn = compile(
      '10 | (let f = n => if n <= 1 then n else f(n - 1) + f(n - 2), f(%))'
    )
    assert.equal(fn(), 55)
  })
})

suite('recursion: patterns that already worked (regression)', () => {
  test('factorial (single self-call)', () => {
    const fn = compile(
      'let f = n => if n <= 1 then 1 else n * f(n - 1), f(5)'
    )
    assert.equal(fn(), 120)
  })

  test('countdown (self-call under spread)', () => {
    const fn = compile(
      'let f = n => if n <= 0 then [] else [n, ...f(n - 1)], f(3)'
    )
    assert.deepEqual(fn(), [3, 2, 1])
  })

  test('fibonacci via let-extraction of self-call results', () => {
    const fn = compile(
      'let f = n => if n <= 1 then n else let a = f(n - 1), b = f(n - 2), a + b, f(10)'
    )
    assert.equal(fn(), 55)
  })

  test('self(self) trick', () => {
    const fn = compile(
      'let f = self => n => if n <= 1 then n else self(self)(n - 1) + self(self)(n - 2), f(f)(10)'
    )
    assert.equal(fn(), 55)
  })

  test('Y combinator', () => {
    const fn = compile(
      'let Y = f => (x => f(y => x(x)(y)))(x => f(y => x(x)(y))), Y(self => n => if n <= 1 then n else self(n - 1) + self(n - 2))(10)'
    )
    assert.equal(fn(), 55)
  })
})

suite('recursion: mutual recursion via sibling let bindings', () => {
  // Sibling bindings live in one shared frame; a lambda body resolves names
  // at call time, so an earlier binding can call a later one.
  test('even/odd', () => {
    const fn = compile(
      'let even = n => if n == 0 then true else odd(n - 1), odd = n => if n == 0 then false else even(n - 1), even(x)'
    )
    assert.equal(fn({ x: 10 }), true)
    assert.equal(fn({ x: 7 }), false)
  })

  test('initializers still cannot see later siblings', () => {
    // Only call-time resolution works; init-time evaluation of a later name
    // must throw.
    const fn = compile('let a = b, b = 1, a')
    assert.throws(() => fn(), /Unknown identifier - b/)
  })
})

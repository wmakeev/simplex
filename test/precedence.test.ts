import { test, suite } from 'node:test'
import { compile } from '../src/compiler.js'
import assert from 'node:assert/strict'

suite('precedence', () => {
  test('logical', () => {
    assert.equal(compile('not false and true')(), true)
    assert.equal(compile('true and not false')(), true)
    assert.equal(compile('not (false or true)')(), false)
  })

  test('pipeline', () => {
    assert.equal(
      compile('a | if % ?? false then c else d + 2 | % + 1')({
        a: null,
        b: true,
        c: 5,
        d: 3
      }),
      6,
      'pipe operator #1'
    )

    assert.equal(compile('if 1 then 2 else 3 | % + 2')(), 2, 'pipe operator #2')

    assert.equal(
      compile('(if 1 then 2 else 3) | % + 2')(),
      4,
      'pipe operator #3'
    )

    assert.throws(() => {
      compile('a | a => a + %')
    }, /Expected/)

    const result = compile('a | (a => a + %)')({ a: 42 })
    assert.ok(typeof result === 'function')
    assert.equal(result(8), 50)
  })
})

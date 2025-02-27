import { test, suite } from 'node:test'
import { compile } from '../src/compiler.js'
import assert from 'node:assert/strict'

suite('operators', () => {
  test('unary', () => {
    assert.equal(compile('+1')(), 1)
    assert.equal(compile('-1')(), -1)
    assert.equal(compile('not true')(), false)
    assert.equal(compile('not 0')(), true)
    assert.equal(compile('typeof 1')(), 'number')
  })

  test('math', () => {
    assert.equal(compile('1 + 1')(), 2)
    assert.equal(compile('2 - 1')(), 1)
    assert.equal(compile('2 * 2')(), 4)
    assert.equal(compile('4 / 2')(), 2)
    assert.equal(compile('2 ^ 2')(), 4)
  })

  test('string', () => {
    assert.equal(compile('1 & 1')(), '11')
    assert.equal(compile('1 + 2 & "_" & true & "_foo"')(), '3_true_foo')
  })

  test('relational', () => {
    assert.equal(compile('4 == 4')(), true)
    assert.equal(compile('foo == "bar"')({ foo: 'bar' }), true)

    assert.equal(compile('4 > 3')(), true)
    assert.equal(compile('4 >= 4')(), true)

    assert.equal(compile('4 < 5')(), true)
    assert.equal(compile(`'a' < "b"`)(), true)
    assert.equal(compile('4 <= 4')(), true)
  })

  test('in', () => {
    // in
    assert.equal(compile('2 in [1, 2, 3]')(), true)
    assert.equal(compile('4 in [1, 2, 3]')(), false)
    assert.equal(compile('10 in [1, 2, 3]')(), false)
    assert.equal(compile('"foo" in { foo: 1 }')(), true)
    assert.equal(compile('"baz" in { foo: 1 }')(), false)
  })

  test('logical', () => {
    assert.equal(compile('false and true')(), false)
    assert.equal(compile('false or true')(), true)

    assert.equal(compile('not false')(), true)
  })

  test('nullish coalescing', () => {
    assert.equal(compile('null ?? 1')(), 1)
    assert.equal(compile('undefined ?? 1')(), 1)
    assert.equal(compile('2 ?? 1')(), 2)
  })

  test('property access', () => {
    // object property access
    assert.equal(compile('{a:42}["a"]')(), 42)
    assert.equal(compile('{a:42}.a')(), 42)
    assert.equal(compile('a.b["foo bar"]')({ a: { b: { 'foo bar': 42 } } }), 42)

    // array property access
    assert.equal(compile('[11, 22, 33]["1"]')(), 22)
    assert.equal(compile('[1].foo')(), undefined)
  })

  test('pipeline', () => {
    assert.equal(
      compile('a | b')({
        a: 11,
        b: 12
      }),
      12
    )

    assert.equal(
      compile('a | _')({
        a: 11
      }),
      11
    )

    assert.equal(
      compile('a | add(_, 2) | 4 * _')({
        a: 1,
        add: (a: number, b: number) => a + b
      }),
      12
    )

    assert.equal(
      compile('a | add(_, 2) | 4 * _')({
        a: 1,
        add: (a: number, b: number) => a + b
      }),
      12
    )

    assert.equal(
      compile('null | add2(_) | a * _')({
        a: 10,
        add2: (a: number | null) => (a === null ? 1 : a + 2)
      }),
      10
    )

    assert.equal(compile('null |? 42')(), null)

    assert.equal(compile('undefined |? 42')(), undefined)

    assert.equal(compile('0 |? 42')(), 42)

    assert.equal(compile('false |? 42')(), 42)

    assert.equal(
      compile('null |? add2(_) | a * _')({
        a: 10,
        add2: () => {
          assert.fail('should not called')
        }
      }),
      null
    )

    assert.equal(
      compile('2 | nil(_) |? a * _')({
        a: 10,
        nil: (arg: unknown) => {
          assert.equal(arg, 2)
          return null
        }
      }),
      null
    )
  })
})

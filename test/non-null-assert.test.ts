import { test, suite } from 'node:test'
import { compile, ExpressionError } from '../src/index.js'
import assert from 'node:assert/strict'

suite('non-null assert (!)', () => {
  test('passes through non-null value', () => {
    assert.strictEqual(compile('a!')({ a: 5 }), 5)
    assert.strictEqual(compile('a!')({ a: 'hello' }), 'hello')
    assert.strictEqual(compile('a!')({ a: 0 }), 0)
    assert.strictEqual(compile('a!')({ a: false }), false)
    assert.strictEqual(compile('a!')({ a: '' }), '')
  })

  test('throws on null', () => {
    assert.throws(() => compile('a!')({ a: null }), {
      message: 'Non-null assertion failed: value is null'
    })
  })

  test('throws on undefined', () => {
    assert.throws(() => compile('a!')({ a: undefined }), {
      message: 'Non-null assertion failed: value is undefined'
    })
  })

  test('chained member access: a.b!.c', () => {
    assert.strictEqual(
      compile('a.b!.c')({ a: { b: { c: 42 } } }),
      42
    )
  })

  test('chained member access throws on null', () => {
    assert.throws(() => compile('a.b!.c')({ a: { b: null } }), {
      message: 'Non-null assertion failed: value is null'
    })
  })

  test('deep chain: a.b!.c.d!', () => {
    assert.strictEqual(
      compile('a.b!.c.d!')({ a: { b: { c: { d: 99 } } } }),
      99
    )
  })

  test('assert then call: foo!(a)', () => {
    const fn = (x: number) => x * 2
    assert.strictEqual(compile('foo!(a)')({ foo: fn, a: 5 }), 10)
  })

  test('assert then call throws on null function', () => {
    assert.throws(() => compile('foo!(a)')({ foo: null, a: 5 }), {
      message: 'Non-null assertion failed: value is null'
    })
  })

  test('no conflict with != operator', () => {
    assert.strictEqual(compile('a! != b')({ a: 1, b: 2 }), true)
    assert.strictEqual(compile('a! != b')({ a: 1, b: 1 }), false)
  })

  test('double assert: a!!', () => {
    assert.strictEqual(compile('a!!')({ a: 5 }), 5)
  })

  test('in pipe: value | %!', () => {
    assert.strictEqual(compile('a | %!')({ a: 42 }), 42)
    assert.throws(() => compile('a | %!')({ a: null }), {
      message: 'Non-null assertion failed: value is null'
    })
  })

  test('with computed property: a!["b"]', () => {
    assert.strictEqual(
      compile('a!["b"]')({ a: { b: 7 } }),
      7
    )
  })

  test('after call expression: foo()!', () => {
    assert.strictEqual(
      compile('foo()!')({ foo: () => 42 }),
      42
    )
    assert.throws(
      () => compile('foo()!')({ foo: () => null }),
      { message: 'Non-null assertion failed: value is null' }
    )
  })

  test('assert on literal value', () => {
    assert.strictEqual(compile('42!')(), 42)
    assert.strictEqual(compile('"hello"!')(), 'hello')
  })

  test('assert on null literal throws', () => {
    assert.throws(() => compile('null!')(), {
      message: 'Non-null assertion failed: value is null'
    })
  })

  test('in conditional', () => {
    assert.strictEqual(
      compile('if true then a! else 0')({ a: 5 }),
      5
    )
  })

  test('with let expression', () => {
    assert.strictEqual(compile('let x = 5, x!')(), 5)
  })

  test('error is ExpressionError', () => {
    assert.throws(
      () => compile('a!')({ a: null }),
      err => {
        assert.ok(err instanceof ExpressionError)
        return true
      }
    )
  })
})

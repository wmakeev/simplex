import { suite, test } from 'node:test'
import assert from 'node:assert/strict'
import { empty, exists, typeOf } from '../../src/stdlib/utils.js'

suite('stdlib/utils', () => {
  suite('empty', () => {
    test('returns true for null/undefined/NaN', () => {
      assert.equal(empty(null), true)
      assert.equal(empty(undefined), true)
      assert.equal(empty(NaN), true)
    })

    test('returns true for empty string', () => {
      assert.equal(empty(''), true)
    })

    test('returns true for empty array', () => {
      assert.equal(empty([]), true)
    })

    test('returns true for empty object', () => {
      assert.equal(empty({}), true)
    })

    test('returns false for non-empty values', () => {
      assert.equal(empty(0), false)
      assert.equal(empty(false), false)
      assert.equal(empty('a'), false)
      assert.equal(empty([1]), false)
      assert.equal(empty({ a: 1 }), false)
      assert.equal(empty(42), false)
    })
  })

  suite('exists', () => {
    test('returns false for null/undefined/NaN', () => {
      assert.equal(exists(null), false)
      assert.equal(exists(undefined), false)
      assert.equal(exists(NaN), false)
    })

    test('returns true for other values', () => {
      assert.equal(exists(0), true)
      assert.equal(exists(''), true)
      assert.equal(exists(false), true)
      assert.equal(exists([]), true)
      assert.equal(exists({}), true)
    })
  })

  suite('typeOf', () => {
    test('returns detailed type names', () => {
      assert.equal(typeOf(42), 'number')
      assert.equal(typeOf('foo'), 'string')
      assert.equal(typeOf(true), 'boolean')
      assert.equal(typeOf(null), 'Null')
      assert.equal(typeOf(undefined), 'undefined')
      assert.equal(typeOf(NaN), 'NaN')
      assert.equal(typeOf([]), 'Array')
      assert.equal(typeOf({}), 'Object')
    })
  })
})

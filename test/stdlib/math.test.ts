import { suite, test } from 'node:test'
import assert from 'node:assert/strict'
import { math } from '../../src/stdlib/math.js'

suite('stdlib/math', () => {
  suite('NaN → null', () => {
    test('abs returns null for non-number', () => {
      assert.equal(math.abs('foo'), null)
    })

    test('abs works for numbers', () => {
      assert.equal(math.abs(-5), 5)
      assert.equal(math.abs(3), 3)
    })

    test('sqrt returns null for negative', () => {
      assert.equal(math.sqrt(-1), null)
    })

    test('sqrt works for valid input', () => {
      assert.equal(math.sqrt(9), 3)
    })

    test('round/floor/ceil/trunc work correctly', () => {
      assert.equal(math.round(1.5), 2)
      assert.equal(math.floor(1.9), 1)
      assert.equal(math.ceil(1.1), 2)
      assert.equal(math.trunc(1.9), 1)
    })

    test('round/floor/ceil return null for non-number', () => {
      assert.equal(math.round('x'), null)
      assert.equal(math.floor('x'), null)
      assert.equal(math.ceil('x'), null)
    })

    test('log returns null for negative', () => {
      assert.equal(math.log(-1), null)
    })

    test('pow works correctly', () => {
      assert.equal(math.pow(2, 3), 8)
    })

    test('min/max work correctly', () => {
      assert.equal(math.min(1, 2, 3), 1)
      assert.equal(math.max(1, 2, 3), 3)
    })

    test('min/max return null with non-numbers', () => {
      assert.equal(math.min(1, 'a'), null)
      assert.equal(math.max(1, 'a'), null)
    })

    test('trig functions return null for non-number', () => {
      assert.equal(math.sin('x'), null)
      assert.equal(math.cos('x'), null)
      assert.equal(math.tan('x'), null)
    })

    test('trig functions work for numbers', () => {
      assert.equal(math.sin(0), 0)
      assert.equal(math.cos(0), 1)
    })
  })

  suite('clamp', () => {
    test('clamps value within range', () => {
      assert.equal(math.clamp(5, 1, 10), 5)
      assert.equal(math.clamp(-5, 1, 10), 1)
      assert.equal(math.clamp(15, 1, 10), 10)
    })

    test('throws when min > max', () => {
      assert.throws(
        () => math.clamp(5, 10, 1),
        { message: 'Math.clamp: min must be less than or equal to max' }
      )
    })
  })

  suite('constants', () => {
    test('PI and E are correct', () => {
      assert.equal(math.PI, Math.PI)
      assert.equal(math.E, Math.E)
    })
  })

  suite('random', () => {
    test('returns number between 0 and 1', () => {
      const r = math.random()
      assert.ok(r >= 0 && r < 1)
    })
  })
})

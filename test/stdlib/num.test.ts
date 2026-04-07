import { suite, test } from 'node:test'
import assert from 'node:assert/strict'
import { UnexpectedTypeError } from '../../src/errors.js'
import { num } from '../../src/stdlib/num.js'

suite('stdlib/num', () => {
  test('toString converts number to string', () => {
    assert.equal(num.toString(42), '42')
    assert.equal(num.toString(255, 16), 'ff')
    assert.equal(num.toString(7, 2), '111')
  })

  test('toString throws for non-number', () => {
    assert.throws(() => num.toString('42'), UnexpectedTypeError)
  })

  test('parseInt returns number for valid input', () => {
    assert.equal(num.parseInt('42'), 42)
    assert.equal(num.parseInt('0xFF', 16), 255)
  })

  test('parseInt returns null for invalid input', () => {
    assert.equal(num.parseInt('abc'), null)
    assert.equal(num.parseInt(''), null)
  })

  test('parseFloat returns number for valid input', () => {
    assert.equal(num.parseFloat('3.14'), 3.14)
  })

  test('parseFloat returns null for invalid input', () => {
    assert.equal(num.parseFloat('abc'), null)
  })

  test('isFinite', () => {
    assert.equal(num.isFinite(42), true)
    assert.equal(num.isFinite(Infinity), false)
    assert.equal(num.isFinite(NaN), false)
  })

  test('isInteger', () => {
    assert.equal(num.isInteger(42), true)
    assert.equal(num.isInteger(42.5), false)
  })

  test('isNaN', () => {
    assert.equal(num.isNaN(NaN), true)
    assert.equal(num.isNaN(42), false)
  })

  test('toFixed works for numbers', () => {
    assert.equal(num.toFixed(3.14159, 2), '3.14')
    assert.equal(num.toFixed(3, 2), '3.00')
  })

  test('toFixed throws for non-number', () => {
    assert.throws(() => num.toFixed('3.14', 2), UnexpectedTypeError)
  })
})

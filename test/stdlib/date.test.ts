import { suite, test } from 'node:test'
import assert from 'node:assert/strict'
import { date } from '../../src/stdlib/date.js'

suite('stdlib/date', () => {
  test('toString returns ISO string for valid timestamp', () => {
    assert.equal(date.toString(0), '1970-01-01T00:00:00.000Z')
    assert.equal(date.toString(1704067200000), '2024-01-01T00:00:00.000Z')
  })

  test('toString returns null for invalid input', () => {
    assert.equal(date.toString(NaN), null)
    assert.equal(date.toString('not-a-date'), null)
  })

  test('now returns a number', () => {
    const result = date.now()
    assert.equal(typeof result, 'number')
    assert.ok(result > 0)
  })

  test('parse returns timestamp for valid date', () => {
    const result = date.parse('2024-01-01')
    assert.notEqual(result, null)
    assert.equal(typeof result, 'number')
  })

  test('parse returns null for invalid date', () => {
    assert.equal(date.parse('not-a-date'), null)
  })
})

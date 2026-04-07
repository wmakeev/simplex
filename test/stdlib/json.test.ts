import { suite, test } from 'node:test'
import assert from 'node:assert/strict'
import { json } from '../../src/stdlib/json.js'

suite('stdlib/json', () => {
  test('parse', () => {
    assert.deepEqual(json.parse('{"a":1}'), { a: 1 })
    assert.deepEqual(json.parse('[1,2,3]'), [1, 2, 3])
  })

  test('stringify', () => {
    assert.equal(json.stringify({ a: 1 }), '{"a":1}')
  })

  test('stringify with replacer function', () => {
    const replacer = (_k: string, v: unknown) =>
      typeof v === 'number' ? v * 2 : v
    assert.equal(json.stringify({ a: 1, b: 2 }, replacer), '{"a":2,"b":4}')
  })

  test('stringify with replacer array', () => {
    assert.equal(json.stringify({ a: 1, b: 2, c: 3 }, ['a', 'c']), '{"a":1,"c":3}')
  })

  test('stringify with replacer and indent', () => {
    assert.equal(
      json.stringify({ a: 1, b: 2 }, ['a'], 2),
      '{\n  "a": 1\n}'
    )
  })

  test('stringify with null replacer and indent', () => {
    assert.equal(json.stringify({ a: 1 }, null, 2), '{\n  "a": 1\n}')
  })
})

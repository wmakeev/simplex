import { suite, test } from 'node:test'
import assert from 'node:assert/strict'
import { obj } from '../../src/stdlib/obj.js'

suite('stdlib/obj', () => {
  test('toString returns JSON string', () => {
    assert.equal(obj.toString({ a: 1 }), '{"a":1}')
    assert.equal(obj.toString({ a: 1, b: [2, 3] }), '{"a":1,"b":[2,3]}')
  })

  test('keys/values/entries', () => {
    const o = { a: 1, b: 2 }
    assert.deepEqual(obj.keys(o), ['a', 'b'])
    assert.deepEqual(obj.values(o), [1, 2])
    assert.deepEqual(obj.entries(o), [['a', 1], ['b', 2]])
  })

  test('fromEntries', () => {
    assert.deepEqual(obj.fromEntries([['a', 1], ['b', 2]]), { a: 1, b: 2 })
  })

  test('assign does not mutate first argument', () => {
    const a = { x: 1 }
    const b = { y: 2 }
    const result = obj.assign(a, b)
    assert.deepEqual(result, { x: 1, y: 2 })
    assert.deepEqual(a, { x: 1 })
  })

  test('has', () => {
    assert.equal(obj.has({ a: 1 }, 'a'), true)
    assert.equal(obj.has({ a: 1 }, 'b'), false)
  })

})

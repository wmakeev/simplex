import { suite, test } from 'node:test'
import assert from 'node:assert/strict'
import { UnexpectedTypeError } from '../../src/errors.js'
import { str } from '../../src/stdlib/str.js'

suite('stdlib/str', () => {
  test('toString converts any value to string', () => {
    assert.equal(str.toString('hello'), 'hello')
    assert.equal(str.toString(42), '42')
    assert.equal(str.toString(true), 'true')
    assert.equal(str.toString(null), 'null')
    assert.equal(str.toString(undefined), 'undefined')
  })

  test('length', () => {
    assert.equal(str.length('hello'), 5)
    assert.equal(str.length(''), 0)
  })

  test('toUpperCase/toLowerCase', () => {
    assert.equal(str.toUpperCase('hello'), 'HELLO')
    assert.equal(str.toLowerCase('HELLO'), 'hello')
  })

  test('trim/trimStart/trimEnd', () => {
    assert.equal(str.trim('  hi  '), 'hi')
    assert.equal(str.trimStart('  hi  '), 'hi  ')
    assert.equal(str.trimEnd('  hi  '), '  hi')
  })

  test('split', () => {
    assert.deepEqual(str.split('a,b,c', ','), ['a', 'b', 'c'])
  })

  test('includes/startsWith/endsWith', () => {
    assert.equal(str.includes('hello', 'ell'), true)
    assert.equal(str.includes('hello', 'xyz'), false)
    assert.equal(str.startsWith('hello', 'hel'), true)
    assert.equal(str.endsWith('hello', 'llo'), true)
  })

  test('slice', () => {
    assert.equal(str.slice('hello', 1, 3), 'el')
    assert.equal(str.slice('hello', 1), 'ello')
  })

  test('replaceAll', () => {
    assert.equal(str.replaceAll('aaa', 'a', 'b'), 'bbb')
  })

  test('indexOf', () => {
    assert.equal(str.indexOf('hello', 'l'), 2)
    assert.equal(str.indexOf('hello', 'x'), -1)
  })

  test('padStart/padEnd', () => {
    assert.equal(str.padStart('5', 3, '0'), '005')
    assert.equal(str.padEnd('5', 3, '0'), '500')
  })

  test('repeat', () => {
    assert.equal(str.repeat('ab', 3), 'ababab')
  })

  test('charAt', () => {
    assert.equal(str.charAt('hello', 0), 'h')
    assert.equal(str.charAt('hello', 4), 'o')
  })

  suite('tier 3 guards', () => {
    test('throws UnexpectedTypeError for non-string', () => {
      assert.throws(() => str.length(42), UnexpectedTypeError)
      assert.throws(() => str.toUpperCase(null), UnexpectedTypeError)
      assert.throws(() => str.split(123, ','), UnexpectedTypeError)
      assert.throws(() => str.includes([], 'a'), UnexpectedTypeError)
    })
  })
})

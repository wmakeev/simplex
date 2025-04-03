import assert from 'node:assert/strict'
import { suite, test } from 'node:test'
import {
  compile,
  defaultBinaryOperators,
  defaultUnaryOperators
} from '../src/index.js'

suite('compile', () => {
  test('without context', () => {
    const fn = compile('42')
    assert.ok(typeof fn === 'function')
    assert.equal(fn(), 42)
  })

  test('with globals', () => {
    const fn = compile('a', {
      globals: {
        a: 42
      }
    })

    assert.equal(fn(), 42)
  })

  test('with data', () => {
    const fn = compile('a')
    assert.equal(fn({ a: 42 }), 42)
  })

  test('with globals and data', () => {
    const fn = compile('globalVar + dataVar', {
      globals: {
        globalVar: 1
      }
    })

    assert.equal(fn({ dataVar: 2 }), 3)
  })

  test('prefer globals over data', () => {
    const fn = compile('a', {
      globals: {
        a: 1
      }
    })

    assert.equal(fn({ a: 2 }), 1)
  })

  test('undefined identifier', () => {
    const fn = compile('undefined', {
      globals: {
        undefined: 1
      }
    })

    assert.equal(fn({ undefined: 2 }), undefined)
  })

  test('custom globals type', () => {
    const fn = compile('foo', {
      globals: new Map([['foo', 'bar']]),
      getIdentifierValue(identifierName, globals, data) {
        if (globals.has(identifierName)) {
          return globals.get(identifierName)
        } else {
          return data[identifierName]
        }
      }
    })

    assert.equal(fn({ foo: 'baz' }), 'bar')
  })

  test('custom data type', () => {
    const fn = compile<Map<string, unknown>>('foo', {
      getIdentifierValue(identifierName, globals, data) {
        assert.equal(globals, null)
        return data.get(identifierName)
      }
    })

    assert.equal(fn(new Map([['foo', 'bar']])), 'bar')
  })

  test('operators override', () => {
    const fn = compile('not -a + b - 2', {
      unaryOperators: {
        ...defaultUnaryOperators,
        not: a => Number(a) + 1
      },
      binaryOperators: {
        ...defaultBinaryOperators,
        '+': (a, b) => Number(a) * Number(b)
      }
    })

    assert.equal(fn({ a: 5, b: 10 }), (-5 + 1) * 10 - 2)
  })
})

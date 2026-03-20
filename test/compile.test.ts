import assert from 'node:assert/strict'
import { suite, test } from 'node:test'
import {
  compile,
  CompileError,
  defaultBinaryOperators,
  defaultLogicalOperators,
  defaultUnaryOperators,
  ExpressionError
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

  test('undefined is not overridable', () => {
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

  test('non-Error throw is re-thrown as-is', () => {
    const fn = compile('func()', {
      globals: {
        func: () => {
           
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'string error'
        }
      }
    })

    assert.throws(() => fn(), err => err === 'string error')
  })

  test('Error with no eval frame in stack is re-thrown', () => {
    const fn = compile('func()', {
      globals: {
        func: () => {
          const err = new Error('test')
          err.stack = 'Error: test\n    at Object.<anonymous> (/foo.js:1:1)'
          throw err
        }
      }
    })

    assert.throws(() => fn(), {
      message: 'test'
    })
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

  test('CompileError with expression', () => {
    assert.throws(
      () => compile('let a = 1, a = 2, a'),
      err => {
        assert.ok(err instanceof CompileError)
        assert.equal(err.expression, 'let a = 1, a = 2, a')
        return true
      }
    )
  })

  test('custom logical operator', () => {
    const fn = compile('a and b', {
      logicalOperators: {
        ...defaultLogicalOperators,
        'and': (left, right) => [left(), right()]
      }
    })

    assert.deepEqual(fn({ a: 1, b: 2 }), [1, 2])
  })

  test('custom getProperty', () => {
    const fn = compile('a.b', {
      getProperty: (_obj, key) => `custom:${String(key)}`
    })

    assert.equal(fn({ a: { b: 'real' } }), 'custom:b')
  })

  test('custom callFunction', () => {
    const fn = compile('f(1, 2)', {
      globals: {
        f: (a: number, b: number) => a + b
      },
      callFunction: (fn, args) =>
        args === null ? (fn as Function)() : `intercepted:${(fn as Function)(...args)}`
    })

    assert.equal(fn(), 'intercepted:3')
  })

  test('custom pipe', () => {
    const fn = compile('1 | % + 1', {
      pipe: (head, tail) => {
        let result = head
        for (const t of tail) {
          result = `piped:${t.next(result)}`
        }
        return result
      }
    })

    assert.equal(fn(), 'piped:2')
  })

  test('custom castToBoolean', () => {
    const fn = compile('if a then "yes" else "no"', {
      castToBoolean: val => val === 'truthy'
    })

    assert.equal(fn({ a: 'truthy' }), 'yes')
    assert.equal(fn({ a: true }), 'no')
  })

  test('mapRuntimeError: offset beyond code range', () => {
    // When an error comes from a global function, it should still
    // propagate as ExpressionError if the stack frame matches eval
    const fn = compile('func()', {
      globals: {
        func: () => {
          throw new Error('boom')
        }
      }
    })

    assert.throws(() => fn(), err => {
      assert.ok(err instanceof ExpressionError)
      assert.equal(err.message, 'boom')
      assert.equal(err.expression, 'func()')
      return true
    })
  })

  test('mapRuntimeError: adjustedCol < 0 returns original error', () => {
    // Create a function that throws an error with a crafted stack trace
    // where the column points into the bootstrap code area (col < bootstrapCodeHeadLen)
    const fn = compile('func()', {
      globals: {
        func: () => {
          const err = new Error('bootstrap area')
          err.stack =
            'Error: bootstrap area\n    at eval (<anonymous>:3:1)\n    at Object.<anonymous> (/foo.js:1:1)'
          throw err
        }
      }
    })

    assert.throws(() => fn(), {
      message: 'bootstrap area'
    })
  })
})

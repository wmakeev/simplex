import { test, suite } from 'node:test'
import assert from 'node:assert/strict'
import { compile, ExpressionError, CompileError } from '../src/index.js'
import { interpret } from '../src/interpreter.js'

suite('interpreter', () => {
  suite('no new Function (CSP emulation)', () => {
    test('interpret works when the Function constructor is unavailable', () => {
      const RealFunction = globalThis.Function

      // Emulate a strict CSP where `new Function` / `eval` are blocked.
      const Blocked = function () {
        throw new Error('Function constructor is blocked (CSP)')
      } as unknown as FunctionConstructor

      try {
        globalThis.Function = Blocked

        // `compile` relies on `new Function` → must fail under the stub.
        assert.throws(() => compile('1 + 2')(), /blocked/)

        // `interpret` is tree-walking → must keep working.
        assert.equal(interpret('1 + 2')(), 3)
        assert.equal(interpret('let x = 5, x * 2')(), 10)
        const lambda = interpret('x => x * 2')() as (n: number) => number
        assert.equal(lambda(21), 42)
      } finally {
        globalThis.Function = RealFunction
      }
    })
  })

  suite('error model (locations from AST nodes, no errorMapper)', () => {
    test('unknown identifier — location points at the identifier', () => {
      try {
        interpret('a')()
        assert.fail('should throw')
      } catch (err) {
        assert.ok(err instanceof ExpressionError)
        assert.equal(err.location?.start.offset, 0)
        assert.equal(err.location?.end.offset, 1)
      }
    })

    test('failing identifier inside a larger expression', () => {
      try {
        interpret('a + b')({ a: 1 })
        assert.fail('should throw')
      } catch (err) {
        assert.ok(err instanceof ExpressionError)
        assert.equal(err.location?.start.offset, 4)
        assert.equal(err.location?.end.offset, 5)
      }
    })

    test('non-null assertion failure carries the helper message', () => {
      assert.throws(() => interpret('a!')({ a: null }), {
        name: 'ExpressionError',
        message: 'Non-null assertion failed: value is null'
      })
    })

    test('compile-time validation throws CompileError (shared validate)', () => {
      assert.throws(() => interpret('let a = 1, a = 2, a'), CompileError)
    })
  })

  suite('edge cases', () => {
    const expect = (expression: string, data?: Record<string, unknown>) =>
      interpret(expression)(data)

    test('nested lambdas (curried closures)', () => {
      assert.equal((expect('a => b => a + b') as Function)(1)(2), 3)
    })

    test('nested let with sequential bindings', () => {
      assert.equal(expect('let a = 1, b = a + 1, a + b'), 3)
    })

    test('nested pipes with topic reference', () => {
      assert.equal(expect('1 | % + 2 | % * 4'), 12)
    })

    test('currying — leading placeholder', () => {
      const fn = expect('add(#, 3)', { add: (x: number, y: number) => x + y }) as (
        x: number
      ) => number
      assert.equal(fn(10), 13)
    })

    test('currying — multiple placeholders', () => {
      const fn = expect('fn(#, y, #)', {
        fn: (a: number, b: number, c: number) => `${a}-${b}-${c}`,
        y: 99
      }) as (a: number, c: number) => string
      assert.equal(fn(1, 2), '1-99-2')
    })

    test('template literal without interpolations', () => {
      assert.equal(expect('`just static text`'), 'just static text')
    })

    test('tagged template literal', () => {
      const result = interpret('tag`a ${x} b ${y}`')({
        tag: (strings: string[], ...values: unknown[]) => ({ strings, values }),
        x: 1,
        y: 2
      })
      assert.deepEqual(result, {
        strings: ['a ', ' b ', ''],
        values: [1, 2]
      })
    })

    test('sparse array preserves holes and length', () => {
      const result = expect('[1, , 3]') as unknown[]
      assert.equal(result.length, 3)
      assert.equal(1 in result, false)
      assert.deepEqual([result[0], result[2]], [1, 3])
    })

    test('null-safe member access', () => {
      assert.equal(expect('a.b.c', { a: null }), undefined)
    })

    test('null-safe call', () => {
      assert.equal(expect('f()', { f: null }), undefined)
    })

    test('extension method via ::', () => {
      const extensions = new Map<object | string, Record<string, Function>>([
        [Array, { sum: (arr: number[]) => arr.reduce((a, b) => a + b, 0) }]
      ])
      assert.equal(interpret('[1, 2, 3]::sum()', { extensions })(), 6)
    })

    test('computed object keys', () => {
      assert.deepEqual(expect('{["a" & "b"]: 42}'), { ab: 42 })
    })

    test('spread in array', () => {
      assert.deepEqual(expect('[1, ...xs, 4]', { xs: [2, 3] }), [1, 2, 3, 4])
    })

    test('spread in object', () => {
      assert.deepEqual(expect('{...o, a: 1}', { o: { a: 0, b: 2 } }), {
        a: 1,
        b: 2
      })
    })
  })
})

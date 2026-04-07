import { suite, test } from 'node:test'
import assert from 'node:assert/strict'
import { compile } from '../../src/index.js'
import { createStdlib } from '../../src/stdlib/index.js'

const { globals, extensions } = createStdlib()

suite('stdlib/integration', () => {
  suite('namespace style (globals)', () => {
    test('Math.abs', () => {
      const fn = compile('Math.abs(x)', { globals })
      assert.equal(fn({ x: -5 }), 5)
    })

    test('Math.abs returns null for NaN input', () => {
      const fn = compile('Math.abs(x)', { globals })
      assert.equal(fn({ x: 'foo' }), null)
    })

    test('Str.toUpperCase', () => {
      const fn = compile('Str.toUpperCase(s)', { globals })
      assert.equal(fn({ s: 'hello' }), 'HELLO')
    })

    test('Arr.map with lambda', () => {
      const fn = compile('Arr.map(arr, x => x + 1)', { globals })
      assert.deepEqual(fn({ arr: [1, 2, 3] }), [2, 3, 4])
    })

    test('Arr.filter with lambda', () => {
      const fn = compile('Arr.filter(arr, x => x > 2)', { globals })
      assert.deepEqual(fn({ arr: [1, 2, 3, 4] }), [3, 4])
    })

    test('Obj.keys', () => {
      const fn = compile('Obj.keys(o)', { globals })
      assert.deepEqual(fn({ o: { a: 1, b: 2 } }), ['a', 'b'])
    })

    test('Json.parse', () => {
      const fn = compile('Json.parse(s)', { globals })
      assert.deepEqual(fn({ s: '{"a":1}' }), { a: 1 })
    })

    test('top-level utilities', () => {
      const fn1 = compile('empty(x)', { globals })
      assert.equal(fn1({ x: '' }), true)
      assert.equal(fn1({ x: 'a' }), false)

      const fn2 = compile('exists(x)', { globals })
      assert.equal(fn2({ x: null }), false)
      assert.equal(fn2({ x: 0 }), true)
    })

    test('chained namespace calls', () => {
      const fn = compile(
        'Str.toUpperCase(Arr.join(Arr.sort(arr), ", "))',
        { globals }
      )
      assert.equal(fn({ arr: [3, 1, 2] }), '1, 2, 3')
    })

    test('Num.parseInt with NaN → null', () => {
      const fn = compile('Num.parseInt(s)', { globals })
      assert.equal(fn({ s: '42' }), 42)
      assert.equal(fn({ s: 'abc' }), null)
    })
  })

  suite('extension style (::)', () => {
    test('string::toUpperCase', () => {
      const fn = compile('s::toUpperCase()', { globals, extensions })
      assert.equal(fn({ s: 'hello' }), 'HELLO')
    })

    test('array::map', () => {
      const fn = compile('arr::map(x => x * 2)', { globals, extensions })
      assert.deepEqual(fn({ arr: [1, 2, 3] }), [2, 4, 6])
    })

    test('array::sort immutability', () => {
      const fn = compile('arr::sort()', { globals, extensions })
      const data = { arr: [3, 1, 2] }
      assert.deepEqual(fn(data), [1, 2, 3])
      assert.deepEqual(data.arr, [3, 1, 2])
    })

    test('array::filter with lambda', () => {
      const fn = compile('arr::filter(x => x > 2)', { globals, extensions })
      assert.deepEqual(fn({ arr: [1, 2, 3, 4] }), [3, 4])
    })

    test('object::keys', () => {
      const fn = compile('o::keys()', { globals, extensions })
      assert.deepEqual(fn({ o: { a: 1, b: 2 } }), ['a', 'b'])
    })

    test('chained extensions', () => {
      const fn = compile(
        'arr::filter(x => x > 1)::map(x => x * 10)',
        { globals, extensions }
      )
      assert.deepEqual(fn({ arr: [1, 2, 3] }), [20, 30])
    })
  })

  suite('namespace and extension equivalence', () => {
    test('Arr.map and ::map give same result', () => {
      const nsResult = compile('Arr.map(arr, x => x + 1)', { globals })({
        arr: [1, 2, 3]
      })
      const extResult = compile('arr::map(x => x + 1)', {
        globals,
        extensions
      })({ arr: [1, 2, 3] })
      assert.deepEqual(nsResult, extResult)
    })

    test('Str.toUpperCase and ::toUpperCase give same result', () => {
      const nsResult = compile('Str.toUpperCase(s)', { globals })({
        s: 'hello'
      })
      const extResult = compile('s::toUpperCase()', { globals, extensions })({
        s: 'hello'
      })
      assert.equal(nsResult, extResult)
    })
  })

  suite('toString via extensions (::)', () => {
    test('string::toString', () => {
      const fn = compile('"hello"::toString()', { globals, extensions })
      assert.equal(fn(), 'hello')
    })

    test('number::toString with radix', () => {
      const fn = compile('n::toString(16)', { globals, extensions })
      assert.equal(fn({ n: 255 }), 'ff')
    })

    test('array::toString', () => {
      const fn = compile('arr::toString()', { globals, extensions })
      assert.equal(fn({ arr: [1, 2, 3] }), '1,2,3')
    })

    test('object::toString', () => {
      const fn = compile('o::toString()', { globals, extensions })
      assert.equal(fn({ o: { a: 1 } }), '{"a":1}')
    })
  })

  suite('custom globals', () => {
    test('custom globals work alongside stdlib', () => {
      const customGlobals = { ...globals, double: (x: number) => x * 2 }
      const fn = compile('double(Math.abs(x))', { globals: customGlobals })
      assert.equal(fn({ x: -5 }), 10)
    })
  })
})

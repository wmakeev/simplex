import assert from 'node:assert/strict'
import { suite, test } from 'node:test'
import { compile } from '../src/index.js'

suite('functions', () => {
  test('function call on null', () => {
    const fn = compile('func(24)', {
      globals: {
        func: null
      }
    })

    assert.equal(fn(), null)
  })

  test('function call on null', () => {
    const fn = compile('null | %()')

    assert.equal(fn(), null)
  })

  test('function call without arguments', () => {
    const fn = compile('func(24)', {
      globals: {
        func: () => 42
      }
    })

    assert.equal(fn(), 42)
  })

  test('function call with one argument', () => {
    const fn = compile('func(a)', {
      globals: {
        a: 42,
        func: (a: number) => a + 1
      }
    })

    assert.equal(fn(), 43)
  })

  test('function call with many argument', () => {
    const fn = compile('func(24, add2)', {
      globals: {
        a: 42,
        add2: (a: number) => a + 2,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        func: (a: number, fn: (arg0: number) => any) => fn(a)
      }
    })

    assert.equal(fn(), 26)
  })

  test('function sequence call', () => {
    const fn = compile('thunk(24, add2)()', {
      globals: {
        a: 42,
        add2: (a: number) => a + 2,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        thunk: (a: number, fn: (arg0: number) => any) => () => fn(a)
      }
    })

    assert.equal(fn(), 26)
  })

  test('function sequence call with arg', () => {
    const fn = compile('thunk(24, add2)("4")', {
      globals: {
        a: 42,
        add2: (a: number) => a + 2,
        thunk: (a: number, fn: (arg0: number) => any) => (num: any) =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-plus-operands
          fn(a) + num
      }
    })

    assert.equal(fn(), '264')
  })
})

suite('curried functions', () => {
  test('function curry', () => {
    const fn = compile('func(#)', {
      globals: {
        func: () => 42
      }
    })

    const result = fn()

    assert.ok(typeof result === 'function')
    assert.equal(result('foo'), 42)
  })

  test('function curry (2 args) #1', () => {
    const fn = compile('func(#, 3)', {
      globals: {
        func: (a: number, b: number) => a / b
      }
    })

    const result = fn()

    assert.ok(typeof result === 'function')
    assert.equal(result(9), 3)
  })

  test('function curry (2 args) #2', () => {
    const fn = compile('func(9, #)', {
      globals: {
        func: (a: number, b: number) => a / b
      }
    })

    const result = fn()

    assert.ok(typeof result === 'function')
    assert.equal(result(3), 3)
  })

  test('curried function catch context', () => {
    const fn = compile('((fn, a) => fn(a))(func(#, a), 84)', {
      globals: {
        a: 42,
        func: (a: number, b: number) => a / b
      }
    })

    assert.equal(fn(), 2)
  })
})

suite('lambdas', () => {
  test('lambda without arguments', () => {
    const fn = compile('() => 42')

    const result = fn()

    assert.ok(typeof result === 'function')
    assert.equal(result(), 42)
  })

  test('lambda with arguments', () => {
    const fn = compile('a => a + 1')

    const result = fn()

    assert.ok(typeof result === 'function')
    assert.equal(result(1), 2)
  })

  test('lambda with many arguments', () => {
    const fn = compile('(a, b) => a + b')

    const result = fn()

    assert.ok(typeof result === 'function')
    assert.equal(result(1, 2), 3)
  })

  test('nested lambda', () => {
    const fn = compile('a => b => a + b')

    const result = fn()

    assert.ok(typeof result === 'function')
    assert.equal(result(1)(2), 3)
  })

  test('nested lambda', () => {
    const fn = compile('a => b => a + b')

    const result = fn()

    assert.ok(typeof result === 'function')
    assert.equal(result(1)(2), 3)
  })

  test('lambda argument override globals', () => {
    const fn = compile('(a => a + 1)(24)', {
      globals: {
        a: 42
      }
    })

    assert.equal(fn(), 25)
  })

  test('lambda catch context', () => {
    const fn = compile('((fn, a) => fn())(() => a, 24)', {
      globals: {
        a: 42
      }
    })

    assert.equal(fn(), 42)
  })
})

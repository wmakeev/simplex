import assert from 'node:assert/strict'
import { suite, test } from 'node:test'
import { compile, CompileError } from '../src/index.js'

suite('let', () => {
  test('with one variable', () => {
    const fn = compile('let a = 42, a', {
      globals: {
        a: 'never'
      }
    })

    assert.equal(fn(), 42)
  })

  test('variable captures outer scope on init', () => {
    const fn = compile('let a = a, a', {
      globals: {
        a: 42
      }
    })

    assert.equal(fn(), 42)
  })

  test('error on duplicated names', () => {
    try {
      compile('let a = 1, a = 2, a')
      assert.fail('should throw')
    } catch (err) {
      assert.ok(err instanceof CompileError)
      assert.ok(err.name, 'CompileError')
      assert.equal(
        err.message,
        '"a" name defined inside let expression was repeated'
      )
      assert.equal(err.location?.start.offset, 11)
      assert.equal(err.location?.end.offset, 12)
    }
  })

  test('with multiple variables and scope catch in lambda', () => {
    const fn = compile('(a => let a = a + 1, b = a, a + b)(a)', {
      globals: {
        a: 42
      }
    })

    assert.equal(fn(), 86)
  })

  test('nested let', () => {
    const fn = compile('let a = 1, let b = a + 1, a + b')

    assert.equal(fn(), 3)
  })

  test('lambda param shadows let binding', () => {
    const fn = compile('let x = 1, (x => x + 2)(10)')

    assert.equal(fn(), 12)
  })

  test('three sequential bindings', () => {
    const fn = compile('let a = 1, b = a + 1, c = a + b, c')

    assert.equal(fn(), 3)
  })

  test('multiline let with pipe body', () => {
    const fn = compile(
      `
      let
        add1 = a => a + 1,
        mult2 = a => a * 2,

        add1(a - 2) | mult2(%)
      `,
      {
        globals: {
          a: 42
        }
      }
    )

    assert.equal(fn(), 82)
  })
})

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

  test('with one variable and scope catch', () => {
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

  test('with one variable and scope catch', () => {
    const fn = compile('(a => let a = a + 1, b = a, a + b)(a)', {
      globals: {
        a: 42
      }
    })

    assert.equal(fn(), 86)
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

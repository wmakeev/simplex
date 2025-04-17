import assert from 'node:assert/strict'
import { suite, test } from 'node:test'
import { compile, ExpressionError, UnexpectedTypeError } from '../src/index.js'
import { codeFrameColumns } from 'awesome-code-frame'

suite('errors', () => {
  test('UnexpectedTypeError class', () => {
    const val1 = {}
    const err1 = new UnexpectedTypeError(['foo'], val1)

    assert.equal(err1.message, 'Expected foo, but got Object instead')
    assert.deepEqual(err1.expectedTypes, ['foo'])
    assert.equal(err1.receivedValue, val1)

    const val2 = [] as any[]
    const err2 = new UnexpectedTypeError(['foo', 'bar'], val2)

    assert.equal(err2.message, 'Expected foo or bar, but got Array instead')
    assert.deepEqual(err2.expectedTypes, ['foo', 'bar'])
    assert.equal(err2.receivedValue, val2)

    const val3 = () => false
    const err3 = new UnexpectedTypeError(['foo', 'bar', 'baz'], val3)

    assert.equal(
      err3.message,
      'Expected foo, bar or baz, but got function instead'
    )
    assert.deepEqual(err3.expectedTypes, ['foo', 'bar', 'baz'])
    assert.equal(err3.receivedValue, val3)
  })

  test('simple', () => {
    const fn = compile('a')

    try {
      fn()
      assert.fail('should fail')
    } catch (err) {
      assert.ok(err instanceof ExpressionError)

      assert.deepEqual(err.location, {
        start: {
          offset: 0,
          line: 1,
          column: 1
        },
        end: {
          offset: 1,
          line: 1,
          column: 2
        }
      })
    }
  })

  test('simple one line', () => {
    const fn = compile('a + b')

    try {
      fn({ a: 1 })
      assert.fail('should fail')
    } catch (err) {
      assert.ok(err instanceof ExpressionError)

      assert.deepEqual(err.location, {
        start: {
          offset: 4,
          line: 1,
          column: 5
        },
        end: {
          offset: 5,
          line: 1,
          column: 6
        }
      })

      const codeFrame = codeFrameColumns(err.expression, err.location)

      assert.equal(
        codeFrame,
        // prettier-ignore
        [
          '> 1 | a + b',
          '    |     ^'
        ].join('\n')
      )
    }
  })

  test('simple multi line', () => {
    const expression =
      // prettier-ignore
      [
        'a',
        '  +',
        '    b'
      ].join('\n')

    const fn = compile(expression)

    try {
      fn({ a: 1 })
      assert.fail('should fail')
    } catch (err) {
      assert.ok(err instanceof ExpressionError)

      assert.deepEqual(err.location, {
        start: {
          offset: 10,
          line: 3,
          column: 5
        },
        end: {
          offset: 11,
          line: 3,
          column: 6
        }
      })

      const codeFrame = codeFrameColumns(err.expression, err.location)

      assert.equal(
        codeFrame,

        // prettier-ignore
        [
          "  1 | a",
          "  2 |   +",
          "> 3 |     b",
          "    |     ^"
        ].join('\n')
      )
    }
  })

  test('complex multi line', () => {
    const expression =
      // prettier-ignore
      [
        '(',
        '  if -a > 1 + x then',
        '    "foo" & b',
        '  else',
        '    "bar"',
        ')',
        '  | append(%, "-baz")',
        '  | % & c'
      ].join('\n')

    const fn = compile(expression, {
      globals: {
        append: (a: any, b: any) => `${a}${b}`
      }
    })

    assert.equal(fn({ a: -3, b: '-ok', c: '-end', x: 1 }), 'foo-ok-baz-end')

    try {
      fn({ b: '-ok', c: '-end', x: 1 })
      assert.fail('should fail')
    } catch (err) {
      assert.ok(err instanceof ExpressionError)
      assert.ok(err.location)

      const codeFrame = codeFrameColumns(err.expression, err.location)

      assert.equal(
        codeFrame,

        // prettier-ignore
        [
          '  1 | (',
          '> 2 |   if -a > 1 + x then',
          '    |       ^',
          '  3 |     "foo" & b',
          '  4 |   else',
          '  5 |     "bar"'
        ].join('\n')
      )
    }

    try {
      fn({ a: -3, b: '-ok', c: '-end', x: 'str' })
      assert.fail('should fail')
    } catch (err) {
      assert.ok(err instanceof ExpressionError)
      assert.equal(
        err.message,
        'Expected number or bigint, but got string instead'
      )
      assert.ok(err.location)

      const codeFrame = codeFrameColumns(err.expression, err.location)

      assert.equal(
        codeFrame,

        // prettier-ignore
        [
          '  1 | (',
          '> 2 |   if -a > 1 + x then',
          '    |           ^^^^^',
          '  3 |     "foo" & b',
          '  4 |   else',
          '  5 |     "bar"'
        ].join('\n')
      )
    }
  })

  test('complex multi line error', () => {
    const expression =
      // prettier-ignore
      [
        '(',
        '  if -a > 1 ',
        '+ x then',
        '    "foo" & b',
        '  else',
        '    "bar"',
        ')',
        '  | append(%, "-baz")',
        '  | % & c'
      ].join('\n')

    const fn = compile(expression, {
      globals: {
        append: (a: any, b: any) => `${a}${b}`
      }
    })

    try {
      fn({ a: -3, b: '-ok', c: '-end', x: 'str' })
      assert.fail('should fail')
    } catch (err) {
      assert.ok(err instanceof ExpressionError)
      assert.equal(
        err.message,
        'Expected number or bigint, but got string instead'
      )
      assert.ok(err.location)

      const codeFrame = codeFrameColumns(err.expression, err.location)

      assert.equal(
        codeFrame,

        // prettier-ignore
        [
          '  1 | (',
          '> 2 |   if -a > 1 ',
          '    |           ^^',
          '> 3 | + x then',
          '    | ^^^^',
          '  4 |     "foo" & b',
          '  5 |   else',
          '  6 |     "bar"'
        ].join('\n')
      )

      console.log(
        codeFrameColumns(expression, err.location, {
          message: err.message,
          forceColor: true,
          highlightCode: true
        })
      )
    }
  })

  test('string property access error #1', () => {
    const fn = compile('"".foo')

    try {
      fn()
      assert.fail('should fail')
    } catch (err) {
      assert.ok(err instanceof ExpressionError)
      assert.equal(err.message, 'Expected object, but got string instead')

      assert.deepEqual(err.location, {
        start: {
          offset: 0,
          line: 1,
          column: 1
        },
        end: {
          offset: 6,
          line: 1,
          column: 7
        }
      })
    }
  })

  test('object property access error #2', () => {
    const fn = compile('{}[{}]')

    try {
      fn()
      assert.fail('should fail')
    } catch (err) {
      assert.ok(err instanceof ExpressionError)
      assert.equal(
        err.message,
        'Expected simple type object key, but got Object instead'
      )

      assert.deepEqual(err.location, {
        start: {
          offset: 0,
          line: 1,
          column: 1
        },
        end: {
          offset: 6,
          line: 1,
          column: 7
        }
      })
    }
  })

  test('incorrect using of "in" operator', () => {
    assert.throws(
      () => {
        compile('"foo" in "bar"')()
      },
      {
        message: 'Cannot use "in" operator to search for string key in string',
        location: {
          end: {
            column: 15,
            line: 1,
            offset: 14
          },
          start: {
            column: 1,
            line: 1,
            offset: 0
          }
        }
      }
    )

    assert.throws(
      () => {
        compile('false in true')()
      },
      {
        message: 'Cannot use "in" operator to search for boolean key in boolean'
      }
    )
  })
})

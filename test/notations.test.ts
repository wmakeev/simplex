/* eslint-disable no-sparse-arrays */

import { test, suite } from 'node:test'
import { compile } from '../src/compiler.js'
import assert from 'node:assert/strict'

const evalExp = (expression: string, data?: Record<string, unknown>) => {
  return compile(expression, {
    globals: {
      min: Math.min,
      max: Math.max
    }
  })(data)
}

suite('notations', () => {
  test('string', () => {
    assert.deepEqual(compile('"123\\n\\t🤩"')(), '123\n\t🤩')
    assert.deepEqual(compile('"123\\\n456"')(), '123456')
    assert.deepEqual(compile("'123\\\n456'")(), '123456')
    assert.deepEqual(compile("'\\\n456'")(), '456')
    assert.deepEqual(compile('"\\b\\f\\n\\r\\t\\v"')(), '\b\f\n\r\t\x0B')
    assert.deepEqual(compile('"\\xFF"')(), '\xFF')
  })

  test('unicode', () => {
    assert.deepEqual(compile('\u01C5')({ '\u01C5': 42 }), 42)
    assert.deepEqual(compile('"\\u0041"')(), 'A')
  })

  test('number', () => {
    assert.deepEqual(compile('0x10')(), 16)
    assert.deepEqual(compile('0xFF')(), 255)
    assert.deepEqual(compile('0.120')(), 0.12)
    assert.deepEqual(compile('.123')(), 0.123)
  })

  test('object', () => {
    assert.deepEqual(
      compile(
        '{ a: 1, "b": "foo", c: 1 + 2, d: true, e: { a: 3, }, f: [1, 2] }'
      )(),
      { a: 1, b: 'foo', c: 1 + 2, d: true, e: { a: 3 }, f: [1, 2] }
    )
  })

  test('array', () => {
    assert.deepEqual(compile('[1, 2, , , { a: 1 }, true, 5-2, ]')(), [
      1,
      2,
      ,
      ,
      { a: 1 },
      true,
      5 - 2
    ])
  })

  test('condition', () => {
    assert.deepEqual(
      compile(
        'if 1 < 2 then if 3 < 4 then 42 else 420 else if 5 < 6 then 69 else -1/12'
      )(),
      42
    )

    assert.deepEqual(
      compile(
        'if 1 < 2 then if 3 > 4 then 42 else 420 else if 5 < 6 then 69 else -1/12'
      )(),
      420
    )

    assert.strictEqual(
      compile(
        'if 1 > 2 then if 3 < 4 then 42 else 420 else if 5 < 6 then 69 else -1/12'
      )(),
      69
    )

    assert.strictEqual(
      compile(
        'if 1 > 2 then if 3 < 4 then 42 else 420 else if 5 > 6 then 69 else -1/12'
      )(),
      -1 / 12
    )
  })

  test('comments', () => {
    assert.strictEqual(evalExp('/* comment */ "hello" == "hello"'), true)
    assert.strictEqual(evalExp('"hello/* comment */"'), 'hello/* comment */')

    assert.strictEqual(
      evalExp(
        `
        /**
          * Some multiline comment
          **/ "foo " & "hello/* comment */" & /** comment*/ " bar " &

          /**/ a /**** comment ***/ & " -/* zoo **/" /**/
            & " end"
          /**/

          /* end */
        `,
        { a: '=/* foo =*/42' }
      ),
      'foo hello/* comment */ bar =/* foo =*/42 -/* zoo **/ end'
    )

    assert.strictEqual(
      evalExp(
        `
        /**
          * Some calculation
          **/

          /* sum 1 + 2 */
          (1 + 2) +

          /* mult 3 * 4 */
          (3 * 4) +

          /* div 12 / 3 */
          (12 / 3) +

          /* prop */
          42
        `
      ),
      1 + 2 + 3 * 4 + 12 / 3 + 42
    )
  })
})

/* eslint-disable no-sparse-arrays */

import { test, suite } from 'node:test'
import { compile, CompileError } from '../src/index.js'
import assert from 'node:assert/strict'
import { evalExp } from './helpers.js'

suite('notations', () => {
  test('string', () => {
    assert.deepEqual(compile('"123\\n\\t🤩"')(), '123\n\t🤩')
    assert.deepEqual(compile('"123\\\n456"')(), '123456')
    assert.deepEqual(compile("'123\\\n456'")(), '123456')
    assert.deepEqual(compile("'\\\n456'")(), '456')
    assert.deepEqual(compile('"\\b\\f\\n\\r\\t\\v"')(), '\b\f\n\r\t\x0B')
    assert.deepEqual(compile('"\\xFF"')(), '\xFF')

    // Null character
    assert.deepEqual(compile('"\\0"')(), '\0')

    // Backslash escape
    assert.deepEqual(compile('"\\\\text"')(), '\\text')

    // Quote escapes
    assert.deepEqual(compile("'it\\'s'")(), "it's")
    assert.deepEqual(compile('"say \\"hi\\""')(), 'say "hi"')

    // Hex escapes
    assert.deepEqual(compile('"\\x41"')(), 'A')
    assert.deepEqual(compile('"\\x00"')(), '\x00')

    // NonEscapeCharacter (backslash + non-special char → char itself)
    assert.deepEqual(compile('"\\q"')(), 'q')
    assert.deepEqual(compile('"\\z"')(), 'z')

    // Multiple unicode escapes
    assert.deepEqual(compile('"\\u0041\\u0042"')(), 'AB')

    // Mixed escapes
    assert.deepEqual(compile('"\\n\\u0041\\xFF"')(), '\nA\xFF')
  })

  test('unicode', () => {
    assert.deepEqual(compile('"\\u0041"')(), 'A')

    // Unicode identifier categories
    assert.deepEqual(compile('\u01C5')({ '\u01C5': 42 }), 42) // Lt (titlecase)
    assert.deepEqual(compile('привет')({ привет: 1 }), 1) // Ll (lowercase)
    assert.deepEqual(compile('Σ')({ Σ: 2 }), 2) // Lu (uppercase)
    assert.deepEqual(compile('x\u02B0')({ 'x\u02B0': 3 }), 3) // Lm (modifier) in part
    assert.deepEqual(compile('中')({ 中: 4 }), 4) // Lo (other letter)
    assert.deepEqual(compile('\u2160')({ '\u2160': 5 }), 5) // Nl (letter number, Ⅰ)
    assert.deepEqual(compile('e\u0301')({ 'e\u0301': 6 }), 6) // Mn (combining mark) in part
    assert.deepEqual(compile('x\u0660')({ 'x\u0660': 7 }), 7) // Nd (digit) in part
    assert.deepEqual(compile('x\uFE33y')({ 'x\uFE33y': 8 }), 8) // Pc (connector) in part
    assert.deepEqual(compile('a\u200Cb')({ 'a\u200Cb': 9 }), 9) // ZWNJ in part
    assert.deepEqual(compile('a\u200Db')({ 'a\u200Db': 10 }), 10) // ZWJ in part
    assert.deepEqual(compile('$x')({ $x: 11 }), 11) // $ as IdentifierStart
  })

  test('unicode whitespace', () => {
    assert.deepEqual(compile('\u20001 + 2')(), 3) // En Quad
    assert.deepEqual(compile('1\u2003+\u20032')(), 3) // Em Space
    assert.deepEqual(compile('\u30001')(), 1) // Ideographic Space
    assert.deepEqual(compile('1\u202F+\u202F2')(), 3) // Narrow No-Break Space
    assert.deepEqual(compile('1\u205F+ 2')(), 3) // Medium Mathematical Space
  })

  test('line separators', () => {
    assert.deepEqual(compile('1 +\u20282')(), 3) // Line Separator
    assert.deepEqual(compile('1 +\u20292')(), 3) // Paragraph Separator
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

    assert.deepEqual(compile('{ ["foo"]: "bar" }')(), { foo: 'bar' })
    assert.deepEqual(compile('{ ["a" & "b"]: 42 }')(), { ab: 42 })
    assert.deepEqual(compile('{ [1 + 1]: "two" }')(), { 2: 'two' })
    assert.deepEqual(compile('{ a: 1, ["b"]: 2 }')(), { a: 1, b: 2 })

    // Spread
    assert.deepEqual(compile('{ ...{ a: 1 } }')(), { a: 1 })
    assert.deepEqual(
      compile('let b = { b: "bar" }, { a: "foo", ...b, c: 42 }')(),
      { a: 'foo', b: 'bar', c: 42 }
    )
    assert.deepEqual(compile('{ a: 1, ...{ a: 2 } }')(), { a: 2 })
    assert.deepEqual(compile('{ ...{ a: 1 }, a: 2 }')(), { a: 2 })
    assert.throws(() => compile('{ ...null }')(), {
      message: 'Expected object, but got Null instead'
    })
    assert.throws(() => compile('{ ...42 }')(), {
      message: 'Expected object, but got number instead'
    })
    assert.throws(() => compile('{ ...[1, 2] }')(), {
      message: 'Expected object, but got Array instead'
    })
    assert.throws(() => compile('{ ..."str" }')(), {
      message: 'Expected object, but got string instead'
    })
    assert.deepEqual(compile('{ a: 1, ...{ b: 2 }, c: 3 }')(), {
      a: 1,
      b: 2,
      c: 3
    })
    assert.deepEqual(compile('{ ...{ a: 1 }, ...{ b: 2 } }')(), {
      a: 1,
      b: 2
    })

    assert.throws(
      () => compile('{1e999: "v"}'),
      err => {
        assert.ok(err instanceof CompileError)
        assert.match(err.message, /Invalid object key/)
        return true
      }
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

    // Spread
    assert.deepEqual(compile('[1, ...[2, 3]]')(), [1, 2, 3])
    assert.deepEqual(compile('let a = [2, 3], [1, ...a, 4]')(), [1, 2, 3, 4])
    assert.deepEqual(compile('[...[1], ...[2]]')(), [1, 2])
    assert.deepEqual(compile('[...[]]')(), [])
    assert.throws(() => compile('[...42]')(), {
      message: 'Expected Array, but got number instead'
    })
    assert.throws(() => compile('[...null]')(), {
      message: 'Expected Array, but got Null instead'
    })
    assert.throws(() => compile('[..."str"]')(), {
      message: 'Expected Array, but got string instead'
    })
    assert.throws(() => compile('[...{a: 1}]')(), {
      message: 'Expected Array, but got Object instead'
    })
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

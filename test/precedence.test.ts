import { test, suite } from 'node:test'
import { compile } from '../src/compiler.js'
import assert from 'node:assert/strict'

//TODO
//

suite('precedence', () => {
  test('common', () => {
    assert.equal(compile('not false and true')(), true)
    assert.equal(compile('not (false or true)')(), false)
  })

  test('pipeline', () => {
    assert.equal(
      compile('a | if _ ?? false then c else d + 2 | _ + 1')({
        a: null,
        b: true,
        c: 5,
        d: 3
      }),
      6,
      'pipe operator #1'
    )

    assert.equal(compile('if 1 then 2 else 3 | _ + 2')(), 2, 'pipe operator #2')

    assert.equal(
      compile('(if 1 then 2 else 3) | _ + 2')(),
      4,
      'pipe operator #3'
    )
  })
})

// Template literal tests

import { test, suite } from 'node:test'
import { compile } from '../src/index.js'
import assert from 'node:assert/strict'
import { evalExp } from './helpers.js'

suite('template literal', () => {
  test('basic interpolation', () => {
    assert.equal(compile('`hello ${name}`')({ name: 'world' }), 'hello world')
  })

  test('multiple interpolations', () => {
    assert.equal(
      compile('`${a} + ${b} = ${a + b}`')({ a: 1, b: 2 }),
      '1 + 2 = 3'
    )
  })

  test('no interpolation', () => {
    assert.equal(compile('`just a string`')(), 'just a string')
  })

  test('empty template', () => {
    assert.equal(compile('``')(), '')
  })

  test('nested templates', () => {
    assert.equal(
      compile('`outer ${`inner ${x}`}`')({ x: 42 }),
      'outer inner 42'
    )
  })

  test('expression in interpolation', () => {
    assert.equal(compile('`result: ${1 + 2}`')(), 'result: 3')
  })

  test('escape sequences', () => {
    assert.equal(compile('`line1\\nline2`')(), 'line1\nline2')
    assert.equal(compile('`tab\\there`')(), 'tab\there')
  })

  test('backtick escape', () => {
    assert.equal(compile('`contains \\` backtick`')(), 'contains ` backtick')
  })

  test('dollar escape', () => {
    assert.equal(compile('`price: \\${99}`')(), 'price: ${99}')
  })

  test('with pipes', () => {
    assert.equal(
      evalExp('items | `Count: ${%.length}`', { items: [1, 2, 3] }),
      'Count: 3'
    )
  })

  test('type coercion - number', () => {
    assert.equal(compile('`n:${42}`')(), 'n:42')
  })

  test('type coercion - null', () => {
    assert.equal(compile('`n:${null}`')(), 'n:null')
  })

  test('type coercion - boolean', () => {
    assert.equal(compile('`b:${true}`')(), 'b:true')
  })

  test('unknown variable throws ExpressionError', () => {
    assert.throws(() => compile('`${unknown_var}`')(), {
      name: 'ExpressionError'
    })
  })

  test('conditional inside template', () => {
    assert.equal(
      compile('`${if x then "yes" else "no"}`')({ x: true }),
      'yes'
    )
  })

  test('lambda inside template', () => {
    assert.equal(compile('`${(x => x + 1)(5)}`')(), '6')
  })

  test('only interpolation', () => {
    assert.equal(compile('`${42}`')(), '42')
  })

  test('adjacent interpolations', () => {
    assert.equal(compile('`${1}${2}${3}`')(), '123')
  })

  test('multiline template', () => {
    assert.equal(compile('`line1\nline2`')(), 'line1\nline2')
  })

  test('let expression inside template', () => {
    assert.equal(compile('`${let x = 5, x + 1}`')(), '6')
  })

  test('string concatenation operator inside template', () => {
    assert.equal(
      compile('`${a & b}`')({ a: 'hello', b: 'world' }),
      'helloworld'
    )
  })

  test('template as function argument', () => {
    assert.equal(
      compile('fn(`hello ${name}`)')({
        fn: (s: string) => s.toUpperCase(),
        name: 'world'
      }),
      'HELLO WORLD'
    )
  })

  test('template with unicode escape', () => {
    assert.equal(compile('`\\u0041`')(), 'A')
  })

  test('lone dollar sign is literal text', () => {
    assert.equal(compile('`cost: $5`')(), 'cost: $5')
  })
})

suite('tagged template literal', () => {
  const tag = (strings: string[], ...values: unknown[]) => ({ strings, values })

  test('basic tag function without interpolation', () => {
    const result = compile('tag`hello`')({ tag }) as ReturnType<typeof tag>
    assert.deepEqual(result.strings, ['hello'])
    assert.deepEqual(result.values, [])
  })

  test('tag with single interpolation', () => {
    const result = compile('tag`hello ${name}`')({
      tag,
      name: 'world'
    }) as ReturnType<typeof tag>
    assert.deepEqual(result.strings, ['hello ', ''])
    assert.deepEqual(result.values, ['world'])
  })

  test('tag with multiple interpolations', () => {
    const result = compile('tag`${a} + ${b} = ${c}`')({
      tag,
      a: 1,
      b: 2,
      c: 3
    }) as ReturnType<typeof tag>
    assert.deepEqual(result.strings, ['', ' + ', ' = ', ''])
    assert.deepEqual(result.values, [1, 2, 3])
  })

  test('values are NOT cast to string', () => {
    const result = compile('tag`${42}`')({ tag }) as ReturnType<typeof tag>
    assert.strictEqual(result.values[0], 42)
    assert.equal(typeof result.values[0], 'number')
  })

  test('tag from member expression', () => {
    const obj = { tag }
    const result = compile('obj.tag`hello ${x}`')({
      obj,
      x: 1
    }) as ReturnType<typeof tag>
    assert.deepEqual(result.strings, ['hello ', ''])
    assert.deepEqual(result.values, [1])
  })

  test('tag from globals', () => {
    const result = compile('tag`value: ${x}`', { globals: { tag } })({
      x: 42
    }) as ReturnType<typeof tag>
    assert.deepEqual(result.strings, ['value: ', ''])
    assert.deepEqual(result.values, [42])
  })

  test('null tag returns undefined', () => {
    assert.equal(compile('tag`hello`')({ tag: null }), undefined)
  })

  test('tag with pipe', () => {
    const result = evalExp('42 | tag`value: ${%}`', { tag }) as ReturnType<
      typeof tag
    >
    assert.deepEqual(result.strings, ['value: ', ''])
    assert.deepEqual(result.values, [42])
  })

  test('real-world: column reference', () => {
    const $ = (strings: string[], ...values: unknown[]) => {
      let result = ''
      strings.forEach((s, i) => {
        result += s
        if (i < values.length) result += String(values[i])
      })
      return { type: 'column', name: result }
    }
    const result = compile('$`My column ${name}` == 42')({
      $,
      name: 'foo'
    })
    assert.equal(result, false)

    const col = compile('$`My column ${name}`')({
      $,
      name: 'foo'
    }) as ReturnType<typeof $>
    assert.deepEqual(col, { type: 'column', name: 'My column foo' })
  })

  test('nested tagged templates', () => {
    const result = compile('tag`outer ${tag`inner`}`')({
      tag
    }) as ReturnType<typeof tag>
    assert.deepEqual(result.strings, ['outer ', ''])
    assert.deepEqual(result.values, [{ strings: ['inner'], values: [] }])
  })

  test('tag function result can be any type', () => {
    const num = () => 42
    assert.equal(compile('num`ignored`')({ num }), 42)
  })

  test('tag with empty template', () => {
    const result = compile('tag``')({ tag }) as ReturnType<typeof tag>
    assert.deepEqual(result.strings, [''])
    assert.deepEqual(result.values, [])
  })
})

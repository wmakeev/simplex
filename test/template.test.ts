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

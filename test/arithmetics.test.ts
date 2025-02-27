import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compile } from '../src/index.js'

const evalExp = (expression: string, data?: Record<string, unknown>) => {
  return compile(expression, {
    globals: {
      min: Math.min,
      max: Math.max
    }
  })(data)
}

describe('arithmetics', () => {
  it('can do simple numeric expressions', () => {
    assert.equal(evalExp('1 + 2 * 3'), 7)
    assert.equal(evalExp('2 * 3 + 1'), 7)
    assert.equal(evalExp('1 + (2 * 3)'), 7)
    assert.equal(evalExp('(1 + 2) * 3'), 9)
    assert.equal(evalExp('((1 + 2) * 3 / 2 + 1 - 4 + 2 ^ 3) * -2'), -19)
    assert.equal(evalExp('1.4 * 1.1'), 1.54)
    assert.equal(evalExp('97 mod 10'), 7)
    assert.equal(evalExp('2 * 3 ^ 2'), 18)
  })

  it('supports functions with multiple args', () => {
    assert.equal(evalExp('min()'), Infinity)
    assert.equal(evalExp('min(2)'), 2)
    assert.equal(evalExp('max(2)'), 2)
    assert.equal(evalExp('min(2, 5)'), 2)
    assert.equal(evalExp('max(2, 5)'), 5)
    assert.equal(evalExp('min(2, 5, 6)'), 2)
    assert.equal(evalExp('max(2, 5, 6)'), 6)
    assert.equal(evalExp('min(2, 5, 6, 1)'), 1)
    assert.equal(evalExp('max(2, 5, 6, 1)'), 6)
    assert.equal(evalExp('min(2, 5, 6, 1, 9)'), 1)
    assert.equal(evalExp('max(2, 5, 6, 1, 9)'), 9)
    assert.equal(evalExp('min(2, 5, 6, 1, 9, 12)'), 1)
    assert.equal(evalExp('max(2, 5, 6, 1, 9, 12)'), 12)
  })

  it('can do comparisons', () => {
    assert.equal(evalExp('foo == 4', { foo: 4 }), true)
    assert.equal(evalExp('foo == 4', { foo: 3 }), false)
    assert.equal(evalExp('foo == 4', { foo: -4 }), false)
    assert.equal(evalExp('foo != 4', { foo: 4 }), false)
    assert.equal(evalExp('foo != 4', { foo: 3 }), true)
    assert.equal(evalExp('foo != 4', { foo: -4 }), true)
    assert.equal(evalExp('foo > 4', { foo: 3 }), false)
    assert.equal(evalExp('foo > 4', { foo: 4 }), false)
    assert.equal(evalExp('foo > 4', { foo: 5 }), true)
    assert.equal(evalExp('foo >= 4', { foo: 3 }), false)
    assert.equal(evalExp('foo >= 4', { foo: 4 }), true)
    assert.equal(evalExp('foo >= 4', { foo: 5 }), true)
    assert.equal(evalExp('foo < 4', { foo: 3 }), true)
    assert.equal(evalExp('foo < 4', { foo: 4 }), false)
    assert.equal(evalExp('foo < 4', { foo: 5 }), false)
    assert.equal(evalExp('foo <= 4', { foo: 3 }), true)
    assert.equal(evalExp('foo <= 4', { foo: 4 }), true)
    assert.equal(evalExp('foo <= 4', { foo: 5 }), false)
  })

  it('can do boolean logic', () => {
    const obj = { T: true, F: false }

    assert.equal(evalExp('F and F', obj), false)
    assert.equal(evalExp('F and T', obj), false)
    assert.equal(evalExp('T and F', obj), false)
    assert.equal(evalExp('T and T', obj), true)
    assert.equal(evalExp('F or F', obj), false)
    assert.equal(evalExp('F or T', obj), true)
    assert.equal(evalExp('T or F', obj), true)
    assert.equal(evalExp('T or T', obj), true)
    assert.equal(evalExp('not F', obj), true)
    assert.equal(evalExp('not T', obj), false)
    assert.equal(evalExp('(F and T) or T', obj), true)
    assert.equal(evalExp('F and (T or T)', obj), false)
    assert.equal(evalExp('F and T or T', obj), true)
    assert.equal(evalExp('T or T and F', obj), true)
    assert.equal(evalExp('not T and F', obj), false)
  })

  it('does modulo', () => {
    assert.equal(evalExp('10 mod 2'), 0)
    assert.equal(evalExp('11 mod 2'), 1)
    assert.equal(evalExp('-1 mod 2'), -1)
    assert.equal(evalExp('-0.1 mod 5'), -0.1)
  })

  it('exponentiation has precedence over unary minus', () => {
    assert.equal(evalExp('-x^2', { x: 2 }), -4)
  })

  it('exponentiation is right-associative', () => {
    assert.equal(evalExp('5^3^2'), 5 ** (3 ** 2))
  })
})

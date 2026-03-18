import { describe, it, expect } from 'vitest'
import { formatResult, getResultType } from './output-panel'
import { isAstNode, getSummary, getChildEntries } from './ast-tree-view'

describe('formatResult', () => {
  it('formats undefined', () => {
    expect(formatResult(undefined)).toBe('undefined')
  })

  it('formats null', () => {
    expect(formatResult(null)).toBe('null')
  })

  it('formats functions', () => {
    expect(formatResult(() => {})).toBe('[Function]')
  })

  it('formats numbers', () => {
    expect(formatResult(42)).toBe('42')
  })

  it('formats strings as JSON', () => {
    expect(formatResult('hello')).toBe('"hello"')
  })

  it('formats arrays', () => {
    expect(formatResult([1, 2, 3])).toBe('[\n  1,\n  2,\n  3\n]')
  })

  it('formats objects', () => {
    expect(formatResult({ a: 1 })).toBe('{\n  "a": 1\n}')
  })

  it('handles circular references gracefully', () => {
    const obj: Record<string, unknown> = {}
    obj.self = obj
    expect(typeof formatResult(obj)).toBe('string')
  })
})

describe('getResultType', () => {
  it('returns "null" for null', () => {
    expect(getResultType(null)).toBe('null')
  })

  it('returns "array" for arrays', () => {
    expect(getResultType([1, 2])).toBe('array')
  })

  it('returns "number" for numbers', () => {
    expect(getResultType(42)).toBe('number')
  })

  it('returns "string" for strings', () => {
    expect(getResultType('hello')).toBe('string')
  })

  it('returns "boolean" for booleans', () => {
    expect(getResultType(true)).toBe('boolean')
  })

  it('returns "object" for objects', () => {
    expect(getResultType({ a: 1 })).toBe('object')
  })

  it('returns "undefined" for undefined', () => {
    expect(getResultType(undefined)).toBe('undefined')
  })
})

describe('isAstNode', () => {
  it('returns true for objects with string type property', () => {
    expect(isAstNode({ type: 'Literal', value: 42 })).toBe(true)
  })

  it('returns false for null', () => {
    expect(isAstNode(null)).toBe(false)
  })

  it('returns false for arrays', () => {
    expect(isAstNode([1, 2])).toBe(false)
  })

  it('returns false for objects without type', () => {
    expect(isAstNode({ value: 42 })).toBe(false)
  })

  it('returns false for objects with non-string type', () => {
    expect(isAstNode({ type: 42 })).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isAstNode('string')).toBe(false)
    expect(isAstNode(42)).toBe(false)
    expect(isAstNode(undefined)).toBe(false)
  })
})

describe('getSummary', () => {
  it('returns stringified value for Literal', () => {
    expect(getSummary({ type: 'Literal', value: 42 })).toBe('42')
    expect(getSummary({ type: 'Literal', value: 'hello' })).toBe('"hello"')
  })

  it('returns name for Identifier', () => {
    expect(getSummary({ type: 'Identifier', name: 'x' })).toBe('x')
  })

  it('returns operator for BinaryExpression', () => {
    expect(getSummary({ type: 'BinaryExpression', operator: '+' })).toBe('+')
  })

  it('returns operator for LogicalExpression', () => {
    expect(getSummary({ type: 'LogicalExpression', operator: 'and' })).toBe('and')
  })

  it('returns operator for UnaryExpression', () => {
    expect(getSummary({ type: 'UnaryExpression', operator: '-' })).toBe('-')
  })

  it('returns % for TopicReference', () => {
    expect(getSummary({ type: 'TopicReference' })).toBe('%')
  })

  it('returns # for CurryPlaceholder', () => {
    expect(getSummary({ type: 'CurryPlaceholder' })).toBe('#')
  })

  it('returns null for unknown types', () => {
    expect(getSummary({ type: 'CallExpression' })).toBeNull()
  })
})

describe('getChildEntries', () => {
  it('filters out type and location keys', () => {
    const entries = getChildEntries({
      type: 'BinaryExpression',
      operator: '+',
      left: { type: 'Literal', value: 1 },
      right: { type: 'Literal', value: 2 },
      location: { start: 0, end: 5 }
    })
    const keys = entries.map(([k]) => k)
    expect(keys).not.toContain('type')
    expect(keys).not.toContain('location')
  })

  it('filters out summary keys for known node types', () => {
    const entries = getChildEntries({
      type: 'BinaryExpression',
      operator: '+',
      left: { type: 'Literal', value: 1 },
      right: { type: 'Literal', value: 2 }
    })
    const keys = entries.map(([k]) => k)
    expect(keys).not.toContain('operator')
    expect(keys).toContain('left')
    expect(keys).toContain('right')
  })

  it('keeps all non-skip keys for unknown node types', () => {
    const entries = getChildEntries({
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'f' },
      arguments: []
    })
    const keys = entries.map(([k]) => k)
    expect(keys).toContain('callee')
    expect(keys).toContain('arguments')
  })
})

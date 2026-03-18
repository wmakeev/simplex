import { describe, it, expect } from 'vitest'
import { compileExpression } from './compiler-bridge'
import { examples } from './examples/index'

describe('compileExpression', () => {
  it('returns empty object for blank input', () => {
    expect(compileExpression('', '{}', '{}')).toEqual({})
    expect(compileExpression('   ', '{}', '{}')).toEqual({})
  })

  it('compiles a simple expression', () => {
    const result = compileExpression('1 + 2', '{}', '{}')
    expect(result.error).toBeUndefined()
    expect(result.result).toBe(3)
    expect(result.generatedCode).toBeDefined()
    expect(result.ast).toBeDefined()
  })

  it('returns SyntaxError for invalid syntax', () => {
    const result = compileExpression('1 +', '{}', '{}')
    expect(result.error).toBeDefined()
    expect(result.error!.type).toBe('SyntaxError')
  })

  it('returns JSON Error (Globals) for invalid globals JSON', () => {
    const result = compileExpression('1 + 2', '{bad', '{}')
    expect(result.error).toBeDefined()
    expect(result.error!.type).toBe('JSON Error (Globals)')
    expect(result.ast).toBeDefined()
    expect(result.generatedCode).toBeDefined()
  })

  it('returns JSON Error (Data) for invalid data JSON', () => {
    const result = compileExpression('1 + 2', '{}', '{bad')
    expect(result.error).toBeDefined()
    expect(result.error!.type).toBe('JSON Error (Data)')
  })

  it('returns runtime error for undefined variable', () => {
    const result = compileExpression('unknownVar', '{}', '{}')
    expect(result.error).toBeDefined()
    expect(result.error!.message).toMatch(/unknownVar/)
  })

  it('passes globals to compilation', () => {
    const result = compileExpression('x + 1', '{"x": 10}', '{}')
    expect(result.error).toBeUndefined()
    expect(result.result).toBe(11)
  })

  it('passes data to execution', () => {
    const result = compileExpression('name', '{}', '{"name": "Alice"}')
    expect(result.error).toBeUndefined()
    expect(result.result).toBe('Alice')
  })
})

describe('all examples compile without errors', () => {
  for (const example of examples) {
    it(`example: ${example.name} (${example.id})`, () => {
      const result = compileExpression(
        example.expression,
        example.globals ?? '{}',
        example.data ?? '{}'
      )
      expect(result.error).toBeUndefined()
    })
  }
})

import { describe, it, expect } from 'vitest'
import { examples, getExampleById, getCategories } from './index'

describe('getExampleById', () => {
  it('finds existing example by id', () => {
    const example = getExampleById('hello')
    expect(example).toBeDefined()
    expect(example!.name).toBe('Hello World')
  })

  it('returns undefined for non-existent id', () => {
    expect(getExampleById('does-not-exist')).toBeUndefined()
  })
})

describe('getCategories', () => {
  it('returns unique categories', () => {
    const categories = getCategories()
    expect(categories.length).toBeGreaterThan(0)
    expect(new Set(categories).size).toBe(categories.length)
  })

  it('includes known categories', () => {
    const categories = getCategories()
    expect(categories).toContain('Basics')
    expect(categories).toContain('Pipes')
    expect(categories).toContain('Lambdas')
  })
})

describe('examples data integrity', () => {
  it('all examples have required fields', () => {
    for (const example of examples) {
      expect(example.id).toBeTruthy()
      expect(example.name).toBeTruthy()
      expect(example.category).toBeTruthy()
      expect(example.expression).toBeTruthy()
    }
  })

  it('all example ids are unique', () => {
    const ids = examples.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('globals and data fields are valid JSON when present', () => {
    for (const example of examples) {
      if (example.globals) {
        expect(() => JSON.parse(example.globals!)).not.toThrow()
      }
      if (example.data) {
        expect(() => JSON.parse(example.data!)).not.toThrow()
      }
    }
  })
})

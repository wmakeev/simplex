import { describe, it, expect } from 'vitest'
import { encodeState, decodeState } from './state'

describe('encodeState / decodeState', () => {
  it('roundtrips state correctly', () => {
    // encodeState reads from signals, so we test decodeState with a known encoded value
    const state = { e: '1 + 2', g: '{"x": 1}', d: '{}' }
    const encoded = btoa(encodeURIComponent(JSON.stringify(state)))
    const decoded = decodeState(encoded)
    expect(decoded).toEqual({
      expression: '1 + 2',
      globals: '{"x": 1}',
      data: '{}'
    })
  })

  it('returns null for invalid base64', () => {
    expect(decodeState('not-valid-base64!!!')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(decodeState('')).toBeNull()
  })

  it('returns null for valid base64 but invalid JSON', () => {
    const encoded = btoa('not json')
    expect(decodeState(encoded)).toBeNull()
  })

  it('decodes state with unicode characters', () => {
    const state = { e: '"Привет" & " мир"', g: '{}', d: '{}' }
    const encoded = btoa(encodeURIComponent(JSON.stringify(state)))
    const decoded = decodeState(encoded)
    expect(decoded).toEqual({
      expression: '"Привет" & " мир"',
      globals: '{}',
      data: '{}'
    })
  })
})

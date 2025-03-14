import assert from 'node:assert/strict'
import { suite, test } from 'node:test'
import { version } from '../src/index.js'

suite('common', () => {
  test('exports version', () => {
    assert.ok(typeof version === 'string')
  })
})

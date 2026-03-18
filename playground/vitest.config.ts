import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      'simplex-lang': path.resolve(__dirname, '../src/index.ts'),
      'node:assert': path.resolve(__dirname, 'src/shims/assert.ts')
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom'
  }
})

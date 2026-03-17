import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  base: '/simplex/',
  resolve: {
    alias: {
      'simplex-lang': path.resolve(__dirname, '../src/index.ts'),
      'node:assert': path.resolve(__dirname, 'src/shims/assert.ts')
    }
  }
})

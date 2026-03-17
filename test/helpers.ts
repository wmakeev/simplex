import { compile } from '../src/index.js'

export const evalExp = (expression: string, data?: Record<string, unknown>) => {
  return compile(expression, {
    globals: {
      min: Math.min,
      max: Math.max
    }
  })(data)
}

import { parse } from '../../parser/index.js'
import { traverse } from 'simplex-lang'
import { compile } from 'simplex-lang'
import type { CompileResult } from './state'

export function compileExpression(
  expr: string,
  globalsJsonStr: string,
  dataJsonStr: string
): CompileResult {
  if (!expr.trim()) {
    return {}
  }

  let ast: unknown
  let generatedCode: string | undefined

  try {
    ast = parse(expr)
  } catch (err: any) {
    return {
      error: {
        type: 'SyntaxError',
        message: err.message ?? String(err),
        location: err.location?.start
      }
    }
  }

  try {
    const traverseResult = traverse(ast as any)
    generatedCode = traverseResult.code
  } catch (err: any) {
    return {
      ast,
      error: {
        type: 'CompileError',
        message: err.message ?? String(err),
        location: err.location?.start
      }
    }
  }

  let globals: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(globalsJsonStr)
    if (parsed && typeof parsed === 'object') {
      globals = parsed as Record<string, unknown>
    }
  } catch (err: any) {
    return {
      ast,
      generatedCode,
      error: {
        type: 'JSON Error (Globals)',
        message: err.message ?? String(err)
      }
    }
  }

  let data: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(dataJsonStr)
    if (parsed && typeof parsed === 'object') {
      data = parsed as Record<string, unknown>
    }
  } catch (err: any) {
    return {
      ast,
      generatedCode,
      error: {
        type: 'JSON Error (Data)',
        message: err.message ?? String(err)
      }
    }
  }

  try {
    const fn = compile(expr, { globals })
    const result = fn(data)
    return { result, generatedCode, ast }
  } catch (err: any) {
    return {
      ast,
      generatedCode,
      error: {
        type: err.constructor?.name ?? 'Error',
        message: err.message ?? String(err),
        location: err.location?.start
      }
    }
  }
}

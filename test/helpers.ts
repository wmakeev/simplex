import assert from 'node:assert/strict'
import { compile as compileBackend } from '../src/index.js'
import { interpret } from '../src/interpreter.js'
import type { CompileOptions } from '../src/compiler.js'

/**
 * Normalize a value so that two structurally-equivalent results from the two
 * backends compare equal. Functions can't be compared by reference (currying /
 * lambdas produce distinct closures per backend), so every function collapses
 * to a single sentinel. Recurses through arrays / plain objects / Map / Set;
 * Dates compare by timestamp.
 */
const FN = Symbol.for('parity:function')

const normalize = (value: unknown, seen = new Set<unknown>()): unknown => {
  if (typeof value === 'function') return FN
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return value
  seen.add(value)

  if (Array.isArray(value)) {
    // Preserve length (sparse arrays); holes read as `undefined`.
    const out = new Array(value.length)
    for (let i = 0; i < value.length; i++) out[i] = normalize(value[i], seen)
    return out
  }
  if (value instanceof Date) return `Date(${value.getTime()})`
  if (value instanceof Map) {
    const out = new Map<unknown, unknown>()
    for (const [k, v] of value) out.set(normalize(k, seen), normalize(v, seen))
    return out
  }
  if (value instanceof Set) {
    const out = new Set<unknown>()
    for (const v of value) out.add(normalize(v, seen))
    return out
  }

  const out: Record<string, unknown> = {}
  for (const k of Object.keys(value as Record<string, unknown>)) {
    out[k] = normalize((value as Record<string, unknown>)[k], seen)
  }
  return out
}

const assertEquivalent = (a: unknown, b: unknown, expression: string) => {
  assert.deepStrictEqual(
    normalize(a),
    normalize(b),
    `Backend mismatch (result) for: ${expression}`
  )
}

const assertSameError = (
  compileErr: unknown,
  interpretErr: unknown,
  expression: string,
  phase: string
) => {
  if (compileErr === undefined || interpretErr === undefined) {
    assert.fail(
      `Backend mismatch (${phase}) for: ${expression}\n` +
        `  compile threw: ${compileErr === undefined ? 'no' : 'yes'}\n` +
        `  interpret threw: ${interpretErr === undefined ? 'no' : 'yes'}`
    )
  }
  const cName = (compileErr as Error)?.constructor?.name
  const iName = (interpretErr as Error)?.constructor?.name
  assert.equal(
    iName,
    cName,
    `Backend mismatch (${phase} error type) for: ${expression}`
  )
  assert.equal(
    (interpretErr as Error)?.message,
    (compileErr as Error)?.message,
    `Backend mismatch (${phase} error message) for: ${expression}`
  )
}

/**
 * Parity-checking `compile`: builds the expression with both the codegen
 * backend (`compile`) and the tree-walking backend (`interpret`), and asserts
 * the two agree at every observable point — construction outcome, invocation
 * result, and thrown errors (type + message; locations may legitimately differ
 * inside pipe bodies, so they are not compared here).
 *
 * Returns a function with the same contract as `compile`'s output, so existing
 * test assertions need no changes. Pass options exactly as to `compile`;
 * `errorMapper` is codegen-only and stripped before reaching `interpret`.
 */
export const compile = <
  Data = Record<string, unknown>,
  Globals = Record<string, unknown>
>(
  expression: string,
  options?: CompileOptions<Data, Globals>
): ((data?: Data) => unknown) => {
  // Strip `errorMapper` — `interpret` does not accept it.
  let interpretOptions = options
  if (options && 'errorMapper' in options) {
    interpretOptions = { ...options }
    delete (interpretOptions as { errorMapper?: unknown }).errorMapper
  }

  // --- Construction parity (parse + validate happen eagerly in both) ---
  let compiledFn: ((data?: Data) => unknown) | undefined
  let interpretedFn: ((data?: Data) => unknown) | undefined
  let compileErr: unknown
  let interpretErr: unknown

  try {
    compiledFn = compileBackend(expression, options)
  } catch (err) {
    compileErr = err
  }
  try {
    interpretedFn = interpret(expression, interpretOptions)
  } catch (err) {
    interpretErr = err
  }

  if (compileErr !== undefined || interpretErr !== undefined) {
    assertSameError(compileErr, interpretErr, expression, 'construction')
    throw compileErr
  }

  // Both constructed successfully (otherwise we threw above).
  const compiled = compiledFn as (data?: Data) => unknown
  const interpreted = interpretedFn as (data?: Data) => unknown

  // --- Invocation parity ---
  return (data?: Data): unknown => {
    let compileResult: unknown
    let interpretResult: unknown
    let runCompileErr: unknown
    let runInterpretErr: unknown

    try {
      compileResult = compiled(data)
    } catch (err) {
      runCompileErr = err
    }
    try {
      interpretResult = interpreted(data)
    } catch (err) {
      runInterpretErr = err
    }

    if (runCompileErr !== undefined || runInterpretErr !== undefined) {
      assertSameError(runCompileErr, runInterpretErr, expression, 'invocation')
      throw runCompileErr
    }

    assertEquivalent(compileResult, interpretResult, expression)
    return compileResult
  }
}

export const evalExp = (expression: string, data?: Record<string, unknown>) => {
  return compile(expression, {
    globals: {
      min: Math.min,
      max: Math.max
    }
  })(data)
}

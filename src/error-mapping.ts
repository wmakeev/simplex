import { ExpressionError } from './errors.js'
import type { Location } from './simplex-tree.js'
import type { SourceLocation } from './visitors.js'

export type { SourceLocation }

// --- ErrorMapper Interface ---

export interface ErrorMapper {
  /**
   * Map a runtime error from generated code back to source expression location.
   * Returns ExpressionError with source location, or null if unable to map.
   *
   * @param err — the caught runtime error
   * @param expression — original SimplEx expression string
   * @param offsets — source location mapping from code generation
   * @param codeOffset — length of bootstrap code prepended before the expression
   */
  mapError(
    err: unknown,
    expression: string,
    offsets: SourceLocation[],
    codeOffset: number
  ): ExpressionError | null

  /**
   * Test if this mapper is compatible with the current JS engine.
   * Called once during registration.
   */
  probe(): boolean
}

// --- Helper ---

/** Map a code column offset back to an AST Location via the offsets array. */
export function getExpressionErrorLocation(
  colOffset: number,
  locations: SourceLocation[]
): Location | null {
  var curCol = 0
  for (const loc of locations) {
    curCol += loc.len
    if (curCol >= colOffset) return loc.location
  }
  return null
}

// --- V8 ErrorMapper ---

var V8_STACK_REGEX = /<anonymous>:(?<row>\d+):(?<col>\d+)/g

export var v8ErrorMapper: ErrorMapper = {
  probe() {
    try {
      new Function('throw new Error("__simplex_probe__")')()
    } catch (err) {
      return /<anonymous>:\d+:\d+/.test((err as Error).stack ?? '')
    }
    return false
  },

  mapError(err, expression, offsets, codeOffset) {
    if (!(err instanceof Error)) return null

    var evalRow = err.stack
      ?.split('\n')
      .map(r => r.trim())
      .find(r => r.startsWith('at eval '))
    if (!evalRow) return null

    V8_STACK_REGEX.lastIndex = 0
    var match = V8_STACK_REGEX.exec(evalRow)
    var rowStr = match?.groups?.['row']
    var colStr = match?.groups?.['col']
    if (!rowStr || !colStr) return null

    var row = Number.parseInt(rowStr)
    if (row !== 3) return null

    var col = Number.parseInt(colStr)
    var adjustedCol = col - codeOffset
    if (adjustedCol < 0) return null

    var location = getExpressionErrorLocation(adjustedCol, offsets)
    return new ExpressionError(err.message, expression, location, {
      cause: err
    })
  }
}

// --- Registration ---

var activeErrorMapper: ErrorMapper | null = null

/**
 * Register an ErrorMapper. If the mapper passes its probe(), it becomes
 * the active mapper. Skips if the mapper is already active.
 */
export function registerErrorMapper(mapper: ErrorMapper): void {
  if (activeErrorMapper === mapper) return
  if (mapper.probe()) {
    activeErrorMapper = mapper
  }
}

/** Get the currently active ErrorMapper (auto-detected or last registered). */
export function getActiveErrorMapper(): ErrorMapper | null {
  return activeErrorMapper
}

// Auto-register V8 mapper at module load
registerErrorMapper(v8ErrorMapper)

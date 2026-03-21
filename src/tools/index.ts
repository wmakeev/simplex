import { UnexpectedTypeError } from '../errors.js'

/**
 * Alias for `Object.prototype.toString`
 */
// eslint-disable-next-line @typescript-eslint/unbound-method
export const objToStringAlias = Object.prototype.toString

/**
 * The method is needed to obtain the most specific readable data type.
 *
 * *Usage note:* Type handling, from a performance perspective, should be done
 * in a targeted manner. It is not possible to replace specific checks like typeof
 * `some === "number"` or `Num.isFinite(some)` with a universal
 * `typeOf(some) === "FiniteNumber"`.
 */
export function typeOf(val: unknown) {
  const type = typeof val

  if (type === 'number') {
    if (Number.isFinite(val)) return 'number'
    else if (val === Number.NEGATIVE_INFINITY) return '-Infinity'
    else if (val === Number.POSITIVE_INFINITY) return 'Infinity'
    else return 'NaN'
  }

  if (type === 'object') {
    return objToStringAlias.call(val).slice(8, -1)
  }

  return type
}

// --- Guards ---

/** Check if value is a plain object (not Array, Map, etc.). */
export function isObject(val: unknown): val is object {
  return objToStringAlias.call(val) === '[object Object]'
}

// Boxed primitives (new String, etc.) are intentionally not handled — they
// cannot originate from SimplEx expressions and are not worth the overhead.
export function isSimpleValue(
  val: unknown
): val is number | string | boolean | bigint | null | undefined {
  const type = typeof val

  if (
    type === 'string' ||
    type === 'number' ||
    type === 'boolean' ||
    type === 'bigint'
  ) {
    return true
  }

  if (val == null) return true

  return false
}

// --- Cast ---

/** Coerce any value to boolean (standard JS truthiness). */
export function castToBoolean(val: unknown): boolean {
  // Boxed primitives (new String, etc.) are intentionally not handled — see isSimpleValue comment.
  return Boolean(val)
}

/** Coerce value to string; objects use Object.prototype.toString. */
export function castToString(val: unknown): string {
  const type = typeof val

  // Boxed primitives (new String, etc.) are intentionally not handled — see isSimpleValue comment.
  if (type === 'string') return val as string
  if (
    val == null ||
    type === 'number' ||
    type === 'boolean' ||
    type === 'bigint'
  ) {
    return String(val)
  }

  return objToStringAlias.call(val)
}

// --- Ensure ---

/** Validate that value is a finite number or bigint; throw UnexpectedTypeError otherwise. */
export function ensureNumber(val: unknown): number | bigint {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val
  }

  if (typeof val === 'bigint') {
    return val
  }

  // Boxed primitives (new Number, etc.) are intentionally not handled — see isSimpleValue comment.
  throw new UnexpectedTypeError(['number', 'bigint'], val)
}

/** Validate that value is a function; throw UnexpectedTypeError otherwise. */
export function ensureFunction(val: unknown): Function {
  if (typeof val === 'function') return val
  throw new UnexpectedTypeError(['function'], val)
}

/** Validate that value is a plain object; throw UnexpectedTypeError otherwise. */
export function ensureObject(val: unknown): object {
  if (isObject(val)) return val as object
  throw new UnexpectedTypeError(['object'], val)
}

/** Validate that value is an array; throw UnexpectedTypeError otherwise. */
export function ensureArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val
  throw new UnexpectedTypeError(['Array'], val)
}

/** Validate that value is comparable (<, >, <=, >=); must be number, bigint, or string. */
export function ensureRelationalComparable(
  val: unknown
): number | string | bigint {
  // Boxed primitives (new String, etc.) are intentionally not handled — see isSimpleValue comment.
  const type = typeof val

  if (
    (type === 'number' && Number.isNaN(val) === false) ||
    type === 'string' ||
    type === 'bigint'
  ) {
    return val as number | string | bigint
  }

  throw new UnexpectedTypeError(['number', 'bigint', 'string'], val)
}

import { UnexpectedTypeError } from '../errors.js'

/**
 * Alias for `Object.prototype.toString`
 */
// eslint-disable-next-line @typescript-eslint/unbound-method
export const objToStringAlias = Object.prototype.toString

/**
 * Converts instances of Number, String and Boolean to primitives
 */
export function unbox(val: unknown) {
  if (typeof val !== 'object' || val === null) return val

  const objConstructor = val.constructor

  if (
    objConstructor === Number ||
    objConstructor === String ||
    objConstructor === Boolean
  ) {
    return val.valueOf()
  }

  return val
}

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

export function isObject(val: unknown): val is object {
  return objToStringAlias.call(val) === '[object Object]'
}

// TODO Для разных случаев может потребоваться отдельный вариант `isSimpleValue` проверки.
// Вероятно стоит сделать несколько исходя из конкретной практической потребности.

export function isSimpleValue(
  val: unknown
): val is number | string | boolean | bigint | null | undefined {
  // TODO Разделять на функции удобно, но приходится делать лишние вызовы и
  // дополнительные проверки в performance critical функции.
  val = unbox(val)

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

export function castToBoolean(val: unknown): boolean {
  return Boolean(unbox(val))
}

export function castToString(val: unknown): string {
  val = unbox(val)

  const type = typeof val

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

export function ensureNumber(val: unknown): number | bigint {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val
  }

  if (typeof val === 'bigint') {
    return val
  }

  if (typeof val === 'object' && val instanceof Number) {
    return ensureNumber(val.valueOf())
  }

  throw new UnexpectedTypeError(['number', 'bigint'], val)
}

export function ensureFunction(val: unknown): Function {
  if (typeof val === 'function') return val
  throw new UnexpectedTypeError(['function'], val)
}

export function ensureRelationalComparable(
  val: unknown
): number | string | bigint {
  val = unbox(val)

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

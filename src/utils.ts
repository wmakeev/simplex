/* eslint-disable @typescript-eslint/unbound-method */
import { UnexpectedTypeError } from './errors.js'

/**
 * Converts instances of Number, String and Boolean to primitives
 */
export function unbox(value: unknown) {
  if (typeof value !== 'object') return value

  if (
    value instanceof Number ||
    value instanceof String ||
    value instanceof Boolean
  ) {
    return value.valueOf()
  }

  return value
}

export function num(val: unknown): number {
  val = unbox(val)

  if (typeof val !== 'number' || Number.isFinite(val) === false) {
    throw new UnexpectedTypeError('number', prettyType(val))
  }

  return val
}

export function toStr(val: unknown): string {
  val = unbox(val)

  const type = typeof val

  if (type === 'string') return val as string
  if (type === 'number' || type === 'boolean' || type === 'bigint') {
    return String(val)
  }

  throw new UnexpectedTypeError('string', prettyType(val))
}

export function relComp(val: unknown): number | string | bigint {
  val = unbox(val)

  const type = typeof val

  if (type !== 'number' && type !== 'string' && type !== 'bigint') {
    throw new UnexpectedTypeError('number or string', prettyType(val))
  }

  return val as number | string | bigint
}

export function bool(val: unknown): boolean {
  return Boolean(unbox(val))
}

export function ensureFunction(val: unknown): Function {
  if (typeof val === 'function') return val
  throw new UnexpectedTypeError('function', prettyType(val))
}

var objToStrProto = Object.prototype.toString

export function isObj(val: unknown): val is object {
  return objToStrProto.call(val) === '[object Object]'
}

export function isSimple(
  val: unknown
): val is number | string | boolean | bigint | null | undefined {
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

/**
 * Returns the type of a value in a neat, user-readable way
 */
export function prettyType(val: unknown) {
  val = unbox(val)

  if (val === undefined) return 'undefined'
  if (val === null) return 'null'
  if (val === true) return 'true'
  if (val === false) return 'false'

  const type = typeof val

  if (type === 'number') {
    if (Number.isFinite(val)) return 'number'
    else if (val === Number.NEGATIVE_INFINITY) return '-infinity'
    else if (val === Number.POSITIVE_INFINITY) return 'infinity'
    else return 'NaN'
  }

  if (type === 'string') return 'string'

  if (type !== 'object' && type !== 'function') return 'unknown type' // TODO Get more detailed type info

  if (Array.isArray(val)) return 'array'

  return 'object'
}

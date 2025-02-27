import { UnexpectedTypeError } from '../errors.js'
import { unbox } from './index.js'

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

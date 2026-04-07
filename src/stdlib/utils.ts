import { typeOf } from '../tools/index.js'

const { isNaN } = Number
const { keys } = Object

/** Returns true if value is null, undefined, NaN, empty string, empty array, or empty object. */
export function empty(val: unknown): boolean {
  if (val == null) return true
  if (typeof val === 'number') return isNaN(val)
  if (val === '') return true
  if (Array.isArray(val)) return val.length === 0
  if (typeof val === 'object') return keys(val).length === 0
  return false
}

/** Returns true if value is not null, undefined, or NaN. */
export function exists(val: unknown): boolean {
  if (val == null) return false
  if (typeof val === 'number') return !isNaN(val)
  return true
}

export { typeOf }

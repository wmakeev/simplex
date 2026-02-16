export * from './cast.js'
export * from './ensure.js'
export * from './guards.js'

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

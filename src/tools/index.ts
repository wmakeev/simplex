export * from './cast.js'
export * from './ensure.js'
export * from './guards.js'

// eslint-disable-next-line @typescript-eslint/unbound-method
const toString = Object.prototype.toString

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
 * Returns more specific type of a value
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
    return toString.call(val).slice(8, -1)
  }

  return type
}

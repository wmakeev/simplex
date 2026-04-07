import { UnexpectedTypeError } from '../errors.js'

const { parseInt: _parseInt, parseFloat: _parseFloat, isFinite, isInteger, isNaN } = Number

export const numMethods = {
  toString: (n: unknown, radix?: unknown) => {
    if (typeof n !== 'number') throw new UnexpectedTypeError(['number'], n)
    return n.toString(radix as number | undefined)
  },
  isFinite: (n: unknown) => isFinite(n as number),
  isInteger: (n: unknown) => isInteger(n as number),
  isNaN: (n: unknown) => isNaN(n as number),
  toFixed: (n: unknown, digits?: unknown) => {
    if (typeof n !== 'number') throw new UnexpectedTypeError(['number'], n)
    return (n).toFixed(digits as number)
  }
}

export const num = {
  ...numMethods,
  parseInt: (s: unknown, radix?: unknown) => {
    const r = _parseInt(s as string, radix as number)
    return isNaN(r) ? null : r
  },
  parseFloat: (s: unknown) => {
    const r = _parseFloat(s as string)
    return isNaN(r) ? null : r
  }
}

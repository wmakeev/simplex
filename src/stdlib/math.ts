import { ExpressionError } from '../errors.js'

const { isNaN } = Number
const {
  abs: _abs,
  round: _round,
  floor: _floor,
  ceil: _ceil,
  trunc: _trunc,
  sign: _sign,
  sqrt: _sqrt,
  cbrt: _cbrt,
  pow: _pow,
  log: _log,
  log2: _log2,
  log10: _log10,
  min: _min,
  max: _max,
  sin: _sin,
  cos: _cos,
  tan: _tan,
  asin: _asin,
  acos: _acos,
  atan: _atan,
  atan2: _atan2,
  random: _random,
  PI,
  E
} = Math

const nanNull = (r: number): number | null => (isNaN(r) ? null : r)

export const math = {
  abs: (n: unknown) => nanNull(_abs(n as number)),
  round: (n: unknown) => nanNull(_round(n as number)),
  floor: (n: unknown) => nanNull(_floor(n as number)),
  ceil: (n: unknown) => nanNull(_ceil(n as number)),
  trunc: (n: unknown) => nanNull(_trunc(n as number)),
  sign: (n: unknown) => nanNull(_sign(n as number)),
  sqrt: (n: unknown) => nanNull(_sqrt(n as number)),
  cbrt: (n: unknown) => nanNull(_cbrt(n as number)),
  pow: (a: unknown, b: unknown) => nanNull(_pow(a as number, b as number)),
  log: (n: unknown) => nanNull(_log(n as number)),
  log2: (n: unknown) => nanNull(_log2(n as number)),
  log10: (n: unknown) => nanNull(_log10(n as number)),
  min: (...args: unknown[]) => nanNull(_min(...(args as number[]))),
  max: (...args: unknown[]) => nanNull(_max(...(args as number[]))),
  sin: (n: unknown) => nanNull(_sin(n as number)),
  cos: (n: unknown) => nanNull(_cos(n as number)),
  tan: (n: unknown) => nanNull(_tan(n as number)),
  asin: (n: unknown) => nanNull(_asin(n as number)),
  acos: (n: unknown) => nanNull(_acos(n as number)),
  atan: (n: unknown) => nanNull(_atan(n as number)),
  atan2: (y: unknown, x: unknown) =>
    nanNull(_atan2(y as number, x as number)),
  random: () => _random(),
  clamp: (n: unknown, min: unknown, max: unknown) => {
    if ((min as number) > (max as number)) {
      throw new ExpressionError(
        'Math.clamp: min must be less than or equal to max',
        '',
        null
      )
    }
    return _max(min as number, _min(max as number, n as number))
  },
  PI,
  E
}

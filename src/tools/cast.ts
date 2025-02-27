import { unbox } from './index.js'

// eslint-disable-next-line @typescript-eslint/unbound-method
const toString = Object.prototype.toString

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

  return toString.call(val)
}

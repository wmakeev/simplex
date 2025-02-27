import { unbox } from './index.js'

// eslint-disable-next-line @typescript-eslint/unbound-method
var objToStrProto = Object.prototype.toString

export function isObject(val: unknown): val is object {
  return objToStrProto.call(val) === '[object Object]'
}

export function isSimpleValue(
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

import { unbox } from './index.js'

// eslint-disable-next-line @typescript-eslint/unbound-method
var objToStrProto = Object.prototype.toString

export function isObject(val: unknown): val is object {
  return objToStrProto.call(val) === '[object Object]'
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

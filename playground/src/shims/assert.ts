export function ok(value: unknown, msg?: string) {
  if (!value) throw new Error(msg ?? 'Assertion failed')
}

export function equal(a: unknown, b: unknown, msg?: string) {
  if (a !== b) throw new Error(msg ?? `Expected ${String(b)}, got ${String(a)}`)
}

export default { ok, equal }

const { isNaN } = Number

export const date = {
  toString: (ts: unknown) => {
    const d = new Date(ts as number)
    return isNaN(d.getTime()) ? null : d.toISOString()
  },
  now: () => Date.now(),
  parse: (s: unknown) => {
    const r = Date.parse(s as string)
    return isNaN(r) ? null : r
  }
}

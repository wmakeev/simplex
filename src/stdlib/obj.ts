const { keys, values, entries, fromEntries, assign: _assign, hasOwn } = Object

export const objMethods = {
  toString: (o: unknown) => JSON.stringify(o),
  keys: (o: unknown) => keys(o as object),
  values: (o: unknown) => values(o as object) as unknown[],
  entries: (o: unknown) => entries(o as object) as [string, unknown][],
  has: (o: unknown, key: unknown) => hasOwn(o as object, key as PropertyKey)
}

export const obj = {
  ...objMethods,
  fromEntries: (e: unknown) =>
    fromEntries(e as Iterable<readonly [PropertyKey, unknown]>) as Record<
      string,
      unknown
    >,
  assign: (...objs: unknown[]) =>
    _assign({}, ...(objs as object[])) as Record<string, unknown>
}

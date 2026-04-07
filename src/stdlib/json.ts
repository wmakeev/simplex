export const json = {
  parse: (s: unknown) => JSON.parse(s as string) as unknown,
  stringify: (val: unknown, replacer?: unknown, indent?: unknown) =>
    JSON.stringify(
      val,
      replacer as Parameters<typeof JSON.stringify>[1],
      indent as number | undefined
    )
}

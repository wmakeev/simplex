import { UnexpectedTypeError } from '../errors.js'

function ensureString(s: unknown): string {
  if (typeof s !== 'string') throw new UnexpectedTypeError(['string'], s)
  return s
}

export const str = {
  toString: (s: unknown) => String(s),
  length: (s: unknown) => ensureString(s).length,
  toUpperCase: (s: unknown) => ensureString(s).toUpperCase(),
  toLowerCase: (s: unknown) => ensureString(s).toLowerCase(),
  trim: (s: unknown) => ensureString(s).trim(),
  trimStart: (s: unknown) => ensureString(s).trimStart(),
  trimEnd: (s: unknown) => ensureString(s).trimEnd(),
  split: (s: unknown, sep: unknown) =>
    ensureString(s).split(sep as string),
  includes: (s: unknown, q: unknown) =>
    ensureString(s).includes(q as string),
  startsWith: (s: unknown, q: unknown) =>
    ensureString(s).startsWith(q as string),
  endsWith: (s: unknown, q: unknown) =>
    ensureString(s).endsWith(q as string),
  slice: (s: unknown, start: unknown, end?: unknown) =>
    ensureString(s).slice(start as number, end as number | undefined),
  replaceAll: (s: unknown, from: unknown, to: unknown) =>
    ensureString(s).replaceAll(
      from as string | RegExp,
      to as string
    ),
  indexOf: (s: unknown, q: unknown) =>
    ensureString(s).indexOf(q as string),
  padStart: (s: unknown, len: unknown, fill?: unknown) =>
    ensureString(s).padStart(len as number, fill as string | undefined),
  padEnd: (s: unknown, len: unknown, fill?: unknown) =>
    ensureString(s).padEnd(len as number, fill as string | undefined),
  repeat: (s: unknown, n: unknown) =>
    ensureString(s).repeat(n as number),
  charAt: (s: unknown, i: unknown) => ensureString(s)[i as number]
}

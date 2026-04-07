import { UnexpectedTypeError } from '../errors.js'

function ensureArr(a: unknown): unknown[] {
  if (!Array.isArray(a)) throw new UnexpectedTypeError(['Array'], a)
  return a
}

export const arrMethods = {
  toString: (a: unknown) => ensureArr(a).toString(),
  length: (a: unknown) => ensureArr(a).length,
  map: (a: unknown, fn: unknown) =>
    ensureArr(a).map(fn as (val: unknown, i: number, arr: unknown[]) => unknown),
  filter: (a: unknown, fn: unknown) =>
    ensureArr(a).filter(
      fn as (val: unknown, i: number, arr: unknown[]) => unknown
    ),
  find: (a: unknown, fn: unknown) =>
    ensureArr(a).find(
      fn as (val: unknown, i: number, arr: unknown[]) => unknown
    ),
  findIndex: (a: unknown, fn: unknown) =>
    ensureArr(a).findIndex(
      fn as (val: unknown, i: number, arr: unknown[]) => boolean
    ),
  every: (a: unknown, fn: unknown) =>
    ensureArr(a).every(
      fn as (val: unknown, i: number, arr: unknown[]) => unknown
    ),
  some: (a: unknown, fn: unknown) =>
    ensureArr(a).some(
      fn as (val: unknown, i: number, arr: unknown[]) => unknown
    ),
  reduce: (a: unknown, fn: unknown) =>
    ensureArr(a).reduce(
      fn as (acc: unknown, val: unknown, i: number, arr: unknown[]) => unknown
    ),
  fold: (a: unknown, fn: unknown, init: unknown) =>
    ensureArr(a).reduce(
      fn as (acc: unknown, val: unknown, i: number, arr: unknown[]) => unknown,
      init
    ),
  reduceRight: (a: unknown, fn: unknown) =>
    ensureArr(a).reduceRight(
      fn as (acc: unknown, val: unknown, i: number, arr: unknown[]) => unknown
    ),
  foldRight: (a: unknown, fn: unknown, init: unknown) =>
    ensureArr(a).reduceRight(
      fn as (acc: unknown, val: unknown, i: number, arr: unknown[]) => unknown,
      init
    ),
  flat: (a: unknown, depth?: unknown) =>
    ensureArr(a).flat((depth ?? 1) as number),
  flatMap: (a: unknown, fn: unknown) =>
    ensureArr(a).flatMap(
      fn as (val: unknown, i: number, arr: unknown[]) => unknown
    ),
  includes: (a: unknown, val: unknown) => ensureArr(a).includes(val),
  indexOf: (a: unknown, val: unknown) => ensureArr(a).indexOf(val),
  lastIndexOf: (a: unknown, val: unknown) => ensureArr(a).lastIndexOf(val),
  slice: (a: unknown, start?: unknown, end?: unknown) =>
    ensureArr(a).slice(
      start as number | undefined,
      end as number | undefined
    ),
  join: (a: unknown, sep?: unknown) =>
    ensureArr(a).join(sep as string | undefined),
   
  sort: (a: unknown, fn?: unknown) =>
    ensureArr(a).toSorted(
      fn as ((a: unknown, b: unknown) => number) | undefined
    ),
  reverse: (a: unknown) => ensureArr(a).toReversed(),
  concat: (a: unknown, ...arrays: unknown[]) =>
    ensureArr(a).concat(...arrays),
  fill: (a: unknown, val: unknown, start?: unknown, end?: unknown) =>
    [...ensureArr(a)].fill(
      val,
      start as number | undefined,
      end as number | undefined
    ),
  at: (a: unknown, index: unknown) => ensureArr(a).at(index as number)
}

export const arr = {
  ...arrMethods,
  from: (val: unknown) => Array.from(val as Iterable<unknown>),
  of: (...args: unknown[]) => Array.of(...args)
}

import { empty, exists, typeOf } from './utils.js'
import { math } from './math.js'
import { num, numMethods } from './num.js'
import { str } from './str.js'
import { arr, arrMethods } from './arr.js'
import { obj, objMethods } from './obj.js'
import { json } from './json.js'
import { date } from './date.js'

export interface StdlibResult {
  globals: Record<string, unknown>
  extensions: Map<string | Function, Record<string, Function>>
}

/** Create the SimplEx standard library (globals + extensions). */
export function createStdlib(): StdlibResult {
  const globals: Record<string, unknown> = {
    empty,
    exists,
    typeOf,
    Str: str,
    Num: num,
    Math: math,
    Arr: arr,
    Obj: obj,
    Json: json,
    Date: date
  }

  const extensions = new Map<string | Function, Record<string, Function>>([
    ['string', { ...(str as unknown as Record<string, Function>) }],
    ['number', { ...(numMethods as unknown as Record<string, Function>) }],
    [Array, { ...(arrMethods as unknown as Record<string, Function>) }],
    [Object, { ...(objMethods as unknown as Record<string, Function>) }]
  ])

  return { globals, extensions }
}

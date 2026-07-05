// tier — the ONLY place in the harness that touches V8 %-natives and knows
// the %GetOptimizationStatus bits. The worker (task 05) and orchestrator
// (task 06) consume only its wrappers; they never spell a `%` intrinsic or a
// numeric status bit themselves.
//
// Design notes (measurement-protocol.md §4, §10.3):
//
//   * Bits are NEVER hardcoded. They are parsed at import time from the
//     vendored mjsunit.js snapshot of the target V8 branch
//     (bench/probes/vendor/mjsunit-<tag>.js, kept in sync by probe P1). The
//     branch tag is embedded in the vendored file name; the running V8 tag is
//     read from process.versions.v8. If they diverge we warn — re-run
//     bench/probes/p1-optimization-status.mjs to re-vendor.
//
//   * This module is self-contained w.r.t. bench/probes/: it reads only the
//     vendored *data* snapshot (an append-only artifact), not any probe *code*.
//     probes/lib.mjs runs side effects at import (mkdtempSync, spawn helpers)
//     that have no business inside a hot, natives-enabled worker process, so
//     the ~10-line bit parser is duplicated here rather than imported. That
//     keeps bench/src independent of probe runtime code — only the vendored
//     file is shared, and sharing pure data is not fragile.
//
//   * The module must import cleanly in a process WITHOUT
//     --allow-natives-syntax (e.g. a bytes/op or cold pass) — importing it must
//     not throw. So the source contains NO literal `%` intrinsic. Every native
//     is compiled lazily through `new Function('fn', '… %Intrinsic(fn) …')`
//     wrapped in try/catch (the mjsunit OptimizationStatus pattern): when the
//     flag is absent, `new Function` throws SyntaxError, we swallow it, and the
//     wrapper degrades to a no-op / undefined. `nativesAvailable` reports which
//     side of that line we are on. (protocol §4.1: natives must come from files
//     compiled by V8, which `new Function` satisfies — unlike `node -e`, whose
//     TS transform corrupts `%` on Node 24.)

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const vendorDir = join(here, '..', 'probes', 'vendor')

// Upstream V8 branch tag baked into the running Node build. mjsunit.js of THIS
// tag is the single source of truth for the status bits.
export const v8Tag = process.versions.v8.replace(/-node\.\d+$/, '')

function vendoredMjsunitPath() {
  const exact = join(vendorDir, `mjsunit-${v8Tag}.js`)
  try {
    readFileSync(exact)
    return exact
  } catch {
    const any = readdirSync(vendorDir).find(f => /^mjsunit-.*\.js$/.test(f))
    if (!any) throw new Error(`no vendored mjsunit.js in ${vendorDir}`)
    console.warn(
      `WARNING: vendored mjsunit does not match running V8 ${v8Tag}: ${any}\n` +
        `re-run bench/probes/p1-optimization-status.mjs to re-vendor`
    )
    return join(vendorDir, any)
  }
}

export const vendoredMjsunitFile = vendoredMjsunitPath()

// Parse `var V8OptimizationStatus = { kFoo: 1 << n, … };` out of the snapshot.
// Mirror of probes/lib.mjs parseOptimizationStatusBits (kept local on purpose,
// see header). Not one hardcoded numeric bit lives outside this function.
function parseOptimizationStatusBits(source) {
  const m = source.match(/var V8OptimizationStatus = \{([\s\S]*?)\};/)
  if (!m) throw new Error('V8OptimizationStatus not found in mjsunit source')
  const bits = {}
  for (const [, name, shift] of m[1].matchAll(/(k\w+):\s*1\s*<<\s*(\d+)/g)) {
    bits[name] = 1 << Number(shift)
  }
  return bits
}

// Frozen map { kIsFunction: 1, kNeverOptimize: 2, … } for the target V8 branch.
export const STATUS = Object.freeze(
  parseOptimizationStatusBits(readFileSync(vendoredMjsunitFile, 'utf8'))
)

// ---------------------------------------------------------------------------
// Lazy, crash-free access to V8 intrinsics.
// ---------------------------------------------------------------------------

// Build a function that calls a `%`-intrinsic, or null if natives syntax is not
// enabled in this process. The `%` only ever appears inside a `new Function`
// body string, so importing this module never triggers a parse-time
// SyntaxError under a plain (no --allow-natives-syntax) process.
function makeNativeFn(params, body) {
  try {
    // eslint-disable-next-line no-new-func -- the whole point: gated natives
    return new Function(...params, body)
  } catch {
    return null
  }
}

const nativeGetStatus = makeNativeFn(['fn'], 'return %GetOptimizationStatus(fn)')
const nativePrepare = makeNativeFn(['fn'], '%PrepareFunctionForOptimization(fn)')
const nativeOptimize = makeNativeFn(['fn'], '%OptimizeFunctionOnNextCall(fn)')
const nativeNeverOpt = makeNativeFn(['fn'], '%NeverOptimizeFunction(fn)')
const nativeDeopt = makeNativeFn(['fn'], '%DeoptimizeFunction(fn)')

// True in a worker launched with --allow-natives-syntax; false otherwise.
// Callers that need asserts must run under steady/no-opt flag sets (see
// TIER_FLAGS); callers that only sample (a bytes/op pass) can import freely.
export const nativesAvailable = nativeGetStatus !== null

// ---------------------------------------------------------------------------
// Status decoding + ported mjsunit predicates.
// The predicates are semantic re-implementations of test/mjsunit/mjsunit.js
// (V8 branch <v8Tag>): isOptimized / isTurboFanned / isMaglevved /
// isInterpreted / isBaseline. Only the *names* of the bits are referenced —
// values come from STATUS.
// ---------------------------------------------------------------------------

export function getOptimizationStatus(fn) {
  if (nativeGetStatus === null) return undefined
  return nativeGetStatus(fn)
}

export function decodeStatus(status) {
  if (status == null) return []
  return Object.keys(STATUS).filter(name => (status & STATUS[name]) !== 0)
}

function has(status, bitName) {
  return (status & STATUS[bitName]) !== 0
}

export function isOptimized(fn) {
  const s = getOptimizationStatus(fn)
  return s != null && has(s, 'kOptimized')
}

// The steady-tier gate: kOptimized && kTurboFanned. Maglev is ALSO kOptimized
// (probe P1: Maglev status = 49 = kIsFunction|kOptimized|kMaglevved), so a bare
// kOptimized check would silently measure Maglev — hence the second bit.
export function isTurboFanned(fn) {
  const s = getOptimizationStatus(fn)
  return s != null && has(s, 'kOptimized') && has(s, 'kTurboFanned')
}

export function isMaglevved(fn) {
  const s = getOptimizationStatus(fn)
  return s != null && has(s, 'kOptimized') && has(s, 'kMaglevved')
}

export function isInterpreted(fn) {
  const s = getOptimizationStatus(fn)
  return s != null && !has(s, 'kOptimized') && has(s, 'kInterpreted')
}

export function isBaseline(fn) {
  const s = getOptimizationStatus(fn)
  return s != null && !has(s, 'kOptimized') && has(s, 'kBaseline')
}

// Classify the CURRENT tier of `fn` into the cell-invalidation reasons of
// protocol §4.1. Returns 'turbofanned' (the only valid steady outcome),
// 'maglev-not-turbofan', or 'not-optimized'. `deopted` is NOT decidable from a
// single snapshot — it is the post-measurement re-assert (see
// assertStillSteady) recognising that a previously-turbofanned fn fell out.
export function classifyTier(fn) {
  const s = getOptimizationStatus(fn)
  if (s == null) return 'not-optimized'
  if (has(s, 'kOptimized') && has(s, 'kTurboFanned')) return 'turbofanned'
  if (has(s, 'kOptimized') && has(s, 'kMaglevved')) return 'maglev-not-turbofan'
  return 'not-optimized'
}

// ---------------------------------------------------------------------------
// Steady-tier force recipe (protocol §4.1, order is strict).
// ---------------------------------------------------------------------------

// %PrepareFunctionForOptimization → warmup with DIFFERENT values of the SAME
// type → %OptimizeFunctionOnNextCall → trigger call → assert.
//
//   fn      the function whose tier is controlled (for `compile` — the
//           compiled function; for `interpret` — evalNode / the wrapper: §4.1)
//   invoke  (i) => void — calls `fn` with the i-th warmup input. The caller
//           MUST vary the value across i (same type, different value): one
//           repeated value gives unrepresentative branch feedback and risks a
//           deopt on the first measured call (protocol §4.1).
//   opts.warmup  warmup iterations (default 20). Kept > ~10 so that
//           --no-lazy-feedback-allocation is NOT required; if a caller drops it
//           below ~10, the orchestrator must add that flag (protocol §4.1).
//
// Returns { ok, reason, status, tier }:
//   ok      true iff fn ended up kOptimized && kTurboFanned
//   reason  null | 'not-optimized' | 'maglev-not-turbofan' | 'natives-unavailable'
//   tier    classifyTier(fn) after the trigger call
//   status  raw %GetOptimizationStatus value (for cell metadata / debugging)
export function forceSteady(fn, invoke, opts = {}) {
  const warmup = opts.warmup ?? 20
  if (!nativesAvailable) {
    return { ok: false, reason: 'natives-unavailable', status: undefined, tier: 'not-optimized' }
  }
  nativePrepare(fn)
  for (let i = 0; i < warmup; i++) invoke(i)
  nativeOptimize(fn)
  invoke(warmup) // trigger: fn runs and tiers up to optimized code
  const status = getOptimizationStatus(fn)
  const tier = classifyTier(fn)
  return {
    ok: tier === 'turbofanned',
    reason: tier === 'turbofanned' ? null : tier,
    status,
    tier
  }
}

// Post-measurement re-assert (deopt detection, protocol §4.1/§10.3). Call after
// the mitata sampling loop: if `fn` was turbofanned before the loop but is no
// longer, it deoptimized mid-measurement → the cell is invalid with reason
// 'deopted'. Returns { ok, reason, status }.
export function assertStillSteady(fn) {
  if (!nativesAvailable) {
    return { ok: false, reason: 'natives-unavailable', status: undefined }
  }
  const status = getOptimizationStatus(fn)
  if (isTurboFanned(fn)) return { ok: true, reason: null, status }
  return { ok: false, reason: 'deopted', status }
}

// ---------------------------------------------------------------------------
// no-opt helper: %NeverOptimizeFunction (protocol §4.3).
// ---------------------------------------------------------------------------

// Pin `fn` to the interpreter tier. TWO caveats from §4.3:
//   (a) MUST be called immediately after `fn` is defined, before its first
//       call — %NeverOptimizeFunction CRASHES the process if fn is already
//       compiled/optimized;
//   (b) it does NOT block Sparkplug — fn can still get baseline code — so this
//       mode is honestly "Ignition + Sparkplug", not pure Ignition. For a clean
//       interpreter floor across a whole process, prefer the --max-opt=0 flag
//       set (TIER_FLAGS['no-opt']) instead.
// No-op (returns fn unchanged) when natives are unavailable.
export function neverOptimize(fn) {
  if (nativeNeverOpt !== null) nativeNeverOpt(fn)
  return fn
}

// Force `fn` to deoptimize. Only used to build the artificial-deopt repro in
// the selfcheck; the real harness never calls it. No-op without natives.
export function deoptimize(fn) {
  if (nativeDeopt !== null) nativeDeopt(fn)
  return fn
}

// ---------------------------------------------------------------------------
// Per-mode process flag table (consumed by the orchestrator, task 06).
// ---------------------------------------------------------------------------

// V8 flags each tier mode's child process must launch with. The orchestrator
// spawns `node <flags> worker.mjs …`.
//
//   steady  the main "hot expression" mode. --no-concurrent-* removes two
//           sources of non-determinism (background GC sweeping, background
//           recompilation — incl. the "assert status right after force-opt"
//           flake, V8 issue 11821) WITHOUT going single-threaded.
//           --predictable is deliberately absent (single-threaded GC/compile is
//           unrepresentative for metrics — diagnostic only). Note: written in
//           V8's `--noflag_underscore` spelling to match protocol §4.1 verbatim;
//           V8 accepts it as equivalent to --no-flag-dashes.
//   no-opt  --max-opt=0 = max tier is Ignition → clean kInterpreted, NO lite
//           mode (probe P2). --jitless is also Ignition-only but adds kLiteMode
//           (different heap/GC config → pollutes bytes/op), so it is NOT used
//           here. Bare --no-opt is unusable: Maglev survives it (probe P2).
//   cold    no natives force at all: measures the honest cold path. Actual tier
//           is diagnosed after the fact via getOptimizationStatus into cell
//           metadata (protocol §4.2), not assumed.
export const TIER_FLAGS = Object.freeze({
  steady: Object.freeze([
    '--allow-natives-syntax',
    '--noconcurrent_sweeping',
    '--noconcurrent_recompilation'
  ]),
  'no-opt': Object.freeze(['--max-opt=0', '--allow-natives-syntax']),
  cold: Object.freeze(['--allow-natives-syntax'])
})

// Extra flags for the diagnostic sub-run (protocol §4.1/§10.3): re-run a cell
// with these appended, send output to a log (NOT the results), and count
// deopts by parsing stderr. Kept separate so the metric run is not slowed by
// tracing.
export const DIAGNOSTIC_FLAGS = Object.freeze(['--trace-deopt', '--trace-opt'])

// Count deopts in a diagnostic run's stderr: lines that start with
// `[deoptimizing` (protocol §10.3 — no native deopt counter exists). The
// orchestrator owns per-cell aggregation; this is the pure line parser.
export function countDeopts(stderr) {
  if (!stderr) return 0
  let n = 0
  for (const line of stderr.split('\n')) {
    if (line.trimStart().startsWith('[deoptimizing')) n++
  }
  return n
}

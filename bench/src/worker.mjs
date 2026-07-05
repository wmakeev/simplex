// worker — one child process = one matrix cell; mitata runs inside.
//
// One invocation measures exactly one cell of the measurement matrix
// (measurement-protocol.md §3): fixture × backend × phase × tier-mode × metric.
// The orchestrator (task 06) spawns one `node <v8-flags> worker.mjs <cell>` per
// cell with the flag set for the tier-mode (tier.mjs TIER_FLAGS) plus, for the
// bytes metric, `--expose-gc`. The worker prints ONE JSON cell result to stdout
// (schema §8.1); everything else (warnings, diagnostics) goes to stderr.
//
// Layering (protocol §6): mitata is only the sampling engine. Tier control
// (force + assert) is delegated to tier.mjs; the bytes/op metric and its GC
// guard are this module's own layer. Time and bytes are NEVER measured in the
// same process (observer CPU overhead, probe P7) — the metric axis picks one.
//
// ---------------------------------------------------------------------------
// CELL DESCRIPTOR (input)
// ---------------------------------------------------------------------------
// A single JSON object, passed as the first argv token that begins with '{',
// or — if none — read in full from stdin. Fields:
//
//   fixture   string   fixture name (looked up in the corpus registry)
//   backend   'compile' | 'interpret'
//   phase     'eval'                — call the built function
//             'compile'             — the whole build pipeline
//             'parse'               — parse() only            (Peggy)
//             'validate'            — validate() only         (fixed tree)
//             'codegen'             — traverse() only         (compile backend)
//             'instantiate'         — new Function only       (compile backend)
//             'instantiate+call'    — new Function + first call (§10.5)
//             'compiled-mem'        — §10.10 macro: heapUsed of N compiled fns
//   tier      'steady' | 'cold' | 'no-opt'
//   metric    'time' | 'bytes'      (ignored for phase 'compiled-mem')
//   k         number  cold only: calls/units per process (default 10)
//   K         number  bytes only: batch size            (default 2048)
//   N         number  compiled-mem only: expressions     (default 1000)
//   warmup    number  steady force-recipe warmup iters   (default 20)
//   minCpuTimeMs number  mitata min_cpu_time in ms        (default 200)
//
// For interpret, phases codegen / instantiate / instantiate+call are not
// applicable (no codegen, no new Function) and yield an `invalid` cell.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PerformanceObserver, performance } from 'node:perf_hooks'
import { measure, do_not_optimize } from 'mitata'

// Compiler-under-test bindings. Filled by loadCompiler() from the cell's
// `buildDir` (task 06, ABAB dual-build §9.1) so one worker can measure code
// from an arbitrary build tree. Default (no buildDir) is the repo's ../../build,
// which reproduces the original static-import behaviour exactly (back-compat).
let compile, resolveContext, traverse, interpret, parse, validate

async function loadCompiler(buildDir) {
  const base = buildDir
    ? pathToFileURL(resolve(buildDir) + '/')
    : new URL('../../build/', import.meta.url)
  const index = await import(new URL('src/index.js', base).href)
  compile = index.compile
  resolveContext = index.resolveContext
  traverse = index.traverse
  interpret = (await import(new URL('src/interpreter.js', base).href)).interpret
  parse = (await import(new URL('parser/index.js', base).href)).parse
  validate = (await import(new URL('src/validate.js', base).href)).validate
}

import { fixtures, makeOptions, getData, corpusVersion } from '../fixtures/index.mjs'
import {
  nativesAvailable,
  forceSteady,
  assertStillSteady,
  classifyTier,
  getOptimizationStatus,
  decodeStatus
} from './tier.mjs'

// --- Constants -------------------------------------------------------------

const DEFAULT_K = 10 // cold: calls per process
const DEFAULT_BYTES_K = 2048 // bytes: batch size
const DEFAULT_N = 1000 // compiled-mem: expressions (§10.10)
const DEFAULT_WARMUP = 20 // steady force-recipe warmup
const DEFAULT_MIN_CPU_MS = 200 // mitata sampling budget
const GC_FLUSH_MS = 6 // let PerformanceObserver('gc') entries drain (P7)

// A codegen-invisible unique suffix busts V8's CompilationCacheEval for the
// `new Function` boundary (protocol §4.2 / §10.5): identical generated source
// would otherwise be served from cache instead of recompiled.
const jsComment = i => `/*u${i}*/`

// Wrap any SimplEx expression in a unique, unused `let` so the WHOLE build
// pipeline (parse → validate → codegen → new Function) sees a distinct string
// and distinct generated code — the end-to-end cache-buster for compile-time
// phases (protocol §4.2). The parenthesised body keeps it valid for every
// expression (including top-level `let` and pipe forms) and preserves the value.
const uniquifyExpr = (expr, i) => `let _bu${i} = 0, (${expr})`

// A comment suffix is enough where no `new Function` is involved (parser has no
// eval cache) and keeps parse/validate/codegen inputs semantically identical.
const uniquifyComment = (expr, i) => `${expr} /*${i}*/`

const NOTE_P99 =
  'p99_ns is a percentile over mitata batch means (protocol §6), not over individual iterations'
const NOTE_BYTES =
  'bytesPerOp is net resident bytes/op after full GC (protocol §10.1 level 1), not gross allocation traffic'
const NOTE_COMPILED_MEM =
  'bytesPerOp is the heapUsed delta per compiled function over N expressions (protocol §10.10)'

// --- Cell input ------------------------------------------------------------

function readCellDescriptor() {
  const arg = process.argv.slice(2).find(a => a.trimStart().startsWith('{'))
  if (arg) return JSON.parse(arg)
  let stdin = ''
  try {
    stdin = readFileSync(0, 'utf8')
  } catch {
    stdin = ''
  }
  if (stdin.trim()) return JSON.parse(stdin)
  throw new Error(
    'no cell descriptor: pass a JSON object as argv or pipe it on stdin'
  )
}

function findFixture(name) {
  const fx = fixtures.find(f => f.name === name)
  if (!fx) throw new Error(`unknown fixture: ${name}`)
  return fx
}

// --- Statistics ------------------------------------------------------------

const percentile = (sorted, q) =>
  sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]

function statsFrom(samples) {
  if (!samples || samples.length === 0) return null
  const s = [...samples].sort((a, b) => a - b)
  const median = percentile(s, 0.5)
  const dev = s.map(x => Math.abs(x - median)).sort((a, b) => a - b)
  return {
    median_ns: median,
    mad_ns: percentile(dev, 0.5),
    p99_ns: percentile(s, 0.99),
    min_ns: s[0]
  }
}

// --- Backend helpers -------------------------------------------------------

const buildFn = (backend, expr, options) =>
  backend === 'compile' ? compile(expr, options) : interpret(expr, options)

// Extract the exact `functionCode` compile() feeds to `new Function`, by
// intercepting the Function constructor for the duration of one compile call.
// Returns the generated body string (the `new Function('ctx', body)` argument).
function captureFunctionCode(expr, options) {
  const Real = globalThis.Function
  let body = null
  function Patched(...args) {
    body = args[args.length - 1]
    return new Real(...args)
  }
  Patched.prototype = Real.prototype
  globalThis.Function = Patched
  try {
    compile(expr, options)
  } finally {
    globalThis.Function = Real
  }
  if (body === null) throw new Error('failed to capture generated functionCode')
  return body
}

// Actual JIT tier of `fn`, logged into cell metadata (protocol §4.2 / §10.8) —
// "Ignition" / "TurboFan" is measured, not assumed. Safe without natives.
function actualTierOf(fn) {
  if (!nativesAvailable || fn == null) {
    return { tier: 'unknown', status: null, bits: [] }
  }
  const status = getOptimizationStatus(fn)
  return { tier: classifyTier(fn), status: status ?? null, bits: decodeStatus(status) }
}

// --- ic-pressure (protocol §10.2) ------------------------------------------
//
// Before measuring the target expression, compile and run EVERY fixture in the
// corpus once through the SAME backend, so the process-global runtime helpers
// (`get` / `bop` / `uop`) see scope/data objects of many shapes and their
// feedback degrades from monomorphic to megamorphic — the realistic
// "hundred expressions in one app" condition (§10.2). The orchestrator reports
// the RATIO of this cell's median to the plain cell, never absolute ns.
// Failures on individual fixtures are swallowed: the goal is to pollute the
// shared ICs, not to re-run the parity suite.
function polluteSharedIc(backend) {
  let warmed = 0
  for (const fx of fixtures) {
    try {
      const fn = buildFn(backend, fx.expression, makeOptions(fx))
      const data = fx.makeData()
      // A few calls per fixture so the helper ICs actually record the shape.
      for (let i = 0; i < 4; i++) do_not_optimize(fn(data))
      warmed++
    } catch {
      // shape pollution only — ignore fixtures that throw on this data
    }
  }
  return warmed
}

// --- Unit of work per (backend, phase) -------------------------------------
//
// Returns a description with:
//   applicable  boolean — false for backend/phase combos that don't exist
//   reason      string  — invalid reason when !applicable
//   evalFn      the built function (eval phase only) — the tier-force target
//   invoke(i)   throwing-aware caller of evalFn returning its value (eval only)
//   thunk(i)    does one time-metric unit, sinking its result via do_not_optimize
//   produce(i)  does one bytes-metric unit, RETURNING the value to retain
//   note        optional extra metadata note
//
// `i` is a per-iteration index used only to uniquify (never changes semantics).
function buildUnit(cell) {
  const { backend, phase, fixture } = cell
  const expr = fixture.expression
  const options = makeOptions(fixture)
  const throwing = fixture.tags.includes('throwing')

  const notApplicable = reason => ({ applicable: false, reason })

  if (phase === 'eval') {
    // ic-pressure axis (§10.2): pollute the shared helpers BEFORE building the
    // target so its calls into get/bop hit megamorphic feedback.
    const icWarmed = cell.icPressure ? polluteSharedIc(backend) : 0
    const fn = buildFn(backend, expr, options)
    const data = getData(fixture)
    // Data is materialised here, in the worker, from the fixture generator —
    // outside the compiler's sight, so it cannot be constant-folded (§10.4).
    const invoke = throwing
      ? () => {
          try {
            return fn(data)
          } catch (err) {
            return err
          }
        }
      : () => fn(data)
    return {
      applicable: true,
      evalFn: fn,
      invoke,
      thunk: () => do_not_optimize(invoke()),
      produce: () => invoke(),
      icWarmed
    }
  }

  if (phase === 'compile') {
    return {
      applicable: true,
      thunk: i => do_not_optimize(buildFn(backend, uniquifyExpr(expr, i), options)),
      produce: i => buildFn(backend, uniquifyExpr(expr, i), options)
    }
  }

  if (phase === 'parse') {
    // Shared by both backends (parse has no eval cache; the comment only makes
    // the input distinct between iterations, which is harmless).
    return {
      applicable: true,
      thunk: i => do_not_optimize(parse(uniquifyComment(expr, i))),
      produce: i => parse(uniquifyComment(expr, i))
    }
  }

  if (phase === 'validate') {
    const tree = parse(expr) // parse once; isolate validate cost
    return {
      applicable: true,
      thunk: () => {
        validate(tree, expr)
        do_not_optimize(tree)
      },
      produce: () => {
        validate(tree, expr)
        return tree
      }
    }
  }

  if (phase === 'codegen') {
    if (backend !== 'compile') return notApplicable('phase-not-applicable')
    const tree = parse(expr) // parse once; isolate traverse cost
    return {
      applicable: true,
      thunk: () => do_not_optimize(traverse(tree, expr)),
      produce: () => traverse(tree, expr)
    }
  }

  if (phase === 'instantiate' || phase === 'instantiate+call') {
    if (backend !== 'compile') return notApplicable('phase-not-applicable')
    const body = captureFunctionCode(expr, options)
    const ctx = resolveContext(options)
    const data = getData(fixture)
    const withCall = phase === 'instantiate+call'
    const runArrow = arrow => {
      // First call triggers lazy compilation of the arrow body (probe P5).
      if (throwing) {
        try {
          return arrow(data)
        } catch (err) {
          return err
        }
      }
      return arrow(data)
    }
    const oneShot = i => {
      // eslint-disable-next-line no-new-func -- the measured operation itself
      const factory = new Function('ctx', body + jsComment(i))
      const arrow = factory(ctx)
      return withCall ? runArrow(arrow) : arrow
    }
    return {
      applicable: true,
      thunk: i => do_not_optimize(oneShot(i)),
      produce: i => oneShot(i)
    }
  }

  return notApplicable(`unknown-phase:${phase}`)
}

// --- Cell envelope ---------------------------------------------------------

function baseCell(cell, extra = {}) {
  return {
    fixture: cell.fixture.name,
    tags: cell.fixture.tags,
    backend: cell.backend,
    phase: cell.phase,
    tier: cell.tier,
    metric: cell.metric,
    icPressure: cell.icPressure === true,
    tierAssert: null,
    invalid: null,
    stats: null,
    gc: { collections: 0, bytesPerOp: null, contaminated: false },
    meta: {
      corpusVersion,
      expression: cell.fixture.expression,
      nativesAvailable,
      buildDir: cell.buildDir ?? null,
      node: process.versions.node,
      v8: process.versions.v8,
      execArgv: process.execArgv,
      date: new Date().toISOString(),
      notes: []
    },
    ...extra
  }
}

// --- Time metric -----------------------------------------------------------

async function timeCell(cell) {
  const unit = buildUnit(cell)
  const out = baseCell(cell)
  if (!unit.applicable) {
    out.invalid = unit.reason
    return out
  }
  out.meta.notes.push(NOTE_P99)
  if (unit.icWarmed) out.meta.icWarmed = unit.icWarmed

  if (cell.tier === 'cold') {
    // Fresh-process cold path (protocol §4.2): no warmup, k units, single
    // measurement; the orchestrator spawns R processes for a distribution.
    const k = cell.k ?? DEFAULT_K
    const t0 = process.hrtime.bigint()
    for (let i = 0; i < k; i++) unit.thunk(i)
    const t1 = process.hrtime.bigint()
    const perOpNs = Number(t1 - t0) / k
    out.stats = statsFrom([perOpNs])
    out.meta.k = k
    out.meta.actualTier = actualTierOf(unit.evalFn) // may be null for non-eval
    return out
  }

  // steady / no-opt: mitata sampling. gc disabled — time process never GCs
  // for the metric (bytes are a separate process, §10.1 / P7).
  const mitataOpts = {
    min_cpu_time: (cell.minCpuTimeMs ?? DEFAULT_MIN_CPU_MS) * 1e6,
    gc: false
  }

  if (cell.tier === 'steady' && cell.phase === 'eval' && unit.evalFn) {
    // Full steady recipe: force → assert → sample → re-assert (protocol §4.1).
    const pre = forceSteady(unit.evalFn, unit.invoke, {
      warmup: cell.warmup ?? DEFAULT_WARMUP
    })
    out.meta.forceStatus = pre.status ?? null
    let iF = 0
    const stats = await measure(() => {
      do_not_optimize(unit.invoke(iF++))
    }, mitataOpts)
    out.stats = statsFrom(stats.samples)
    out.meta.mitata = { ticks: stats.ticks, samples: stats.samples.length, batched: stats.ticks > stats.samples.length }
    const post = assertStillSteady(unit.evalFn)
    out.tierAssert = post.ok ? 'turbofanned' : (post.reason ?? pre.reason)
    if (!(pre.ok && post.ok)) out.invalid = pre.reason ?? post.reason
    out.meta.actualTier = actualTierOf(unit.evalFn)
    return out
  }

  // steady non-eval, or no-opt: sample under the mode's flags without forcing a
  // specific target (no single stable SimplEx function to assert here).
  let iN = 0
  const stats = await measure(() => {
    unit.thunk(iN++)
  }, mitataOpts)
  out.stats = statsFrom(stats.samples)
  out.meta.mitata = { ticks: stats.ticks, samples: stats.samples.length, batched: stats.ticks > stats.samples.length }
  if (unit.evalFn) out.meta.actualTier = actualTierOf(unit.evalFn)
  return out
}

// --- bytes/op metric (protocol §10.1) --------------------------------------

const forcedGc =
  typeof globalThis.gc === 'function'
    ? () => {
        globalThis.gc()
        globalThis.gc()
      }
    : null

const flushGcEntries = () => new Promise(r => setTimeout(r, GC_FLUSH_MS))

// Level 1 (metric) + level 2 (guard). `produce(i)` returns the value to retain
// so surviving allocations are counted; the sink is preallocated OUTSIDE the
// window so its own backing store is not charged to the delta.
//
// `warm` must be large enough to tier up the code under test to the target
// tier before the window: for a steady eval cell the per-call bound-`get`
// closure is only scalar-replaced once the INNER generated arrow reaches
// TurboFan (invocation-count-for-turbofan = 3000, probe P6) — forcing the outer
// wrapper is not enough, so eval-steady passes a few thousand (protocol §10.1).
async function measureBytes(produce, K, warm = 64) {
  const sink = new Array(K)
  // Warm so the produced code is compiled/tiered before the measured window;
  // warm outputs are overwritten and die before the pre-window GC.
  for (let i = 0; i < warm; i++) sink[i % K] = produce(i)

  const gcTimes = []
  const obs = new PerformanceObserver(list => {
    for (const e of list.getEntries()) gcTimes.push(e.startTime)
  })
  obs.observe({ entryTypes: ['gc'] })
  await flushGcEntries()

  if (forcedGc) forcedGc() // full collection BEFORE the window (excluded)
  await flushGcEntries()

  const windowStart = performance.now()
  const before = process.memoryUsage().heapUsed
  for (let i = 0; i < K; i++) sink[i] = produce(i)
  const after = process.memoryUsage().heapUsed
  const windowEnd = performance.now()

  await flushGcEntries() // let in-window gc entries drain to the callback (P7)
  obs.disconnect()
  if (forcedGc) forcedGc() // cleanup AFTER reading `after` (excluded)
  do_not_optimize(sink)

  const inWindow = gcTimes.filter(
    t => t >= windowStart && t <= windowEnd
  ).length

  return {
    bytesPerOp: (after - before) / K,
    collections: inWindow,
    contaminated: inWindow > 0,
    hasForcedGc: forcedGc !== null
  }
}

async function bytesCell(cell) {
  const unit = buildUnit(cell)
  const out = baseCell(cell)
  if (!unit.applicable) {
    out.invalid = unit.reason
    return out
  }
  out.meta.notes.push(NOTE_BYTES)
  const K = cell.K ?? DEFAULT_BYTES_K

  // Tier matters for allocation: TurboFan scalar-replaces the per-call closure,
  // Maglev/Ignition do not (protocol §10.1). For a steady eval cell, force the
  // eval fn to turbofan first so the retained-allocation reading reflects it.
  if (cell.tier === 'steady' && cell.phase === 'eval' && unit.evalFn) {
    const pre = forceSteady(unit.evalFn, unit.invoke, {
      warmup: cell.warmup ?? DEFAULT_WARMUP
    })
    out.meta.forceStatus = pre.status ?? null
    if (!pre.ok) out.invalid = pre.reason
  }

  // Steady eval needs enough warm calls to tier the inner arrow to TurboFan so
  // its allocation is scalar-replaced (see measureBytes); other cells stay at
  // the light default (warming thousands of compiles would be pointless & slow).
  const warm = cell.phase === 'eval' && cell.tier === 'steady' ? 20000 : 64
  const res = await measureBytes(unit.produce, K, warm)
  out.gc = {
    collections: res.collections,
    bytesPerOp: res.bytesPerOp,
    contaminated: res.contaminated
  }
  out.meta.K = K
  out.meta.hasForcedGc = res.hasForcedGc
  if (unit.evalFn) out.meta.actualTier = actualTierOf(unit.evalFn)
  if (!res.hasForcedGc) {
    out.meta.notes.push('no --expose-gc: bytes/op unreliable (forced GC unavailable)')
  }
  return out
}

// --- compiled-fn memory macro (protocol §10.10) ----------------------------

async function compiledMemCell(cell) {
  const out = baseCell(cell)
  out.meta.notes.push(NOTE_COMPILED_MEM)
  const N = cell.N ?? DEFAULT_N
  const backend = cell.backend

  // N unique expressions cycled from the whole corpus. Compiled WITHOUT stdlib
  // options so the delta reflects the generated closures, not shared globals.
  const specs = new Array(N)
  for (let i = 0; i < N; i++) {
    const fx = fixtures[i % fixtures.length]
    specs[i] = uniquifyExpr(fx.expression, i)
  }

  const held = new Array(N)
  for (let i = 0; i < Math.min(N, 32); i++) held[i] = buildFn(backend, specs[i], {})

  if (forcedGc) forcedGc()
  await flushGcEntries()
  const before = process.memoryUsage().heapUsed
  for (let i = 0; i < N; i++) held[i] = buildFn(backend, specs[i], {})
  const after = process.memoryUsage().heapUsed
  do_not_optimize(held)
  if (forcedGc) forcedGc()

  out.gc = {
    collections: 0,
    bytesPerOp: (after - before) / N,
    contaminated: false
  }
  out.meta.N = N
  out.meta.hasForcedGc = forcedGc !== null
  if (forcedGc === null) {
    out.meta.notes.push('no --expose-gc: compiled-mem unreliable (forced GC unavailable)')
  }
  return out
}

// --- Level 3 scaffold: sampling heap profiler (diagnostic, NOT a metric) ----
//
// protocol §10.1 level 3 / task 05 §bytes level-3: a per-op number from CDP
// HeapProfiler.startSampling is too coarse (Poisson sampling); this is a manual
// investigation hook, wired but never part of the reported metric.
//
//   import { Session } from 'node:inspector/promises'
//   const s = new Session(); s.connect()
//   await s.post('HeapProfiler.startSampling', { samplingInterval: 512 })
//   … run workload …
//   const { profile } = await s.post('HeapProfiler.stopSampling')
//   // walk profile.head to attribute allocations to call sites
//
// Intentionally left as documentation: enabling it changes CPU/heap behaviour,
// so it must run in its own throwaway process, never alongside a metric.

// --- Main ------------------------------------------------------------------

async function main() {
  const descriptor = readCellDescriptor()
  // Load the compiler-under-test from the cell's buildDir before anything uses
  // it (ABAB dual-build §9.1); defaults to ../../build (back-compat).
  await loadCompiler(descriptor.buildDir)
  const cell = {
    ...descriptor,
    fixture: findFixture(descriptor.fixture),
    backend: descriptor.backend ?? 'compile',
    phase: descriptor.phase ?? 'eval',
    tier: descriptor.tier ?? 'steady',
    metric: descriptor.metric ?? 'time',
    icPressure: descriptor.icPressure === true,
    buildDir: descriptor.buildDir ?? null
  }

  let result
  if (cell.phase === 'compiled-mem') {
    result = await compiledMemCell(cell)
  } else if (cell.metric === 'bytes') {
    result = await bytesCell(cell)
  } else {
    result = await timeCell(cell)
  }

  process.stdout.write(JSON.stringify(result) + '\n')
}

main().catch(err => {
  process.stderr.write(`worker error: ${err?.stack ?? err}\n`)
  process.stdout.write(
    JSON.stringify({ invalid: 'worker-error', error: String(err?.message ?? err) }) + '\n'
  )
  process.exit(1)
})

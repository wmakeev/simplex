// worker.selfcheck — proves the measurement worker (task 05) produces a valid
// cell for every (backend × phase × tier-mode) combination on a light smoke
// fixture, and that the three acceptance-critical behaviours hold:
//
//   1. every combination runs and prints a valid JSON cell (schema §8.1);
//   2. a steady eval cell passes the `turbofanned` tier assert (both backends);
//   3. bytes/op is > 0 on an allocating fixture and ≈ 0 on a pure one (steady,
//      TurboFan scalar-replaces the per-call closure, §10.1), and an unplanned
//      in-window GC flags the run `contaminated`.
//
// Each check spawns a CHILD `node <tier-flags> worker.mjs <cell-json>` (natives
// must come from files, protocol §4.1) and asserts on the JSON it prints —
// exactly how the orchestrator (task 06) will drive it.
//
// Run: node bench/src/worker.selfcheck.mjs   (or: npm run bench:worker-selfcheck)

import { spawnSync } from 'node:child_process'
import { TIER_FLAGS } from './tier.mjs'

const workerUrl = new URL('./worker.mjs', import.meta.url)
const workerPath = workerUrl.pathname

const SMOKE = 'arith-mixed' // light `arith` fixture, present in the corpus
const ALLOC = 'collection-array-spread' // returns a fresh array → allocates
const PURE = 'arith-mixed' // returns a number → ~0 resident bytes in TurboFan

// Flags the orchestrator would launch a cell with: tier flag set + --expose-gc
// for the bytes metric (time and bytes never share a process, §10.1 / P7).
function flagsFor(tier, metric) {
  const base = [...TIER_FLAGS[tier]]
  if (metric === 'bytes' || metric === 'compiled-mem') base.push('--expose-gc')
  return base
}

// Spawn one worker child and return its parsed JSON cell (last stdout JSON line).
function runCell(cell) {
  const metric = cell.phase === 'compiled-mem' ? 'compiled-mem' : cell.metric
  const flags = flagsFor(cell.tier, metric)
  const res = spawnSync(
    process.execPath,
    [...flags, workerPath, JSON.stringify(cell)],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  const lines = (res.stdout || '').trim().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim()
    if (l.startsWith('{')) {
      try {
        return { cell: JSON.parse(l), status: res.status }
      } catch {
        /* fall through */
      }
    }
  }
  return {
    __error: (res.stderr || '').trim() || `exit ${res.status}, no JSON stdout`
  }
}

const results = []
function record(name, pass, detail) {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

// --- check 1: every (backend × phase × tier) combination yields a valid cell
{
  const backends = ['compile', 'interpret']
  const phases = [
    'eval',
    'compile',
    'parse',
    'validate',
    'codegen',
    'instantiate',
    'instantiate+call'
  ]
  const tiers = ['steady', 'cold', 'no-opt']
  // Phases with no meaning for the interpreter (no codegen, no new Function).
  const naForInterpret = new Set(['codegen', 'instantiate', 'instantiate+call'])

  let ok = 0
  let total = 0
  const failures = []
  for (const backend of backends) {
    for (const phase of phases) {
      for (const tier of tiers) {
        total++
        const cell = {
          fixture: SMOKE,
          backend,
          phase,
          tier,
          metric: 'time',
          minCpuTimeMs: 25,
          k: 5
        }
        const out = runCell(cell)
        const na = backend === 'interpret' && naForInterpret.has(phase)
        let good = false
        if (out.__error) {
          good = false
        } else if (na) {
          good = out.cell.invalid === 'phase-not-applicable'
        } else {
          // Valid: parsed a cell with the right axes and no error/invalid
          // (except a legitimate steady deopt, which is a real measured verdict).
          good =
            out.cell.backend === backend &&
            out.cell.phase === phase &&
            out.cell.tier === tier &&
            out.cell.invalid !== 'worker-error'
        }
        if (good) ok++
        else failures.push(`${backend}/${phase}/${tier}:${out.__error ?? out.cell?.invalid ?? '?'}`)
      }
    }
  }
  record(
    `all ${total} (backend × phase × tier) combinations produce a valid cell`,
    ok === total,
    ok === total ? `${ok}/${total}` : `${ok}/${total} — ${failures.slice(0, 4).join(', ')}`
  )
}

// --- check 2: steady eval is turbofanned on both backends
for (const backend of ['compile', 'interpret']) {
  const out = runCell({
    fixture: SMOKE,
    backend,
    phase: 'eval',
    tier: 'steady',
    metric: 'time',
    minCpuTimeMs: 60
  })
  const c = out.cell
  const ok =
    !out.__error &&
    c.tierAssert === 'turbofanned' &&
    c.invalid === null &&
    typeof c.stats?.median_ns === 'number'
  record(
    `steady eval (${backend}) passes turbofanned assert`,
    ok,
    out.__error ?? `tierAssert=${c?.tierAssert} invalid=${c?.invalid} median_ns=${c?.stats?.median_ns?.toFixed(1)}`
  )
}

// --- check 3a: bytes/op > 0 on an allocating fixture, ≈ 0 on a pure one
{
  const alloc = runCell({
    fixture: ALLOC,
    backend: 'compile',
    phase: 'eval',
    tier: 'steady',
    metric: 'bytes',
    K: 2048
  })
  const pure = runCell({
    fixture: PURE,
    backend: 'compile',
    phase: 'eval',
    tier: 'steady',
    metric: 'bytes',
    K: 2048
  })
  const a = alloc.cell?.gc?.bytesPerOp
  const p = pure.cell?.gc?.bytesPerOp
  const ok =
    !alloc.__error &&
    !pure.__error &&
    typeof a === 'number' &&
    typeof p === 'number' &&
    a > 32 && // allocating fixture clearly allocates
    p < 32 && // pure expression: closure scalar-replaced in TurboFan
    a > p * 3 // and the allocating one dominates
  record(
    'bytes/op: allocating > 0, pure ≈ 0 (steady/TurboFan)',
    ok,
    alloc.__error ?? pure.__error ?? `alloc=${a?.toFixed(1)} b/op, pure=${p?.toFixed(1)} b/op`
  )
}

// --- check 3b: an unplanned in-window GC flags the run contaminated
{
  // Large K on an allocating, retained batch overruns young-gen inside the
  // window and triggers scavenges the GC guard must catch (§10.1 level 2).
  const out = runCell({
    fixture: ALLOC,
    backend: 'compile',
    phase: 'eval',
    tier: 'cold',
    metric: 'bytes',
    K: 1_500_000
  })
  const c = out.cell
  const ok =
    !out.__error &&
    c.gc?.contaminated === true &&
    c.gc?.collections > 0
  record(
    'gc guard: in-window GC marks run contaminated',
    ok,
    out.__error ?? `contaminated=${c?.gc?.contaminated} collections=${c?.gc?.collections}`
  )
}

// --- check 4: compiled-fn memory macro (§10.10) reports a positive footprint
{
  const out = runCell({
    fixture: SMOKE,
    backend: 'compile',
    phase: 'compiled-mem',
    tier: 'cold',
    metric: 'bytes',
    N: 500
  })
  const bpo = out.cell?.gc?.bytesPerOp
  const ok = !out.__error && typeof bpo === 'number' && bpo > 0
  record(
    'compiled-mem: heapUsed per compiled fn > 0 (§10.10)',
    ok,
    out.__error ?? `${bpo?.toFixed(0)} b/compiled-fn`
  )
}

// --- check 5: cold eval logs the actual tier; no-opt stays un-optimized
{
  const cold = runCell({
    fixture: SMOKE,
    backend: 'compile',
    phase: 'eval',
    tier: 'cold',
    metric: 'time',
    k: 10
  })
  const noopt = runCell({
    fixture: SMOKE,
    backend: 'compile',
    phase: 'eval',
    tier: 'no-opt',
    metric: 'time',
    minCpuTimeMs: 40
  })
  const ok =
    !cold.__error &&
    !noopt.__error &&
    typeof cold.cell.stats?.median_ns === 'number' &&
    cold.cell.meta?.actualTier?.tier != null &&
    noopt.cell.meta?.actualTier?.tier === 'not-optimized'
  record(
    'cold logs actual tier; no-opt stays not-optimized',
    ok,
    cold.__error ?? noopt.__error ?? `cold=${cold.cell?.meta?.actualTier?.tier} no-opt=${noopt.cell?.meta?.actualTier?.tier}`
  )
}

// --- check 6: worker runs WITHOUT natives (a plain time process) and is honest
{
  // No tier flags at all → nativesAvailable false; a steady eval cell then
  // cannot assert (natives-unavailable) but must still print a valid cell.
  const res = spawnSync(
    process.execPath,
    [workerPath, JSON.stringify({ fixture: SMOKE, backend: 'compile', phase: 'eval', tier: 'steady', metric: 'time', minCpuTimeMs: 30 })],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  )
  let cell = null
  for (const l of (res.stdout || '').trim().split('\n').reverse()) {
    if (l.trim().startsWith('{')) {
      cell = JSON.parse(l.trim())
      break
    }
  }
  const ok =
    cell != null &&
    cell.meta?.nativesAvailable === false &&
    typeof cell.stats?.median_ns === 'number' &&
    cell.invalid === 'natives-unavailable'
  record(
    'no --allow-natives-syntax: cell still valid, assert honestly natives-unavailable',
    ok,
    cell ? `natives=${cell.meta?.nativesAvailable} invalid=${cell.invalid}` : (res.stderr || '').trim()
  )
}

const failed = results.filter(r => !r.pass).length
console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'} (${results.length} checks)`)
process.exit(failed === 0 ? 0 : 1)

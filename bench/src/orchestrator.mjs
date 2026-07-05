#!/usr/bin/env node
// orchestrator — matrix → job queue → child processes → aggregation → result
// file (measurement-protocol.md §3, §6, §8, §9.1, §10.2, §10.3).
//
// One `node <v8-flags> worker.mjs <cell-json>` per cell-repeat (task 05). The
// tier-mode's V8 flags come from tier.mjs TIER_FLAGS; the fingerprint from
// env.mjs. Every cell is repeated in R independent processes (§6, §10.7); their
// medians are aggregated into one summary cell (§8.1). Cells are randomised /
// interleaved so thermal drift is spread evenly, not loaded onto late cells.
//
// Run:
//   npm run bench                                   # full preset (whole matrix)
//   npm run bench -- --preset quick --tags arith    # quick preset, filtered
//   npm run bench -- --preset full --tags logic --repeats 2 --min-cpu-ms 50
//   npm run bench -- --abab ./build ./build-after   # dual-build ABAB (§9.1)
//   npm run bench -- --ic-pressure --tags property  # add the ic-pressure axis
//   npm run bench -- --diag --tags arith            # + per-cell deopt count
//   npm run bench -- --compare A.json B.json         # before/after delta table
//   npm run bench -- --compare A.json B.json --force  # override comparability gate
//
// See bench/README.md (Orchestrator / env) for the full flag reference.

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fixtures, corpusVersion } from '../fixtures/index.mjs'
import { TIER_FLAGS, DIAGNOSTIC_FLAGS, countDeopts } from './tier.mjs'
import { collectEnv } from './env.mjs'
import { runCompare } from './compare.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const workerPath = join(here, 'worker.mjs')
const resultsRoot = join(here, '..', 'results')
const tmpDir = join(resultsRoot, 'tmp')

// Compile-time backend has extra stages (§3); interpret has no codegen /
// new Function, so those phases are simply not generated for it.
const COMPILE_ONLY_PHASES = new Set(['codegen', 'instantiate', 'instantiate+call'])
const COMPILE_STAGE_PHASES = [
  'compile',
  'parse',
  'validate',
  'codegen',
  'instantiate',
  'instantiate+call'
]

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    preset: 'full',
    tags: null,
    compare: null,
    label: null,
    abab: null,
    icPressure: false,
    diag: false,
    force: false,
    dryRun: false,
    pin: true,
    core: null,
    repeats: null,
    minCpuMs: null,
    seed: null,
    noiseFloor: null,
    out: null,
    unknown: []
  }
  const need = (v, name) => {
    if (v == null) throw new Error(`${name} expects a value`)
    return v
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--preset': {
        const v = need(argv[++i], '--preset')
        if (v !== 'quick' && v !== 'full') {
          throw new Error(`--preset expects "quick" or "full", got ${JSON.stringify(v)}`)
        }
        args.preset = v
        break
      }
      case '--tags':
        args.tags = need(argv[++i], '--tags')
          .split(',')
          .map(t => t.trim())
          .filter(Boolean)
        break
      case '--compare': {
        const a = argv[++i]
        const b = argv[++i]
        if (a == null || b == null) throw new Error('--compare expects two files: A.json B.json')
        args.compare = [a, b]
        break
      }
      case '--label':
        args.label = need(argv[++i], '--label')
        break
      case '--abab': {
        const a = argv[++i]
        const b = argv[++i]
        if (a == null || b == null) throw new Error('--abab expects two build dirs: <dirA> <dirB>')
        args.abab = [a, b]
        break
      }
      case '--ic-pressure':
        args.icPressure = true
        break
      case '--diag':
        args.diag = true
        break
      case '--force':
        args.force = true
        break
      case '--dry-run':
        args.dryRun = true
        break
      case '--no-pin':
        args.pin = false
        break
      case '--core':
        args.core = Number(need(argv[++i], '--core'))
        break
      case '--repeats':
        args.repeats = Number(need(argv[++i], '--repeats'))
        break
      case '--min-cpu-ms':
        args.minCpuMs = Number(need(argv[++i], '--min-cpu-ms'))
        break
      case '--seed':
        args.seed = need(argv[++i], '--seed')
        break
      case '--noise-floor':
        args.noiseFloor = Number(need(argv[++i], '--noise-floor'))
        break
      case '--out':
        args.out = need(argv[++i], '--out')
        break
      default:
        args.unknown.push(arg)
    }
  }
  return args
}

// ---------------------------------------------------------------------------
// Seeded PRNG + shuffle (deterministic order per label/date, §6 / §9.1)
// ---------------------------------------------------------------------------

function hashSeed(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(arr, rnd) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------------------------------------------------------------------------
// Statistics (aggregation over R repeats, §8.1)
// ---------------------------------------------------------------------------

const median = xs => {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const mad = xs => {
  if (xs.length === 0) return null
  const m = median(xs)
  return median(xs.map(x => Math.abs(x - m)))
}

// ---------------------------------------------------------------------------
// Fixture selection + matrix build (§3)
// ---------------------------------------------------------------------------

function selectFixtures(preset, tags) {
  let sel = fixtures
  if (tags && tags.length) sel = sel.filter(f => tags.some(t => f.tags.includes(t)))
  if (preset === 'quick') sel = sel.filter(f => f.tags.includes('micro'))
  return sel
}

// Build the (build-agnostic) list of cell descriptors for the preset.
// A cell = { fixture, backend, phase, tier, metric, k?, icPressure? }.
function buildMatrix(preset, selected, opts) {
  const cells = []
  const backends = ['compile', 'interpret']
  const add = c => cells.push(c)

  if (preset === 'quick') {
    // quick = steady + micro, navigational (§3): eval only, time only.
    for (const fx of selected) {
      for (const backend of backends) {
        add({ fixture: fx.name, backend, phase: 'eval', tier: 'steady', metric: 'time' })
      }
    }
    return cells
  }

  // full = the whole matrix (§3).
  for (const fx of selected) {
    for (const backend of backends) {
      // eval — steady time + steady bytes + no-opt time (§4.1 / §4.3 / §10.1)
      add({ fixture: fx.name, backend, phase: 'eval', tier: 'steady', metric: 'time' })
      add({ fixture: fx.name, backend, phase: 'eval', tier: 'steady', metric: 'bytes' })
      add({ fixture: fx.name, backend, phase: 'eval', tier: 'no-opt', metric: 'time' })

      // cold — only cold-tagged fixtures, k ∈ {1, 10} (§4.2)
      if (fx.tags.includes('cold')) {
        for (const k of [1, 10]) {
          add({ fixture: fx.name, backend, phase: 'eval', tier: 'cold', metric: 'time', k })
        }
      }

      // compile-time stage decomposition (§3), steady time
      for (const phase of COMPILE_STAGE_PHASES) {
        if (backend === 'interpret' && COMPILE_ONLY_PHASES.has(phase)) continue
        add({ fixture: fx.name, backend, phase, tier: 'steady', metric: 'time' })
      }

      // ic-pressure axis (§10.2): eval-steady with a polluted shared IC
      if (opts.icPressure) {
        add({
          fixture: fx.name,
          backend,
          phase: 'eval',
          tier: 'steady',
          metric: 'time',
          icPressure: true
        })
      }
    }
  }

  // compiled-fn memory macro (§10.10): whole-corpus, once per backend.
  const nominal = selected[0]?.name ?? fixtures[0].name
  for (const backend of backends) {
    add({ fixture: nominal, backend, phase: 'compiled-mem', tier: 'cold', metric: 'bytes' })
  }

  return cells
}

// ---------------------------------------------------------------------------
// Spawning one worker child (§6)
// ---------------------------------------------------------------------------

function cellKey(cell) {
  return [
    cell.fixture,
    cell.backend,
    cell.phase,
    cell.tier,
    cell.metric,
    cell.k ?? '',
    cell.icPressure ? 'ic' : ''
  ].join('|')
}

function flagsFor(cell, diag) {
  const flags = [...TIER_FLAGS[cell.tier]]
  if (cell.metric === 'bytes' || cell.phase === 'compiled-mem') flags.push('--expose-gc')
  if (diag) flags.push(...DIAGNOSTIC_FLAGS)
  return flags
}

// Assemble the child argv, honouring taskset pinning (§7.1) with graceful
// degradation, and cold-tier compile-cache hygiene (§4.2).
function spawnWorker(cell, run, { diag = false } = {}) {
  const descriptor = {
    fixture: cell.fixture,
    backend: cell.backend,
    phase: cell.phase,
    tier: cell.tier,
    metric: cell.metric,
    minCpuTimeMs: run.minCpuMs
  }
  if (cell.k != null) descriptor.k = cell.k
  if (cell.icPressure) descriptor.icPressure = true
  if (run.buildDir) descriptor.buildDir = run.buildDir

  const flags = flagsFor(cell, diag)
  let cmd = process.execPath
  let argv = [...flags, workerPath, JSON.stringify(descriptor)]
  if (run.pinning.taskset && run.pinning.core != null) {
    argv = ['--cpu-list', String(run.pinning.core), cmd, ...argv]
    cmd = 'taskset'
  }

  const env = { ...process.env }
  if (cell.tier === 'cold') env.NODE_DISABLE_COMPILE_CACHE = '1'

  const res = spawnSync(cmd, argv, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env
  })

  if (diag) {
    return { deopts: countDeopts(res.stderr || ''), stderr: res.stderr || '' }
  }

  const lines = (res.stdout || '').trim().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim()
    if (l.startsWith('{')) {
      try {
        return JSON.parse(l)
      } catch {
        /* keep scanning */
      }
    }
  }
  return {
    invalid: 'spawn-error',
    error: (res.stderr || '').trim().split('\n').slice(-3).join(' ') || `exit ${res.status}`
  }
}

// Detect taskset once: `which` + a real probe run (§7.1). Any failure → the run
// degrades to un-pinned and the fingerprint records it.
function detectPinning(pin, core) {
  if (!pin) return { taskset: false, core: null, reason: 'disabled (--no-pin)' }
  const which = spawnSync('which', ['taskset'], { encoding: 'utf8' })
  if (which.status !== 0) return { taskset: false, core: null, reason: 'taskset not found' }
  const chosen = core != null ? core : Math.max(0, cpus().length - 1)
  const probe = spawnSync('taskset', ['--cpu-list', String(chosen), 'true'], { encoding: 'utf8' })
  if (probe.status !== 0) {
    return { taskset: false, core: null, reason: 'taskset probe failed' }
  }
  return { taskset: true, core: chosen, reason: null }
}

// ---------------------------------------------------------------------------
// Aggregation (§8.1): R repeats of one cell → one summary cell
// ---------------------------------------------------------------------------

function aggregate(cell, repeats, deopts) {
  const valid = repeats.filter(r => r && r.invalid == null)
  const invalidRepeats = repeats
    .filter(r => !r || r.invalid != null)
    .map(r => (r ? r.invalid : 'no-output'))

  const sample = repeats.find(r => r) ?? {}
  const out = {
    fixture: cell.fixture,
    tags: sample.tags ?? [],
    backend: cell.backend,
    phase: cell.phase,
    tier: cell.tier,
    metric: cell.metric,
    tierAssert: null,
    invalid: null,
    requestedProcesses: repeats.length,
    processes: valid.length,
    stats: null,
    gc: { collections: 0, bytesPerOp: null, contaminated: false },
    invalidRepeats
  }
  if (cell.k != null) out.k = cell.k
  if (cell.icPressure) out.icPressure = true
  if (deopts != null) out.deopts = deopts

  if (valid.length === 0) {
    // No valid repeat: surface the first reason so the cell is visibly dropped.
    out.invalid = invalidRepeats[0] ?? 'no-valid-repeat'
    // Still report the tier verdict if any repeat produced one.
    out.tierAssert = repeats.find(r => r && r.tierAssert)?.tierAssert ?? null
    return out
  }

  // Time metric: aggregate over per-process medians (§8.1 median of medians).
  const times = valid.filter(r => r.stats)
  if (times.length) {
    const medians = times.map(r => r.stats.median_ns)
    out.stats = {
      median_ns: median(medians),
      mad_ns: mad(medians),
      p99_ns: median(times.map(r => r.stats.p99_ns)),
      min_ns: Math.min(...times.map(r => r.stats.min_ns))
    }
  }

  // Bytes / compiled-mem: median bytes/op; contamination is any-of.
  const bytes = valid.filter(r => r.gc && r.gc.bytesPerOp != null)
  if (bytes.length) {
    out.gc = {
      collections: Math.max(...bytes.map(r => r.gc.collections ?? 0)),
      bytesPerOp: median(bytes.map(r => r.gc.bytesPerOp)),
      contaminated: bytes.some(r => r.gc.contaminated)
    }
  }

  // Per-repeat values (§9.2 stage 1: the delta sign must reproduce across the R
  // independent processes, so compare.mjs needs the individual repeat medians,
  // not just the aggregated median/MAD). Kept minimal: one array per metric.
  out.repeats = {
    medians_ns: times.map(r => r.stats.median_ns),
    bytesPerOp: bytes.map(r => r.gc.bytesPerOp)
  }

  // Tier assert: only meaningful for the steady-eval force-recipe cells.
  const asserts = valid.map(r => r.tierAssert).filter(Boolean)
  if (asserts.length) {
    out.tierAssert = asserts.every(a => a === 'turbofanned')
      ? 'turbofanned'
      : (asserts.find(a => a !== 'turbofanned') ?? 'turbofanned')
  }

  return out
}

// ---------------------------------------------------------------------------
// Result file writing (§8.1 / §8.2)
// ---------------------------------------------------------------------------

function gitInfo() {
  const git = a => {
    const r = spawnSync('git', a, { encoding: 'utf8' })
    return r.status === 0 ? r.stdout.trim() : null
  }
  return {
    commit: git(['rev-parse', '--short', 'HEAD']) ?? 'unknown',
    dirty: (git(['status', '--porcelain']) ?? '') !== ''
  }
}

function writeResult({ env, meta, cells, outDir, label }) {
  const date = meta.date.slice(0, 10)
  const dir = resolve(outDir)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${date}.${meta.commit}.${label}.json`)
  writeFileSync(file, JSON.stringify({ meta: { ...meta, label }, env, cells }, null, 2) + '\n')
  return file
}

// ---------------------------------------------------------------------------
// Run driver (shared by single-run and ABAB)
// ---------------------------------------------------------------------------

const CANARY_EVERY = 25 // insert a canary every N metric jobs in long suites
const CANARY_MIN_JOBS = 40 // "long suite" threshold (§9.1 p4)

// Run every cell R times, interleaved. `sides` is either one build (single run)
// or two (ABAB A/B). Returns a Map buildDir → Map cellKey → repeats[].
function runMatrix(matrix, sides, run, log) {
  const results = new Map(sides.map(s => [s.tag, new Map()]))
  for (const s of sides) {
    for (const c of matrix) results.get(s.tag).set(cellKey(c), [])
  }

  // One "pass" = every cell once; R passes, each reshuffled (§9.1: randomise
  // within each pass; interleave A/B per cell, never in AAAA BBBB blocks).
  const canaryCell = pickCanaryCell(matrix)
  let canaryBaseline = null
  let jobCounter = 0
  const totalJobs = matrix.length * run.repeats * sides.length
  const longSuite = totalJobs >= CANARY_MIN_JOBS

  for (let pass = 0; pass < run.repeats; pass++) {
    const order = shuffle(matrix, mulberry32(run.seedInt + pass))
    for (const cell of order) {
      for (const side of sides) {
        const r = spawnWorker(cell, { ...run, buildDir: side.buildDir })
        results.get(side.tag).get(cellKey(cell)).push(r)
        jobCounter++
        log.progress(jobCounter, totalJobs, cell, side.tag, r)
      }

      // Canary drift check (§9.1 p4): only in long suites, only stops when a
      // noiseFloor is configured — otherwise it is informational.
      if (longSuite && canaryCell && jobCounter % CANARY_EVERY === 0) {
        const cr = spawnWorker(canaryCell, { ...run, buildDir: sides[0].buildDir })
        const m = cr?.stats?.median_ns
        if (typeof m === 'number') {
          if (canaryBaseline == null) canaryBaseline = m
          else {
            const drift = Math.abs(m - canaryBaseline) / canaryBaseline
            log.canary(drift, m, canaryBaseline)
            if (run.noiseFloor != null && drift > run.noiseFloor) {
              throw new Error(
                `canary drift ${(drift * 100).toFixed(1)}% > noiseFloor ` +
                  `${(run.noiseFloor * 100).toFixed(1)}% after ${jobCounter} jobs — ` +
                  `machine is drifting, stop and revisit the §7.1 checklist`
              )
            }
          }
        }
      }
    }
  }
  return results
}

// A stable, always-present steady-eval time cell for drift tracking.
function pickCanaryCell(matrix) {
  return (
    matrix.find(
      c => c.tier === 'steady' && c.phase === 'eval' && c.metric === 'time' && !c.icPressure
    ) ?? null
  )
}

// Optional per-cell diagnostic deopt run (§10.3): one extra spawn per cell with
// DIAGNOSTIC_FLAGS; stderr traces are dropped into results/tmp (gitignored).
function runDiagnostics(matrix, run, log) {
  const map = new Map()
  mkdirSync(tmpDir, { recursive: true })
  for (const cell of matrix) {
    const { deopts, stderr } = spawnWorker(cell, run, { diag: true })
    map.set(cellKey(cell), deopts)
    if (deopts > 0) {
      const logFile = join(tmpDir, `diag.${cellKey(cell).replace(/\|/g, '_')}.trace`)
      writeFileSync(logFile, stderr)
      log.deopt(cell, deopts, logFile)
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Per-environment config (§7.3): noiseFloor calibrated by the A/A test lives in
// results/<envId>/env-config.json so every later run stamps it into meta without
// re-passing --noise-floor. CLI --noise-floor still wins for one-off overrides.
// ---------------------------------------------------------------------------

function readEnvConfig(envId) {
  try {
    const path = join(resultsRoot, envId, 'env-config.json')
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

// Calibration hygiene warning (§7.1). The hardware layer (governor / turbo /
// load) cannot be enforced from inside Node without privileges, so before a
// full run — the preset that feeds baselines and roadmap numbers — the
// orchestrator surfaces the machine state and warns loudly when it is not
// calibrated. It never blocks: on a machine where performance governor / turbo
// off need sudo, the honest path is to measure anyway and label the results
// "uncalibrated" (see bench/README.md §7.1 checklist).
function warnCalibration(env) {
  const warnings = []
  if (env.governor !== 'performance') {
    warnings.push(
      `cpufreq governor is "${env.governor}", not "performance" — ` +
        'frequency will drift under load (§7.1)'
    )
  }
  if (env.noTurbo === false) {
    warnings.push(
      'turbo boost is ON (intel_pstate/no_turbo=0) — early cells run hotter ' +
        'than late ones (§7.1)'
    )
  }
  const load1 = loadavg()[0]
  if (load1 > 0.5) {
    warnings.push(`1-min load average is ${load1.toFixed(2)} (> 0.5) — machine is not idle (§7.1)`)
  }
  if (warnings.length) {
    console.error('\n  ⚠ calibration warnings (full preset, §7.1):')
    for (const w of warnings) console.error(`    - ${w}`)
    console.error(
      '    → results are UNCALIBRATED; see bench/README.md for the manual\n' +
        '      calibration steps (they need sudo). Proceeding anyway.\n'
    )
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(`bench: ${err.message}`)
    process.exit(2)
  }
  if (args.unknown.length) {
    console.error(`bench: unknown argument(s): ${args.unknown.join(', ')}`)
    process.exit(2)
  }

  // --compare mode (protocol §9): delegate to compare.mjs.
  if (args.compare) {
    const code = runCompare(args.compare[0], args.compare[1], { force: args.force })
    process.exit(code)
  }

  const selected = selectFixtures(args.preset, args.tags)
  if (selected.length === 0) {
    console.error(
      `bench: no fixtures match preset=${args.preset} tags=${args.tags?.join(',') ?? '(all)'}`
    )
    process.exit(2)
  }

  const matrix = buildMatrix(args.preset, selected, { icPressure: args.icPressure })
  const repeats = args.repeats ?? (args.preset === 'quick' ? 3 : 10)
  const minCpuMs = args.minCpuMs ?? (args.preset === 'quick' ? 100 : 200)
  const label = args.label ?? args.preset
  const seedStr = args.seed ?? `${label}.${new Date().toISOString().slice(0, 10)}`
  const seedInt = hashSeed(seedStr)
  const pinning = detectPinning(args.pin, args.core)

  // Collect the fingerprint once, up front, so envId can locate the per-env
  // config and the calibration warning can read governor/turbo (§7.2 / §7.3).
  const env = { ...collectEnv(), pinning }
  const envConfig = readEnvConfig(env.envId)
  // noiseFloor precedence: CLI --noise-floor > env-config.json > none (§7.3).
  const noiseFloor =
    args.noiseFloor != null
      ? args.noiseFloor
      : typeof envConfig?.noiseFloor === 'number'
        ? envConfig.noiseFloor
        : null
  const noiseFloorSource =
    args.noiseFloor != null ? 'cli' : envConfig?.noiseFloor != null ? 'env-config' : 'none'

  const sides = args.abab
    ? [
        { tag: 'A', buildDir: resolve(args.abab[0]) },
        { tag: 'B', buildDir: resolve(args.abab[1]) }
      ]
    : [{ tag: 'single', buildDir: null }]

  const totalJobs = matrix.length * repeats * sides.length

  console.error('SimplEx benchmark harness — orchestrator (task 06).')
  console.error(`  preset:   ${args.preset}   label: ${label}`)
  console.error(`  tags:     ${args.tags ? args.tags.join(', ') : '(all)'}`)
  console.error(`  fixtures: ${selected.length}   cells: ${matrix.length}   repeats: ${repeats}`)
  console.error(`  metric jobs: ${totalJobs}   min-cpu: ${minCpuMs}ms`)
  console.error(
    `  pinning:  ${pinning.taskset ? `taskset core ${pinning.core}` : `OFF (${pinning.reason})`}`
  )
  console.error(`  ic-pressure: ${args.icPressure ? 'on' : 'off'}   diag: ${args.diag ? 'on' : 'off'}`)
  if (args.abab) console.error(`  ABAB: A=${sides[0].buildDir}  B=${sides[1].buildDir}`)
  console.error(`  seed: "${seedStr}" (${seedInt})`)
  console.error(
    `  noiseFloor: ${noiseFloor != null ? `${(noiseFloor * 100).toFixed(2)}%` : '(none)'} ` +
      `[${noiseFloorSource}]`
  )

  if (args.dryRun) {
    console.error('\n--dry-run: matrix only, no processes spawned.')
    for (const c of matrix) console.error(`  ${cellKey(c)}`)
    return
  }

  if (args.preset === 'full') warnCalibration(env)

  const run = { repeats, minCpuMs, pinning, seedInt, noiseFloor }

  const log = {
    progress: (n, total, cell, side, r) => {
      const tag = side === 'single' ? '' : `[${side}] `
      const v = r?.invalid ? `INVALID:${r.invalid}` : summarise(r)
      process.stderr.write(`\r  ${n}/${total} ${tag}${cellKey(cell)} — ${v}          `)
    },
    canary: (drift, m, base) =>
      process.stderr.write(
        `\n  canary drift ${(drift * 100).toFixed(2)}% (${m.toFixed(1)} vs ${base.toFixed(1)} ns)\n`
      ),
    deopt: (cell, n, file) =>
      console.error(`\n  DEOPT ${cellKey(cell)}: ${n} deopt(s) → ${file}`)
  }

  let byBuild
  try {
    byBuild = runMatrix(matrix, sides, run, log)
  } catch (err) {
    process.stderr.write('\n')
    console.error(`bench: ${err.message}`)
    process.exit(1)
  }
  process.stderr.write('\n')

  const deoptMap = args.diag ? runDiagnostics(matrix, { ...run, buildDir: sides[0].buildDir }, log) : null

  const { commit, dirty } = gitInfo()
  const date = new Date().toISOString()
  const outDir = args.out ?? (args.preset === 'quick' ? tmpDir : join(resultsRoot, env.envId))

  console.log(`\nenvId: ${env.envId}`)
  for (const side of sides) {
    const cells = matrix.map(cell =>
      aggregate(cell, byBuild.get(side.tag).get(cellKey(cell)), deoptMap?.get(cellKey(cell)))
    )
    const sideLabel = side.tag === 'single' ? label : `${label}-${side.tag}`
    const meta = {
      date,
      commit,
      dirty,
      label: sideLabel,
      preset: args.preset,
      corpusVersion,
      noiseFloor,
      seed: seedStr,
      tags: args.tags,
      icPressure: args.icPressure,
      buildDir: side.buildDir
    }
    const file = writeResult({ env, meta, cells, outDir, label: sideLabel })
    reportSummary(file, cells)
  }
}

// ---------------------------------------------------------------------------
// Console reporting
// ---------------------------------------------------------------------------

function summarise(r) {
  if (!r) return 'no-output'
  if (r.stats?.median_ns != null) return `${r.stats.median_ns.toFixed(1)} ns`
  if (r.gc?.bytesPerOp != null) return `${r.gc.bytesPerOp.toFixed(1)} b/op`
  return r.tierAssert ?? 'ok'
}

function reportSummary(file, cells) {
  const invalid = cells.filter(c => c.invalid != null)
  const steadyEval = cells.filter(
    c => c.tier === 'steady' && c.phase === 'eval' && c.metric === 'time' && c.invalid == null
  )
  const tfOk = steadyEval.filter(c => c.tierAssert === 'turbofanned').length
  console.log(`\nwrote ${file}`)
  console.log(`  cells: ${cells.length}   invalid (excluded from summaries): ${invalid.length}`)
  console.log(`  steady-eval-time turbofanned: ${tfOk}/${steadyEval.length}`)
  if (invalid.length) {
    console.log('  invalid cells:')
    for (const c of invalid.slice(0, 12)) {
      console.log(`    - ${cellKey(c)} → ${c.invalid}`)
    }
    if (invalid.length > 12) console.log(`    … and ${invalid.length - 12} more`)
  }
}

main()

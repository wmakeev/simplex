// compare — compares two result files (before/after) per measurement-protocol.md §9.
//
// Pipeline:
//   1. Comparability gate (§8.3): refuse unless envId, corpusVersion,
//      harnessVersion and the EXACT Node version match. --force overrides with a
//      loud cross-comparison banner.
//   2. Exclusions: `invalid` cells (tier assert) and `contaminated` bytes/op
//      runs never enter the comparison — they are listed separately.
//   3. Per-cell delta, classified with the two-stage significance criterion:
//      - Stage 1 (cheap filter, §9.2): a delta is a candidate only if ALL of
//        |Δ median| > noiseFloor (relative), |Δ median| > 3 × pooled MAD, and
//        the delta sign reproduces across the R independent processes (for two
//        unpaired result files: the per-repeat median sets are fully separated).
//      - Stage 2 (borderline, §9.2): percentile bootstrap CI on the relative
//        difference of medians + Mann-Whitney U (normal approximation with tie
//        correction). Reported as an effect-size CI ("B faster than A by X% [lo,
//        hi]"), never a bare p-value.
//   4. Cells with no effect are reported explicitly as `~` (zero slices are
//      mandatory, §9.3). bytes/op deltas ride in the same table (allocation
//      growth = a second-order regression). micro-interpret cells are flagged
//      "indicative" (§10.9).
//   5. Output: (a) a human-readable delta table; (b) a ready-to-paste markdown
//      block in the §9.3 format for docs/compiler-roadmap.md (printed after the
//      table on stdout).
//
// Invoked via `npm run bench -- --compare A.json B.json [--force]`.
//
// The statistics live in small, exported, individually testable helpers
// (normalCdf, mannWhitneyU, bootstrapRelCI, classifyDelta) — see
// compare.selfcheck.mjs, which validates them against exhaustive enumeration
// and known textbook / table values.

import { readFileSync } from 'node:fs'

// Comparability keys (§8.3): two results are comparable iff all four match.
const COMPARABILITY_KEYS = ['envId', 'corpusVersion', 'harnessVersion', 'node']

// When neither file carries a calibrated noiseFloor (§7.3) we fall back to this
// conservative relative threshold. Conservative here = HARDER to call a delta
// significant (§7.3 declares an environment with > 5% A/A noise "not ready", so
// 5% is a defensible ceiling: below it we cannot tell signal from machine noise).
const DEFAULT_NOISE_FLOOR = 0.05

const BOOTSTRAP_ITERS = 5000
const BOOTSTRAP_SEED = 0x5eed5eed

// ---------------------------------------------------------------------------
// Small stats primitives (kept dependency-free and exported for the selfcheck)
// ---------------------------------------------------------------------------

export function median(xs) {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function mad(xs) {
  if (xs.length === 0) return null
  const m = median(xs)
  return median(xs.map(x => Math.abs(x - m)))
}

// Percentile (0..100) via linear interpolation on the sorted sample.
export function percentile(xs, p) {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  if (s.length === 1) return s[0]
  const idx = (p / 100) * (s.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return s[lo]
  return s[lo] + (s[hi] - s[lo]) * (idx - lo)
}

// Standard-normal CDF via a high-accuracy erf approximation
// (Abramowitz & Stegun 7.1.26, max abs error ~1.5e-7).
export function normalCdf(z) {
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x)
  return 0.5 * (1 + sign * y)
}

// mulberry32 — deterministic PRNG for the bootstrap (matches orchestrator.mjs).
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Mann-Whitney U (normal approximation + tie correction, two-sided)
// ---------------------------------------------------------------------------
//
// Classic algorithm (Mann & Whitney 1947; tie correction per Lehmann):
//   - pool both samples, assign average (mid-)ranks to ties;
//   - R1 = sum of ranks of sample x; U1 = R1 - n1(n1+1)/2; U2 = n1 n2 - U1;
//   - μ_U = n1 n2 / 2;
//   - σ_U = sqrt( n1 n2 / 12 · [ (N+1) - Σ(t³ - t) / (N(N-1)) ] );
//   - z = (|U - μ_U| - 0.5) / σ_U  (0.5 = continuity correction);
//   - two-sided p = 2 · (1 - Φ(|z|)).
// Returns U (= min(U1,U2)), z and p. p is only trustworthy for larger n; the
// exact permutation test in the selfcheck cross-checks it. n ≥ ~8 per group
// (our R ≈ 10) is the regime where the normal approximation is adequate.
export function mannWhitneyU(x, y) {
  const n1 = x.length
  const n2 = y.length
  if (n1 === 0 || n2 === 0) return { U: null, z: null, p: 1, n1, n2 }

  // Average ranks over the pooled sample.
  const pooled = [
    ...x.map(v => ({ v, g: 0 })),
    ...y.map(v => ({ v, g: 1 }))
  ].sort((a, b) => a.v - b.v)
  const N = pooled.length
  const ranks = new Array(N)
  const tieGroups = []
  let i = 0
  while (i < N) {
    let j = i
    while (j < N && pooled[j].v === pooled[i].v) j++
    const avg = (i + 1 + j) / 2 // average of ranks i+1 .. j (1-based)
    for (let k = i; k < j; k++) ranks[k] = avg
    if (j - i > 1) tieGroups.push(j - i)
    i = j
  }

  let R1 = 0
  for (let k = 0; k < N; k++) if (pooled[k].g === 0) R1 += ranks[k]

  const U1 = R1 - (n1 * (n1 + 1)) / 2
  const U2 = n1 * n2 - U1
  const U = Math.min(U1, U2)

  const muU = (n1 * n2) / 2
  const tieTerm = tieGroups.reduce((s, t) => s + (t * t * t - t), 0)
  const sigmaSq = ((n1 * n2) / 12) * (N + 1 - tieTerm / (N * (N - 1)))
  const sigma = Math.sqrt(sigmaSq)

  if (sigma === 0) return { U, z: 0, p: 1, n1, n2 }
  const z = (Math.abs(U - muU) - 0.5) / sigma
  const p = 2 * (1 - normalCdf(Math.abs(z)))
  return { U, z, p: Math.min(1, Math.max(0, p)), n1, n2 }
}

// ---------------------------------------------------------------------------
// Percentile bootstrap CI on the RELATIVE difference of medians (effect size)
// ---------------------------------------------------------------------------
//
// Resamples each per-repeat set with replacement; rel = (med(B*) - med(A*)) /
// med(A*). The 2.5 / 97.5 percentiles give a 95% effect-size CI. The point
// estimate uses the observed medians. Deterministic (seeded) for reproducibility.
export function bootstrapRelCI(aRep, bRep, { iters = BOOTSTRAP_ITERS, seed = BOOTSTRAP_SEED } = {}) {
  const medA = median(aRep)
  const medB = median(bRep)
  const point = medA !== 0 && medA != null ? (medB - medA) / medA : null
  if (aRep.length === 0 || bRep.length === 0) return { lo: null, hi: null, point }
  const rnd = mulberry32(seed)
  const pick = arr => arr[Math.floor(rnd() * arr.length)]
  const rels = []
  for (let it = 0; it < iters; it++) {
    const sa = new Array(aRep.length)
    const sb = new Array(bRep.length)
    for (let k = 0; k < aRep.length; k++) sa[k] = pick(aRep)
    for (let k = 0; k < bRep.length; k++) sb[k] = pick(bRep)
    const ma = median(sa)
    if (ma !== 0) rels.push((median(sb) - ma) / ma)
  }
  return { lo: percentile(rels, 2.5), hi: percentile(rels, 97.5), point }
}

// True when the two per-repeat sets are fully separated (no overlap) — the
// unpaired analogue of "the delta sign reproduces across all R processes"
// (§9.2 / §10.7). For two independent result files there is no per-pass pairing
// to preserve, so complete separation is the faithful, strong translation.
export function fullySeparated(aRep, bRep) {
  if (aRep.length === 0 || bRep.length === 0) return false
  const aMin = Math.min(...aRep)
  const aMax = Math.max(...aRep)
  const bMin = Math.min(...bRep)
  const bMax = Math.max(...bRep)
  return bMax < aMin || aMax < bMin
}

// ---------------------------------------------------------------------------
// Per-cell classification (two-stage criterion, §9.2)
// ---------------------------------------------------------------------------

// a, b: { value, repeats: [] } for one metric of one matched cell.
// Returns the delta, the three stage-1 gates, the class and (if it cleared
// stage 1) the stage-2 effect-size CI + Mann-Whitney result.
export function classifyDelta(a, b, noiseFloor) {
  const medA = a.value
  const medB = b.value
  const absDelta = medB - medA
  const relDelta = medA !== 0 ? absDelta / medA : absDelta === 0 ? 0 : Infinity

  const madA = mad(a.repeats) ?? 0
  const madB = mad(b.repeats) ?? 0
  const pooledMad = Math.sqrt((madA * madA + madB * madB) / 2)

  const c1 = Math.abs(relDelta) > noiseFloor // > environment noise floor
  const c2 = Math.abs(absDelta) > 3 * pooledMad // > 3 × pooled MAD (modified z)
  const c3 = fullySeparated(a.repeats, b.repeats) // unanimous sign across repeats
  const stage1 = c1 && c2 && c3

  let cls = 'none'
  let ci = null
  let mw = null
  if (stage1) {
    ci = bootstrapRelCI(a.repeats, b.repeats)
    mw = mannWhitneyU(a.repeats, b.repeats)
    const ciCrossesZero = ci.lo != null && ci.hi != null && ci.lo <= 0 && ci.hi >= 0
    // Confirmed significant only if stage 2 also agrees (CI excludes 0 and the
    // rank test rejects at 0.05); otherwise it is a borderline candidate.
    cls = mw.p < 0.05 && !ciCrossesZero ? 'sig' : 'borderline'
  }

  return { medA, medB, absDelta, relDelta, madA, madB, pooledMad, c1, c2, c3, stage1, cls, ci, mw }
}

// ---------------------------------------------------------------------------
// Comparability + file loading (§8.3)
// ---------------------------------------------------------------------------

function loadFile(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    throw new Error(`cannot read ${path}: ${err.message}`)
  }
  let json
  try {
    json = JSON.parse(raw)
  } catch (err) {
    throw new Error(`cannot parse ${path}: ${err.message}`)
  }
  if (!json || !json.env || !Array.isArray(json.cells)) {
    throw new Error(`${path} is not a benchmark result file (missing env/cells)`)
  }
  return json
}

export function checkComparability(a, b) {
  const mismatches = []
  for (const key of COMPARABILITY_KEYS) {
    const va = a.env?.[key]
    const vb = b.env?.[key]
    if (String(va) !== String(vb)) mismatches.push({ key, a: va, b: vb })
  }
  return mismatches
}

// ---------------------------------------------------------------------------
// Cell keying + metric extraction
// ---------------------------------------------------------------------------

function cellKey(c) {
  return [c.fixture, c.backend, c.phase, c.tier, c.metric, c.k ?? '', c.icPressure ? 'ic' : ''].join(
    '|'
  )
}

// Whether a cell is a bytes/allocation metric (contamination applies to these).
function isBytesCell(c) {
  return c.metric === 'bytes' || c.phase === 'compiled-mem'
}

// Pull the comparable value + per-repeat set for a cell, or null if it carries
// nothing measurable (should have been filtered as invalid already).
function metricOf(c) {
  if (isBytesCell(c)) {
    const value = c.gc?.bytesPerOp
    const repeats = c.repeats?.bytesPerOp ?? []
    if (value == null) return null
    return { kind: 'bytes', unit: 'b/op', value, repeats }
  }
  const value = c.stats?.median_ns
  const repeats = c.repeats?.medians_ns ?? []
  if (value == null) return null
  return { kind: 'time', unit: 'ns/op', value, repeats }
}

function isMicroInterpret(c) {
  return c.backend === 'interpret' && Array.isArray(c.tags) && c.tags.includes('micro')
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const pct = x => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`)
const num = x => (x == null ? 'n/a' : x >= 100 ? x.toFixed(0) : x.toFixed(1))
const pad = (s, n) => String(s).padEnd(n)
const padL = (s, n) => String(s).padStart(n)

// ---------------------------------------------------------------------------
// Core comparison (pure — returns a structured report; no I/O)
// ---------------------------------------------------------------------------

export function compareResults(a, b, { noiseFloor } = {}) {
  const nf =
    noiseFloor != null
      ? { value: noiseFloor, source: 'override' }
      : b.meta?.noiseFloor != null
        ? { value: b.meta.noiseFloor, source: 'after' }
        : a.meta?.noiseFloor != null
          ? { value: a.meta.noiseFloor, source: 'before' }
          : { value: DEFAULT_NOISE_FLOOR, source: 'default' }

  const aByKey = new Map(a.cells.map(c => [cellKey(c), c]))
  const bByKey = new Map(b.cells.map(c => [cellKey(c), c]))

  const rows = []
  const excludedInvalid = []
  const excludedContaminated = []
  const unmatched = []

  for (const [key, ca] of aByKey) {
    const cb = bByKey.get(key)
    if (!cb) {
      unmatched.push({ key, side: 'before-only' })
      continue
    }
    // Invalid on either side → excluded (§ tier assert).
    if (ca.invalid != null || cb.invalid != null) {
      excludedInvalid.push({ key, before: ca.invalid, after: cb.invalid })
      continue
    }
    // Contaminated bytes run on either side → excluded (§10.1 guard).
    if (isBytesCell(ca) && (ca.gc?.contaminated || cb.gc?.contaminated)) {
      excludedContaminated.push({ key, before: !!ca.gc?.contaminated, after: !!cb.gc?.contaminated })
      continue
    }
    const ma = metricOf(ca)
    const mb = metricOf(cb)
    if (!ma || !mb) {
      unmatched.push({ key, side: 'no-metric' })
      continue
    }
    const cls = classifyDelta(
      { value: ma.value, repeats: ma.repeats },
      { value: mb.value, repeats: mb.repeats },
      nf.value
    )
    rows.push({
      key,
      cell: ca,
      kind: ma.kind,
      unit: ma.unit,
      indicative: isMicroInterpret(ca),
      ...cls
    })
  }

  // Cells present only in the after file.
  for (const key of bByKey.keys()) if (!aByKey.has(key)) unmatched.push({ key, side: 'after-only' })

  rows.sort((x, y) => x.key.localeCompare(y.key))
  return { nf, rows, excludedInvalid, excludedContaminated, unmatched }
}

// ---------------------------------------------------------------------------
// Rendering: human-readable table
// ---------------------------------------------------------------------------

const CLASS_MARK = { sig: '**', borderline: '≈', none: '~' }

function renderTable(report) {
  const lines = []
  const header =
    pad('cell', 52) +
    padL('before', 12) +
    padL('after', 12) +
    padL('Δ', 10) +
    padL('Δ%', 9) +
    '  ' +
    'class  effect-size CI'
  lines.push(header)
  lines.push('-'.repeat(header.length))

  for (const r of report.rows) {
    const mark = CLASS_MARK[r.cls]
    let ciStr = ''
    if (r.cls !== 'none' && r.ci) {
      ciStr = `${pct(r.ci.point)} [${pct(r.ci.lo)}, ${pct(r.ci.hi)}]  U=${r.mw.U} p=${r.mw.p.toFixed(3)}`
    }
    const name = r.key.replace(/\|+$/g, '').replace(/\|/g, ' ') + (r.indicative ? ' *' : '')
    lines.push(
      pad(name, 52) +
        padL(num(r.medA), 12) +
        padL(num(r.medB), 12) +
        padL(num(r.absDelta), 10) +
        padL(pct(r.relDelta), 9) +
        '  ' +
        pad(mark, 5) +
        '  ' +
        ciStr
    )
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Rendering: ready-to-paste markdown block (§9.3)
// ---------------------------------------------------------------------------

function renderMarkdown(report, a, b) {
  const sig = report.rows.filter(r => r.cls === 'sig')
  const borderline = report.rows.filter(r => r.cls === 'borderline')
  const none = report.rows.filter(r => r.cls === 'none')

  const describe = r => {
    const name = r.key.replace(/\|+$/g, '').replace(/\|/g, '/')
    const ci = r.ci ? ` (${num(r.medA)}→${num(r.medB)} ${r.unit}, 95% CI [${pct(r.ci.lo)}, ${pct(r.ci.hi)}])` : ''
    return `${name} ${pct(r.relDelta)}${ci}${r.indicative ? ' [interpret micro — indicative §10.9]' : ''}`
  }

  const out = []
  out.push(`> **Measured (env \`${b.env.envId}\`, node ${b.env.node}):**`)
  if (sig.length) out.push('> significant: ' + sig.map(describe).join('; ') + '.')
  else out.push('> significant: none.')
  if (borderline.length) out.push('> borderline (stage 2 unconfirmed): ' + borderline.map(describe).join('; ') + '.')
  // Zero slices are mandatory (§9.3): always emit the `~` list.
  out.push('> no effect (~): ' + (none.length ? none.map(r => r.key.replace(/\|+$/g, '').replace(/\|/g, '/')).join(', ') : 'none') + '.')
  out.push(`> Before \`${a.meta?.label ?? '?'}\`, after \`${b.meta?.label ?? '?'}\`; results:`)
  out.push('> `bench/results/' + b.env.envId + '/*.json`.')
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// Entry point (I/O): read both files, gate, render, return an exit code
// ---------------------------------------------------------------------------

export function runCompare(pathA, pathB, { force = false, noiseFloor = null, log = console } = {}) {
  let a, b
  try {
    a = loadFile(pathA)
    b = loadFile(pathB)
  } catch (err) {
    log.error(`compare: ${err.message}`)
    return 2
  }

  log.log(`compare (protocol §9)`)
  log.log(`  before: ${pathA}  (label "${a.meta?.label ?? '?'}", commit ${a.meta?.commit ?? '?'})`)
  log.log(`  after:  ${pathB}  (label "${b.meta?.label ?? '?'}", commit ${b.meta?.commit ?? '?'})`)

  const mismatches = checkComparability(a, b)
  if (mismatches.length) {
    const detail = mismatches.map(m => `${m.key}: ${m.a} vs ${m.b}`).join(', ')
    if (!force) {
      log.error('')
      log.error(`compare: REFUSING — results are not comparable (§8.3): ${detail}`)
      log.error('  Comparing across environments / corpora / Node versions is invalid by')
      log.error('  construction. Re-run both on the same env, or pass --force to override.')
      return 2
    }
    log.log('')
    log.log('  ############################################################')
    log.log('  ## --force: CROSS-COMPARISON — RESULTS ARE NOT COMPARABLE  ##')
    log.log(`  ## ${detail}`)
    log.log('  ## Deltas below are NOT trustworthy (§8.3). For diagnosis   ##')
    log.log('  ## only — do NOT record these numbers in the roadmap.       ##')
    log.log('  ############################################################')
  }

  const report = compareResults(a, b, { noiseFloor })

  log.log('')
  log.log(
    `  noiseFloor: ${(report.nf.value * 100).toFixed(2)}% (${report.nf.source})` +
      (report.nf.source === 'default'
        ? '  — WARNING: neither file carries a calibrated noiseFloor (§7.3);'
        : '')
  )
  if (report.nf.source === 'default') {
    log.log('    using the conservative 5% default. Run an A/A calibration (task 08) to set it.')
  }
  log.log('  significance: stage 1 (|Δ|>noiseFloor AND >3×pooledMAD AND repeats fully separated)')
  log.log('                → stage 2 (bootstrap CI + Mann-Whitney U); ** = significant, ≈ = borderline, ~ = none')
  log.log('')

  log.log(renderTable(report))

  // Exclusions and unmatched cells — never silently dropped.
  if (report.excludedInvalid.length) {
    log.log('')
    log.log(`  excluded — invalid tier assert (${report.excludedInvalid.length}):`)
    for (const e of report.excludedInvalid)
      log.log(`    - ${e.key} (before: ${e.before ?? 'ok'}, after: ${e.after ?? 'ok'})`)
  }
  if (report.excludedContaminated.length) {
    log.log('')
    log.log(`  excluded — contaminated bytes run (${report.excludedContaminated.length}):`)
    for (const e of report.excludedContaminated)
      log.log(`    - ${e.key} (before: ${e.before}, after: ${e.after})`)
  }
  if (report.unmatched.length) {
    log.log('')
    log.log(`  unmatched cells (${report.unmatched.length}):`)
    for (const u of report.unmatched) log.log(`    - ${u.key} (${u.side})`)
  }

  const hasMicroInterpret = report.rows.some(r => r.indicative)
  if (hasMicroInterpret) {
    log.log('')
    log.log('  * micro-interpret cell — indicative only (§10.9): for the interpreter backend')
    log.log('    macro / ic-pressure numbers are the load-bearing ones, not micro.')
  }

  const nSig = report.rows.filter(r => r.cls === 'sig').length
  const nBord = report.rows.filter(r => r.cls === 'borderline').length
  const nNone = report.rows.filter(r => r.cls === 'none').length
  log.log('')
  log.log(`  summary: ${nSig} significant, ${nBord} borderline, ${nNone} no-effect (~), ` +
    `${report.rows.length} compared, ` +
    `${report.excludedInvalid.length + report.excludedContaminated.length} excluded`)

  log.log('')
  log.log('  markdown block for docs/compiler-roadmap.md (§9.3):')
  log.log('')
  log.log(renderMarkdown(report, a, b))

  return 0
}

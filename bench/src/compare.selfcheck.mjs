// compare.selfcheck — proves the compare.mjs statistics and classification are
// correct, WITHOUT re-writing statistics "by guess". Structure:
//
//   A. normalCdf against known standard-normal table values.
//   B. Mann-Whitney U against the pairwise DEFINITION (ground truth, incl. ties)
//      and its p against the EXACT permutation null + published exact-table
//      values (complete separation: two-sided p = 2 / C(N, n1)).
//   C. bootstrapRelCI: determinism, coverage, and correct point/sign.
//   D. The three task-07 acceptance criteria, reproduced on deterministic
//      synthetic result objects:
//        1. A/A (two runs of one commit) → no significant delta;
//        2. injected +30% on one cell → exactly one significant delta, right
//           sign and magnitude;
//        3. incomparable files (different Node) → refusal; --force → comparison.
//
// Run: node bench/src/compare.selfcheck.mjs   (or npm run bench:compare-selfcheck)

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  normalCdf,
  mannWhitneyU,
  bootstrapRelCI,
  classifyDelta,
  compareResults,
  checkComparability,
  runCompare
} from './compare.mjs'

const results = []
function record(name, pass, detail) {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
const approx = (a, b, tol) => Math.abs(a - b) <= tol

// A silent log sink so runCompare's console output does not spam the selfcheck.
const silent = { log() {}, error() {} }

// Deterministic PRNG (mulberry32) for jittered synthetic repeats.
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
// Ground-truth references (independent of compare.mjs internals)
// ---------------------------------------------------------------------------

// Mann-Whitney U by the pairwise definition (handles ties with the 0.5 rule).
function definitionalU(x, y) {
  let gt = 0
  let lt = 0
  let eq = 0
  for (const xi of x)
    for (const yj of y) {
      if (xi > yj) gt++
      else if (xi < yj) lt++
      else eq++
    }
  const U1 = gt + 0.5 * eq
  const U2 = lt + 0.5 * eq
  return Math.min(U1, U2)
}

// Exact permutation p-value: enumerate every way to label N pooled values as
// group-x (n1) vs group-y, compute each split's |U1 - μ|, and count those at
// least as extreme as observed. This is the exact null distribution (the number
// the normal approximation approximates), including ties.
function exactPermutationP(x, y) {
  const pooled = [...x, ...y]
  const N = pooled.length
  const n1 = x.length
  const muU = (n1 * (N - n1)) / 2
  const obsDev = Math.abs(definitionalU(x, y) - muU)

  // U1 for a given index subset chosen as group x.
  const uOf = idx => {
    const inX = new Array(N).fill(false)
    for (const i of idx) inX[i] = true
    const gx = pooled.filter((_, i) => inX[i])
    const gy = pooled.filter((_, i) => !inX[i])
    let gt = 0
    let eq = 0
    for (const a of gx)
      for (const b of gy) {
        if (a > b) gt++
        else if (a === b) eq++
      }
    return gt + 0.5 * eq
  }

  let total = 0
  let extreme = 0
  const comb = (start, chosen) => {
    if (chosen.length === n1) {
      total++
      if (Math.abs(uOf(chosen) - muU) >= obsDev - 1e-9) extreme++
      return
    }
    for (let i = start; i < N; i++) comb(i + 1, [...chosen, i])
  }
  comb(0, [])
  return extreme / total
}

// ---------------------------------------------------------------------------
// A. normalCdf against known table values
// ---------------------------------------------------------------------------
{
  const cases = [
    [0, 0.5],
    [1.0, 0.8413],
    [1.6448536, 0.95],
    [1.959964, 0.975],
    [2.575829, 0.995],
    [-1.959964, 0.025],
    [3.0, 0.99865]
  ]
  let ok = true
  const detail = []
  for (const [z, want] of cases) {
    const got = normalCdf(z)
    const good = approx(got, want, 5e-4)
    if (!good) ok = false
    detail.push(`Φ(${z.toFixed(3)})=${got.toFixed(5)}~${want}`)
  }
  record('A. normalCdf matches standard-normal table', ok, detail.join(' '))
}

// ---------------------------------------------------------------------------
// B. Mann-Whitney U vs definition, exact permutation p, and table values
// ---------------------------------------------------------------------------

// B1 — U equals the pairwise definition on random samples WITH ties.
{
  const rnd = mulberry32(42)
  let ok = true
  const detail = []
  for (let trial = 0; trial < 200; trial++) {
    const n1 = 3 + Math.floor(rnd() * 6)
    const n2 = 3 + Math.floor(rnd() * 6)
    // Small integer range → guarantees ties across/within groups.
    const x = Array.from({ length: n1 }, () => 1 + Math.floor(rnd() * 5))
    const y = Array.from({ length: n2 }, () => 1 + Math.floor(rnd() * 5))
    const got = mannWhitneyU(x, y).U
    const want = definitionalU(x, y)
    if (got !== want) {
      ok = false
      detail.push(`x=${x} y=${y} got=${got} want=${want}`)
    }
  }
  record('B1. MW U == pairwise definition (200 random cases with ties)', ok, detail.slice(0, 2).join(' | '))
}

// B2 — exact table values for complete separation: two-sided p = 2 / C(N, n1).
//      These match published Mann-Whitney exact-distribution tables.
{
  const choose = (n, k) => {
    let r = 1
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
    return Math.round(r)
  }
  const cases = [
    // [n, expected two-sided exact p, table source]
    [3, 2 / choose(6, 3)], // 0.10000
    [4, 2 / choose(8, 4)], // 0.02857
    [5, 2 / choose(10, 5)] // 0.00794
  ]
  let ok = true
  const detail = []
  for (const [n, wantP] of cases) {
    const x = Array.from({ length: n }, (_, i) => i + 1) // 1..n
    const y = Array.from({ length: n }, (_, i) => i + 1 + n) // n+1..2n
    const U = mannWhitneyU(x, y).U
    const exactP = exactPermutationP(x, y)
    const good = U === 0 && approx(exactP, wantP, 1e-9)
    if (!good) ok = false
    detail.push(`n=${n}: U=${U} exactP=${exactP.toFixed(5)} table=${wantP.toFixed(5)}`)
  }
  record('B2. exact permutation p == table value (complete separation)', ok, detail.join('  '))
}

// B3 — normal-approx p (mannWhitneyU) agrees with the exact permutation p in the
//      regime where the approximation is meant to hold (n≈8–10 per group).
{
  const rnd = mulberry32(7)
  let ok = true
  const detail = []
  for (let trial = 0; trial < 30; trial++) {
    const n = 8 + Math.floor(rnd() * 3) // 8..10 per group
    const shift = rnd() * 3
    const x = Array.from({ length: n }, () => rnd() * 5)
    const y = Array.from({ length: n }, () => rnd() * 5 + shift)
    const approxP = mannWhitneyU(x, y).p
    const exactP = exactPermutationP(x, y)
    // Normal approx with continuity correction: within ~0.05 of exact here.
    if (!approx(approxP, exactP, 0.06)) {
      ok = false
      detail.push(`n=${n} approx=${approxP.toFixed(3)} exact=${exactP.toFixed(3)}`)
    }
  }
  record('B3. normal-approx p ≈ exact permutation p (n≈8–10)', ok, detail.slice(0, 3).join(' | '))
}

// ---------------------------------------------------------------------------
// C. bootstrapRelCI — determinism, point estimate, coverage
// ---------------------------------------------------------------------------
{
  const a = [100, 101, 99, 100, 102, 98, 100, 101, 99, 100]
  const b = [70, 71, 69, 70, 72, 68, 70, 71, 69, 70] // ~ -30%
  const ci1 = bootstrapRelCI(a, b)
  const ci2 = bootstrapRelCI(a, b)
  const deterministic = ci1.lo === ci2.lo && ci1.hi === ci2.hi
  const pointOk = approx(ci1.point, -0.3, 0.01)
  const excludesZero = ci1.hi < 0
  const inOrder = ci1.lo <= ci1.point && ci1.point <= ci1.hi
  record(
    'C. bootstrapRelCI deterministic, point ≈ −30%, CI excludes 0',
    deterministic && pointOk && excludesZero && inOrder,
    `point=${(ci1.point * 100).toFixed(1)}% CI[${(ci1.lo * 100).toFixed(1)}%,${(ci1.hi * 100).toFixed(1)}%]`
  )

  // Overlapping (no real effect) → CI must span zero.
  const c = [100, 102, 98, 101, 99, 100, 103, 97, 100, 100]
  const d = [101, 99, 100, 102, 98, 100, 101, 99, 100, 100]
  const ciNull = bootstrapRelCI(c, d)
  record('C. bootstrapRelCI spans 0 for a no-effect pair', ciNull.lo <= 0 && ciNull.hi >= 0,
    `CI[${(ciNull.lo * 100).toFixed(1)}%,${(ciNull.hi * 100).toFixed(1)}%]`)
}

// ---------------------------------------------------------------------------
// classifyDelta unit behaviour (the two-stage gate)
// ---------------------------------------------------------------------------
{
  const sep = classifyDelta(
    { value: 100, repeats: [100, 101, 99, 100, 102] },
    { value: 70, repeats: [70, 71, 69, 70, 72] },
    0.05
  )
  const overlap = classifyDelta(
    { value: 100, repeats: [100, 103, 97, 101, 99] },
    { value: 99, repeats: [99, 102, 98, 100, 101] },
    0.05
  )
  record('classifyDelta: separated 30% → sig', sep.cls === 'sig' && sep.c1 && sep.c2 && sep.c3)
  record('classifyDelta: 1% overlap → none', overlap.cls === 'none' && !overlap.c1 && !overlap.c3)
}

// ---------------------------------------------------------------------------
// D. Three task-07 acceptance criteria on synthetic result objects
// ---------------------------------------------------------------------------

const ENV = {
  envId: 'i5-4690K.linux.node24',
  node: '24.16.0',
  corpusVersion: 1,
  harnessVersion: 1
}

function makeCell(fixture, backend, base, rnd, tags = ['arith', 'micro']) {
  const reps = Array.from({ length: 10 }, () => base * (1 + (rnd() - 0.5) * 0.01)) // ±0.5% jitter
  const sorted = [...reps].sort((a, b) => a - b)
  const med = sorted[5]
  return {
    fixture,
    tags: backend === 'interpret' ? tags : tags,
    backend,
    phase: 'eval',
    tier: 'steady',
    metric: 'time',
    tierAssert: 'turbofanned',
    invalid: null,
    processes: 10,
    requestedProcesses: 10,
    stats: { median_ns: med, mad_ns: 0.1, p99_ns: med * 1.1, min_ns: sorted[0] },
    gc: { collections: 0, bytesPerOp: null, contaminated: false },
    repeats: { medians_ns: reps, bytesPerOp: [] },
    invalidRepeats: []
  }
}

function makeFile(label, seed, mutate) {
  const rnd = mulberry32(seed)
  const cells = [
    makeCell('arith-compare', 'compile', 95, rnd),
    makeCell('arith-mixed', 'compile', 158, rnd),
    makeCell('arith-pow', 'compile', 46, rnd),
    makeCell('arith-mixed', 'interpret', 330, rnd)
  ]
  if (mutate) mutate(cells)
  return { meta: { label, commit: 'abc1234', noiseFloor: 0.02 }, env: { ...ENV }, cells }
}

// D1 — A/A: two independent jittered runs of the SAME values → 0 significant.
{
  const A = makeFile('aaA', 111)
  const B = makeFile('aaB', 222)
  const report = compareResults(A, B)
  const sig = report.rows.filter(r => r.cls !== 'none')
  record('D1. A/A → no significant delta', sig.length === 0,
    `${report.rows.length} cells, ${sig.length} flagged`)
}

// D2 — injected +30% on one cell → exactly one significant delta, right sign+size.
{
  const A = makeFile('before', 111)
  const B = makeFile('after', 222, cells => {
    const t = cells.find(c => c.fixture === 'arith-mixed' && c.backend === 'compile')
    t.stats.median_ns *= 1.3
    t.stats.min_ns *= 1.3
    t.stats.p99_ns *= 1.3
    t.repeats.medians_ns = t.repeats.medians_ns.map(x => x * 1.3)
  })
  const report = compareResults(A, B)
  const sig = report.rows.filter(r => r.cls === 'sig')
  const one = sig.length === 1
  const target = sig[0]
  const rightCell = target && target.key.startsWith('arith-mixed|compile')
  const rightMag = target && approx(target.relDelta, 0.3, 0.03) && target.relDelta > 0
  record('D2. injected +30% → exactly one significant delta, right sign+size', one && rightCell && rightMag,
    target ? `${target.key.split('|').slice(0, 2).join('/')} ${(target.relDelta * 100).toFixed(1)}% CI[${(target.ci.lo * 100).toFixed(1)}%,${(target.ci.hi * 100).toFixed(1)}%]` : 'no sig cell')
}

// D3 — incomparable files: checkComparability flags it; runCompare refuses
//      (exit 2) without --force and proceeds (exit 0) with --force.
{
  const A = makeFile('before', 111)
  const B = makeFile('after', 222)
  B.env.node = '26.0.0'
  const mism = checkComparability(A, B)
  const flagged = mism.length === 1 && mism[0].key === 'node'

  const dir = mkdtempSync(join(tmpdir(), 'simplex-compare-selfcheck-'))
  const pa = join(dir, 'a.json')
  const pb = join(dir, 'b.json')
  writeFileSync(pa, JSON.stringify(A))
  writeFileSync(pb, JSON.stringify(B))
  const codeRefuse = runCompare(pa, pb, { force: false, log: silent })
  const codeForce = runCompare(pa, pb, { force: true, log: silent })
  record('D3. incomparable → refuse (exit 2); --force → compare (exit 0)',
    flagged && codeRefuse === 2 && codeForce === 0,
    `mismatch=${mism.map(m => m.key)} refuse=${codeRefuse} force=${codeForce}`)
}

// ---------------------------------------------------------------------------
// Exclusions: invalid + contaminated bytes cells are dropped, not compared.
// ---------------------------------------------------------------------------
{
  const A = makeFile('before', 111)
  const B = makeFile('after', 222)
  // Mark one cell invalid on the after side.
  B.cells[0].invalid = 'deopted'
  // Add a contaminated bytes cell to both.
  const bytesCell = miss => ({
    fixture: 'arith-mixed', tags: ['arith', 'micro'], backend: 'compile', phase: 'eval',
    tier: 'steady', metric: 'bytes', tierAssert: null, invalid: null, processes: 10,
    requestedProcesses: 10, stats: null,
    gc: { collections: 1, bytesPerOp: 48, contaminated: miss }, repeats: { medians_ns: [], bytesPerOp: [48, 48, 48] }, invalidRepeats: []
  })
  A.cells.push(bytesCell(false))
  B.cells.push(bytesCell(true)) // contaminated on after
  const report = compareResults(A, B)
  const excludedInvalid = report.excludedInvalid.length === 1
  const excludedContam = report.excludedContaminated.length === 1
  record('E. invalid + contaminated bytes cells excluded (listed separately)',
    excludedInvalid && excludedContam,
    `invalid=${report.excludedInvalid.length} contaminated=${report.excludedContaminated.length}`)
}

const failed = results.filter(r => !r.pass).length
console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'} (${results.length} checks)`)
process.exit(failed === 0 ? 0 : 1)

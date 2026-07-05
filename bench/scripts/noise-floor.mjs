// Compute the A/A noise floor from two result files (protocol §7.3).
//
//   node bench/scripts/noise-floor.mjs A.json B.json [--write-env-config <dir>]
//
// Matches cells by (fixture|backend|phase|tier|metric|k|icPressure), takes the
// max |relative median delta| over valid steady eval-time cells and prints a
// JSON report to stdout. With --write-env-config it also creates/updates
// <dir>/env-config.json: sets `noiseFloor` (rounded UP to 2 decimals — §7.3
// says round conservatively) and appends a provenance note, preserving any
// other keys already present (icPressureNoiseFloor etc.).
//
// Every --write-env-config also APPENDS one line to
// <dir>/noise-floor-history.jsonl — an append-only log of measurements, so
// the latest value wins in env-config.json but past nights stay recorded.
// View the history as a table: node bench/scripts/noise-history.mjs
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const writeIdx = argv.indexOf('--write-env-config')
const envDir = writeIdx === -1 ? null : argv[writeIdx + 1]
const files = argv.filter(
  (a, i) => !a.startsWith('--') && (writeIdx === -1 || i !== writeIdx + 1)
)
if (files.length !== 2 || (writeIdx !== -1 && !envDir)) {
  console.error(
    'usage: node bench/scripts/noise-floor.mjs A.json B.json [--write-env-config <dir>]'
  )
  process.exit(2)
}

const [a, b] = files.map(f => JSON.parse(readFileSync(f, 'utf8')))

const key = c =>
  [c.fixture, c.backend, c.phase, c.tier, c.metric, c.k ?? '', c.icPressure ?? '']
    .join('|')

const bByKey = new Map(b.cells.map(c => [key(c), c]))

let max = null
let maxAll = null // over all valid steady time phases, informational
let matched = 0
for (const ca of a.cells) {
  const cb = bByKey.get(key(ca))
  if (!cb) continue
  if (ca.invalid != null || cb.invalid != null) continue
  if (ca.tier !== 'steady' || ca.metric !== 'time') continue
  const ma = ca.stats?.median_ns
  const mb = cb.stats?.median_ns
  if (!(ma > 0) || !(mb > 0)) continue
  matched++
  const rel = Math.abs(mb - ma) / ma
  const entry = { cell: key(ca), rel, a_ns: ma, b_ns: mb }
  if (!maxAll || rel > maxAll.rel) maxAll = entry
  if (ca.phase === 'eval' && (!max || rel > max.rel)) max = entry
}

if (!max) {
  console.error('noise-floor: no matched valid steady eval-time cells')
  process.exit(2)
}

const noiseFloor = Math.ceil(max.rel * 100) / 100
const report = {
  noiseFloor,
  maxEvalDeltaPct: +(max.rel * 100).toFixed(2),
  maxEvalCell: max.cell,
  maxAnySteadyTimeDeltaPct: +(maxAll.rel * 100).toFixed(2),
  maxAnyCell: maxAll.cell,
  matchedSteadyTimeCells: matched,
  files
}

if (envDir) {
  const cfgFile = join(envDir, 'env-config.json')
  const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : {}
  cfg.noiseFloor = noiseFloor
  cfg.noiseFloorNote =
    `A/A ${new Date().toISOString().slice(0, 10)}: max steady eval-time |delta| ` +
    `${report.maxEvalDeltaPct}% (${max.cell}); rounded up to ${noiseFloor}. ` +
    `Files: ${files.map(f => f.split('/').pop()).join(' vs ')}`
  writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n')
  report.wrote = cfgFile

  // Append-only history: the latest measurement wins in env-config.json,
  // past ones stay here with their date (view: scripts/noise-history.mjs).
  const histFile = join(envDir, 'noise-floor-history.jsonl')
  appendFileSync(
    histFile,
    JSON.stringify({
      date: new Date().toISOString(),
      noiseFloor,
      maxEvalDeltaPct: report.maxEvalDeltaPct,
      maxEvalCell: max.cell,
      matchedCells: matched,
      files: files.map(f => f.split('/').pop())
    }) + '\n'
  )
  report.history = histFile
}

console.log(JSON.stringify(report, null, 2))

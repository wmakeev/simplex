// Print the noise-floor measurement history as a table.
//
//   node bench/scripts/noise-history.mjs [<envId-dir>]
//
// Reads <envId-dir>/noise-floor-history.jsonl (appended by noise-floor.mjs
// on every --write-env-config, i.e. by every campaign / nightly A/A run).
// Without an argument, auto-detects the single env dir under bench/results/.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const resultsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'results')

let envDir = process.argv[2]
if (!envDir) {
  const dirs = readdirSync(resultsDir).filter(
    d => d !== 'tmp' && statSync(join(resultsDir, d)).isDirectory()
  )
  if (dirs.length !== 1) {
    console.error(
      dirs.length === 0
        ? 'noise-history: no env dirs under bench/results/ yet'
        : `noise-history: several env dirs (${dirs.join(', ')}) — pass one explicitly`
    )
    process.exit(2)
  }
  envDir = join(resultsDir, dirs[0])
}

const histFile = join(envDir, 'noise-floor-history.jsonl')
if (!existsSync(histFile)) {
  console.error(`noise-history: ${histFile} not found — no measurements recorded yet`)
  process.exit(2)
}

const rows = readFileSync(histFile, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(l => JSON.parse(l))

const pad = (s, n) => String(s).padEnd(n)
console.log(`noise-floor history — ${envDir}\n`)
console.log(
  pad('date', 17) + pad('noiseFloor', 12) + pad('max Δ%', 8) +
  pad('worst cell', 44) + 'A/A files'
)
console.log('-'.repeat(110))
for (const r of rows) {
  console.log(
    pad(new Date(r.date).toLocaleString('sv-SE').slice(0, 16), 17) +
    pad((r.noiseFloor * 100).toFixed(0) + '%', 12) +
    pad(r.maxEvalDeltaPct.toFixed(2), 8) +
    pad(r.maxEvalCell, 44) +
    r.files.join(' vs ')
  )
}
const cur = rows[rows.length - 1]
console.log(
  `\ncurrent (env-config.json): noiseFloor=${cur.noiseFloor} — from ${cur.date.slice(0, 10)}`
)

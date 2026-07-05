// env — collects the environment fingerprint stamped into every result file
// (measurement-protocol.md §7.2). One object decides result comparability
// (§8.3): two results are comparable iff envId, corpusVersion, harnessVersion
// and the exact Node version match.
//
// Fields (§7.2):
//   envId          slug "<cpu>.<os>.node<major>" — directory + comparability key
//   cpu            os.cpus()[0].model
//   cores          logical core count
//   governor       /sys cpufreq scaling_governor, "unknown" if unreadable
//   noTurbo        intel_pstate/no_turbo === 1 (true/false), null if unreadable
//   os             "<platform> <release>"
//   node           process.versions.node
//   v8             process.versions.v8
//   maglevDefault  LIVE probe on a minimal repro (%GetOptimizationStatus in a
//                  child), NOT read off the version number (§7.2 / §10.8)
//   mitata         "<semver>#<integrity>" read from package-lock.json (§6)
//   harnessVersion protocol/harness revision constant
//   corpusVersion  from the fixture registry
//
// The orchestrator augments the returned block with `pinning` (taskset state)
// before writing it — kept out of collectEnv() because it is a run-time fact,
// not a machine property.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, platform, release, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { STATUS } from './tier.mjs'
import { corpusVersion } from '../fixtures/index.mjs'

// Bump on any change to the measurement protocol or harness result schema that
// makes older result files incomparable (§8.3). Matches protocol §7.2 example.
export const harnessVersion = 1

// --- envId ------------------------------------------------------------------

// Compact CPU token for the slug: "Intel(R) Core(TM) i5-4690K CPU @ 3.50GHz"
// → "i5-4690K"; "AMD Ryzen 7 5800X" → "Ryzen7-5800X". Best-effort: falls back
// to a sanitised prefix of the model string.
export function cpuSlug(model) {
  let m = model.match(/i[3579]-[0-9A-Za-z]+/) // Intel Core iX-####[K/F/…]
  if (m) return m[0]
  m = model.match(/Ryzen\s+\d+\s+[0-9A-Za-z]+/i) // AMD Ryzen N XXXX
  if (m) return m[0].replace(/\s+/g, '')
  m = model.match(/Xeon[\w-]*\s+([0-9A-Za-z-]+)/i) // Intel Xeon E5-####
  if (m) return `Xeon-${m[1]}`
  return model
    .replace(/\(R\)|\(TM\)|\(tm\)|CPU|Processor|@.*$/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 24)
}

function nodeMajor() {
  return process.versions.node.split('.')[0]
}

export function computeEnvId(model) {
  return `${cpuSlug(model)}.${platform()}.node${nodeMajor()}`
}

// --- /sys probes ------------------------------------------------------------

function readSys(path) {
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    return null
  }
}

function readGovernor() {
  return readSys('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor') ?? 'unknown'
}

function readNoTurbo() {
  const v = readSys('/sys/devices/system/cpu/intel_pstate/no_turbo')
  if (v === null) return null
  return v === '1'
}

// --- mitata identity from package-lock.json (§6) ----------------------------

// Version AND resolved tarball integrity are pinned because npm versions outrun
// git tags (release hygiene, §6). Both live in package-lock.json under
// packages["node_modules/mitata"].{version,integrity}.
export function readMitataIdentity() {
  try {
    const lockPath = fileURLToPath(new URL('../../package-lock.json', import.meta.url))
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    const pkg =
      lock.packages?.['node_modules/mitata'] ??
      lock.dependencies?.mitata ??
      null
    if (!pkg?.version) return 'unknown'
    return pkg.integrity ? `${pkg.version}#${pkg.integrity}` : String(pkg.version)
  } catch {
    return 'unknown'
  }
}

// --- maglevDefault: live probe (§7.2 / §10.8) -------------------------------

// Spawn a child under --allow-natives-syntax only (default tiering otherwise),
// heat a tiny function past the TurboFan budget, and read %GetOptimizationStatus.
// maglevDefault ⇔ the pipeline optimises by default (kMaglevved | kTurboFanned).
// Same repro/definition as probe P2 (which documents this as the fingerprint's
// maglevDefault source). Natives must come from a FILE, never `node -e` (§4.1).
export function probeMaglevDefault() {
  const bit = (STATUS.kMaglevved ?? 0) | (STATUS.kTurboFanned ?? 0)
  const code = `
function f(a, b) { return a + b }
let acc = 0
for (let i = 0; i < 100000; i++) acc += f(i, i % 7)
await new Promise(r => setTimeout(r, 150))
f(1, 2)
process.stdout.write(JSON.stringify({ status: %GetOptimizationStatus(f), acc }))
`
  let dir
  try {
    dir = mkdtempSync(join(tmpdir(), 'simplex-env-'))
    const file = join(dir, 'maglev-probe.mjs')
    writeFileSync(file, code)
    const res = spawnSync(process.execPath, ['--allow-natives-syntax', file], {
      encoding: 'utf8',
      timeout: 30000
    })
    if (res.status !== 0 || !res.stdout) return null
    const { status } = JSON.parse(res.stdout.trim().split('\n').pop())
    return (status & bit) !== 0
  } catch {
    return null
  }
}

// --- assemble ---------------------------------------------------------------

export function collectEnv() {
  const model = cpus()[0]?.model ?? 'unknown'
  return {
    envId: computeEnvId(model),
    cpu: model,
    cores: cpus().length,
    governor: readGovernor(),
    noTurbo: readNoTurbo(),
    os: `${platform()} ${release()}`,
    node: process.versions.node,
    v8: process.versions.v8,
    maglevDefault: probeMaglevDefault(),
    mitata: readMitataIdentity(),
    harnessVersion,
    corpusVersion
  }
}

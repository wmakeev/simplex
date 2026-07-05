// Shared helpers for the §13 probe scripts (measurement-protocol.md).
//
// V8OptimizationStatus bits are parsed at import time from the vendored
// mjsunit.js snapshot of the target V8 branch (vendor/mjsunit-<tag>.js,
// fetched by p1-optimization-status.mjs). Nothing is hardcoded — see
// protocol §4.1 (never hardcode the bits).

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const probesDir = dirname(fileURLToPath(import.meta.url))

export const v8Tag = process.versions.v8.replace(/-node\.\d+$/, '')

export function vendoredMjsunitPath() {
  const exact = join(probesDir, 'vendor', `mjsunit-${v8Tag}.js`)
  try {
    readFileSync(exact)
    return exact
  } catch {
    const any = readdirSync(join(probesDir, 'vendor')).find(f =>
      /^mjsunit-.*\.js$/.test(f)
    )
    if (!any) throw new Error(`no vendored mjsunit.js in ${probesDir}/vendor`)
    console.warn(
      `WARNING: vendored mjsunit does not match running V8 ${v8Tag}: ${any}\n` +
        `re-run p1-optimization-status.mjs to fetch the matching snapshot`
    )
    return join(probesDir, 'vendor', any)
  }
}

export function parseOptimizationStatusBits(source) {
  const m = source.match(/var V8OptimizationStatus = \{([\s\S]*?)\};/)
  if (!m) throw new Error('V8OptimizationStatus not found in mjsunit source')
  const bits = {}
  for (const [, name, shift] of m[1].matchAll(/(k\w+):\s*1\s*<<\s*(\d+)/g)) {
    bits[name] = 1 << Number(shift)
  }
  return bits
}

export const STATUS = parseOptimizationStatusBits(
  readFileSync(vendoredMjsunitPath(), 'utf8')
)

export function decodeStatus(status) {
  return Object.keys(STATUS).filter(name => (status & STATUS[name]) !== 0)
}

// Spawn a child node with the given V8 flags running `code` as an ESM file.
// NOT `node -e`: on Node 24 the -e path runs a TS-transform that corrupts
// V8 natives syntax (%Foo()), so the code is written to a temp .mjs file.
const tmpDir = mkdtempSync(join(tmpdir(), 'simplex-probes-'))
let tmpSeq = 0
export function runNode(flags, code, opts = {}) {
  const file = join(tmpDir, `child-${tmpSeq++}.mjs`)
  writeFileSync(file, code)
  return spawnSync(process.execPath, [...flags, file], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...opts
  })
}

// Extract the last JSON object printed on a line by itself from stdout.
export function lastJson(res) {
  const lines = (res.stdout ?? '').trim().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line.startsWith('{')) return JSON.parse(line)
  }
  throw new Error(
    `no JSON in child output\nstdout: ${res.stdout}\nstderr: ${res.stderr}`
  )
}

export const buildIndexUrl = new URL(
  '../../build/src/index.js',
  import.meta.url
).href

export function section(title) {
  console.log(`\n=== ${title} ===`)
}

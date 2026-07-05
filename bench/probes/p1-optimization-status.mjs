// P1 (A1) — %GetOptimizationStatus bits.
//
// 1. Fetch mjsunit.js for the running V8 tag from the V8 repo, compare with
//    the vendored snapshot (vendor/mjsunit-<tag>.js) — the snapshot is the
//    source the harness tier.js helpers are ported from.
// 2. Live semantic check: TurboFan-optimized fn must report
//    kOptimized && kTurboFanned; Maglev-optimized fn must report
//    kOptimized && kMaglevved && !kTurboFanned (the reason a bare
//    kOptimized assert is not enough — protocol §4.1).
//
// Run: node bench/probes/p1-optimization-status.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import {
  v8Tag,
  vendoredMjsunitPath,
  parseOptimizationStatusBits,
  STATUS,
  decodeStatus,
  runNode,
  lastJson,
  section
} from './lib.mjs'

console.log(`node ${process.version}, v8 ${process.versions.v8} (tag ${v8Tag})`)

section('1. vendored snapshot vs upstream mjsunit.js')

const url = `https://chromium.googlesource.com/v8/v8/+/refs/tags/${v8Tag}/test/mjsunit/mjsunit.js?format=TEXT`
let upstreamBits = null
try {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const source = Buffer.from(await res.text(), 'base64').toString('utf8')
  upstreamBits = parseOptimizationStatusBits(source)
  const vendorPath = vendoredMjsunitPath()
  if (!vendorPath.endsWith(`mjsunit-${v8Tag}.js`)) {
    writeFileSync(new URL(`./vendor/mjsunit-${v8Tag}.js`, import.meta.url), source)
    console.log(`vendored fresh snapshot for ${v8Tag}; re-run this probe`)
    process.exit(1)
  }
  const vendored = parseOptimizationStatusBits(readFileSync(vendorPath, 'utf8'))
  const names = new Set([...Object.keys(upstreamBits), ...Object.keys(vendored)])
  let mismatches = 0
  for (const name of names) {
    if (upstreamBits[name] !== vendored[name]) {
      mismatches++
      console.log(`MISMATCH ${name}: upstream=${upstreamBits[name]} vendored=${vendored[name]}`)
    }
  }
  console.log(mismatches === 0 ? `OK: ${names.size} bit names match upstream` : `FAIL: ${mismatches} mismatches`)
} catch (err) {
  console.log(`SKIPPED (offline?): ${err.message} — using vendored snapshot as-is`)
}

console.log('bits:', JSON.stringify(STATUS))

section('2. live check: TurboFan tier')

// NB: child code MUST terminate statements with `;` — a newline before a
// %Native() line does not trigger ASI (% is a binary operator), so without
// `;` the natives call is parsed as modulo of the previous expression.
const tfCode = `
  function f(a, b) { return a + b }
  %PrepareFunctionForOptimization(f);
  f(1, 2); f(3, 4);
  %OptimizeFunctionOnNextCall(f);
  f(5, 6);
  console.log(JSON.stringify({ status: %GetOptimizationStatus(f) }));
`
const tf = lastJson(runNode(['--allow-natives-syntax'], tfCode))
const tfFlags = decodeStatus(tf.status)
console.log(`status=${tf.status}:`, tfFlags.join(', '))
const tfOk =
  (tf.status & STATUS.kOptimized) !== 0 &&
  (tf.status & STATUS.kTurboFanned) !== 0 &&
  (tf.status & STATUS.kMaglevved) === 0
console.log(tfOk ? 'OK: kOptimized && kTurboFanned && !kMaglevved' : 'FAIL: unexpected TurboFan status')

section('3. live check: Maglev tier (must also be kOptimized)')

const mlCode = `
  function f(a, b) { return a + b }
  %PrepareFunctionForOptimization(f);
  f(1, 2); f(3, 4);
  %OptimizeMaglevOnNextCall(f);
  f(5, 6);
  console.log(JSON.stringify({ status: %GetOptimizationStatus(f) }));
`
const ml = lastJson(runNode(['--allow-natives-syntax', '--maglev'], mlCode))
const mlFlags = decodeStatus(ml.status)
console.log(`status=${ml.status}:`, mlFlags.join(', '))
const mlOk =
  (ml.status & STATUS.kOptimized) !== 0 &&
  (ml.status & STATUS.kMaglevved) !== 0 &&
  (ml.status & STATUS.kTurboFanned) === 0
console.log(
  mlOk
    ? 'OK: Maglev reports kOptimized && kMaglevved && !kTurboFanned — bare kOptimized assert is insufficient, need the kTurboFanned bit'
    : 'FAIL: unexpected Maglev status'
)

section('verdict')
console.log(JSON.stringify({ tfOk, mlOk, bitsVerified: upstreamBits !== null }))

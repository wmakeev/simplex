// P8 (B9, E21) — baseline mono/mega IC ratio for property lookups inside a
// helper function (the shape of runtime.ts helpers like defaultGetProperty).
//
// Part 1: steady-tier (forced TurboFan) timing of `o.k` inside a helper fed
//   1 object shape (monomorphic IC) vs 8 shapes (megamorphic, stub cache).
//   Reported as a RATIO, per protocol §10.2 — absolute ns are only
//   indicative on an uncalibrated environment.
// Part 2: --log-ic run confirming the IC actually reaches megamorphic
//   state ('N') for the poly-fed helper and stays monomorphic ('1') for the
//   mono-fed one.
//
// Run: node bench/probes/p8-mono-mega-ic.mjs

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runNode, lastJson, section } from './lib.mjs'

const SHAPES = 8

// makeShapes(n): objects that all have .k but with different maps
// (different preceding properties → different shape trees).
const commonCode = `
  function makeShapes(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const o = {};
      for (let j = 0; j < i; j++) o['pad' + j] = j;
      o.k = i + 1;
      out.push(o);
    }
    return out;
  }
  function loadMono(o) { return o.k }
  function loadMega(o) { return o.k }
`

section('1. steady-tier timing: 1 shape vs 8 shapes (ratio)')

const timingCode = `
  ${commonCode}
  const mono = makeShapes(1);
  const mega = makeShapes(${SHAPES});
  %PrepareFunctionForOptimization(loadMono);
  %PrepareFunctionForOptimization(loadMega);
  // warm ICs to their final state BEFORE optimizing
  let acc = 0;
  for (let i = 0; i < 1000; i++) {
    acc += loadMono(mono[i % mono.length]);
    acc += loadMega(mega[i % mega.length]);
  }
  %OptimizeFunctionOnNextCall(loadMono);
  %OptimizeFunctionOnNextCall(loadMega);
  acc += loadMono(mono[0]);
  acc += loadMega(mega[0]);

  const N = 2_000_000;
  function measure(fn, objs) {
    const samples = [];
    for (let s = 0; s < 15; s++) {
      const t0 = process.hrtime.bigint();
      let a = 0;
      for (let i = 0; i < N; i++) a += fn(objs[i & (objs.length - 1)]);
      const t1 = process.hrtime.bigint();
      samples.push(Number(t1 - t0) / N);
      acc += a;
    }
    samples.sort((x, y) => x - y);
    return samples[Math.floor(samples.length / 2)];
  }
  // interleave the two measurements to share thermal conditions
  const m1a = measure(loadMono, mono);
  const m8a = measure(loadMega, mega);
  const m1b = measure(loadMono, mono);
  const m8b = measure(loadMega, mega);
  const statusMono = %GetOptimizationStatus(loadMono);
  const statusMega = %GetOptimizationStatus(loadMega);
  console.log(JSON.stringify({
    acc,
    monoNs: Math.min(m1a, m1b), megaNs: Math.min(m8a, m8b),
    statusMono, statusMega
  }));
`
const t = lastJson(runNode(['--allow-natives-syntax'], timingCode))
console.log(
  `mono: ${t.monoNs.toFixed(3)} ns/op, mega(${SHAPES} shapes): ${t.megaNs.toFixed(3)} ns/op`
)
console.log(`ratio mega/mono: ${(t.megaNs / t.monoNs).toFixed(2)}x`)
console.log(
  `tier check: statusMono=${t.statusMono}, statusMega=${t.statusMega} (expect kOptimized|kTurboFanned bits set)`
)

// NB: this V8 has no --trace-ic; the flag is --log-ic (writes to v8.log
// for tools/ic-processor).
section('2. IC states via --log-ic')

const dir = mkdtempSync(join(tmpdir(), 'p8-ic-'))
const logFile = join(dir, 'v8.log')
const icCode = `
  ${commonCode}
  const mono = makeShapes(1);
  const mega = makeShapes(${SHAPES});
  let acc = 0;
  for (let i = 0; i < 1000; i++) {
    acc += loadMono(mono[i % mono.length]);
    acc += loadMega(mega[i % mega.length]);
  }
  console.log(JSON.stringify({ acc }));
`
const res = runNode(
  ['--log-ic', `--logfile=${logFile}`, '--no-logfile-per-isolate'],
  icCode
)
lastJson(res)
let icLines = []
try {
  icLines = readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(l => l.startsWith('LoadIC,') && l.includes(',k,'))
} catch {
  console.log('no v8.log — --log-ic unavailable in this build')
}
if (icLines.length) {
  console.log(`LoadIC events for property "k": ${icLines.length}`)
  for (const l of icLines) {
    // format: LoadIC,pc,time,line,col,old_state,new_state,map,key,modifier,slow_reason,fn_name
    const p = l.split(',')
    console.log(
      `  ${p[0]} ${p[5]}->${p[6]} key=${p[8] ?? 'k'} fn=${p[p.length - 1] || '(anon)'}`
    )
  }
  const megaReached = icLines.some(l => l.split(',')[6] === 'N')
  console.log(
    megaReached
      ? 'OK: megamorphic state (N) reached for the poly-fed helper'
      : 'NOTE: no N state seen — inspect lines above (P = polymorphic caps at 4 shapes)'
  )
}

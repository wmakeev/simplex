// P5 (D17) — when is the body of a new Function-generated function actually
// compiled: at construction (compile()) or at the first call?
//
// Method: two children over the REAL codegen path, each compile()s N
// distinct expressions; child A never calls the compiled functions, child B
// calls each once. --log-function-events writes per-function events
// (parse-function, interpreter-lazy compile, first-execution) to v8.log;
// the A-vs-B difference in event counts attributes work to the first call.
//
// This decides how the harness treats the `instantiate` stage (§3): if
// compilation of the arrow body is lazy, `instantiate` alone under-reports
// and the protocol's "instantiate + first call" variant is mandatory.
//
// Run: node bench/probes/p5-new-function-lazy.mjs

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildIndexUrl, runNode, lastJson, section } from './lib.mjs'

const N = 50

function childCode(callIt) {
  // distinct marker per expression → distinct source strings → no
  // CompilationCacheEval hits between them
  return `
    const { compile } = await import(${JSON.stringify(buildIndexUrl)});
    const fns = [];
    for (let i = 0; i < ${N}; i++) {
      fns.push(compile('a + ' + (900000 + i)));
    }
    ${callIt ? 'let acc = 0; for (const fn of fns) acc += fn({ a: 1 });' : 'const acc = null;'}
    console.log(JSON.stringify({ acc }));
  `
}

function runVariant(callIt) {
  const dir = mkdtempSync(join(tmpdir(), 'p5-'))
  const logFile = join(dir, 'v8.log')
  const res = runNode(
    [
      '--log-function-events',
      `--logfile=${logFile}`,
      '--no-logfile-per-isolate',
      '--no-concurrent-recompilation'
    ],
    childCode(callIt)
  )
  lastJson(res)
  const lines = readFileSync(logFile, 'utf8').split('\n')
  // function-event lines: function,<event-type>,... ; also script,... lines
  const counts = {}
  for (const l of lines) {
    const m = l.match(/^function,([^,]+),/)
    if (m) counts[m[1]] = (counts[m[1]] ?? 0) + 1
  }
  return counts
}

section(`event counts: construct-only (A) vs construct+call (B), N=${N}`)
const a = runVariant(false)
const b = runVariant(true)
const types = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
console.log('event type'.padEnd(28), 'A(no call)'.padStart(10), 'B(call)'.padStart(8), 'B-A'.padStart(6))
for (const t of types) {
  const av = a[t] ?? 0
  const bv = b[t] ?? 0
  console.log(t.padEnd(28), String(av).padStart(10), String(bv).padStart(8), String(bv - av).padStart(6))
}

section('verdict')
// If per-function parse/compile events grow by ≈N in B, the arrow body is
// compiled lazily at first call, not at new Function construction.
const lazyIndicators = types
  .filter(t => /parse|compile|first-execution/i.test(t))
  .map(t => ({ t, delta: (b[t] ?? 0) - (a[t] ?? 0) }))
  .filter(x => x.delta >= N * 0.8)
console.log(
  JSON.stringify(
    {
      lazyCompileAtFirstCall: lazyIndicators.length > 0,
      indicators: lazyIndicators
    },
    null,
    2
  )
)

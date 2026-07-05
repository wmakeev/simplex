// tier.selfcheck — minimal repro proving the tier-control machinery of
// tier.mjs works on the target build. Each check spawns a CHILD node process
// (natives must come from files, not `node -e` — protocol §4.1) with the flag
// set under test, has the child import tier.mjs and print a JSON verdict, and
// asserts PASS/FAIL here in the parent.
//
// Checks (task 03 acceptance criteria):
//   1. steady   — a hot function passes the force-recipe and asserts
//                 turbofanned.
//   2. deopt    — a turbofanned function hit with an artificial deopt is
//                 detected as `deopted` by the post-measurement re-assert.
//   3. no-opt   — under --max-opt=0 the status is honestly "not optimized"
//                 (kInterpreted), so forceSteady reports not-optimized.
//   4. import   — the module imports WITHOUT --allow-natives-syntax and does
//                 not crash (nativesAvailable === false).
//
// Run: node bench/src/tier.selfcheck.mjs

import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tierUrl = JSON.stringify(new URL('./tier.mjs', import.meta.url).href)
const tmp = mkdtempSync(join(tmpdir(), 'simplex-tier-selfcheck-'))
let seq = 0

// Spawn `node <flags> <child.mjs>` and return the last JSON line of stdout.
function run(flags, code) {
  const file = join(tmp, `child-${seq++}.mjs`)
  writeFileSync(file, code)
  const res = spawnSync(process.execPath, [...flags, file], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  if (res.status !== 0) {
    return { __error: (res.stderr || '').trim() || `exit ${res.status}` }
  }
  const lines = (res.stdout || '').trim().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim()
    if (l.startsWith('{')) return JSON.parse(l)
  }
  return { __error: `no JSON in stdout\n${res.stdout}\n${res.stderr}` }
}

// A representative hot function + a warmup driver with DIFFERENT values of the
// SAME type (protocol §4.1). Shared by the steady and deopt children.
const hotSetup = `
  import { forceSteady, assertStillSteady, deoptimize, decodeStatus, isInterpreted } from ${tierUrl};
  // Distinct object shapes are irrelevant here; vary the numeric payload.
  const fn = data => data.a * 2 + data.b;
  const invoke = i => fn({ a: i, b: i % 7 });
`

const results = []
function record(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const STEADY = ['--allow-natives-syntax', '--noconcurrent_sweeping', '--noconcurrent_recompilation']

// --- check 1: steady force-recipe reaches turbofan ------------------------
{
  const out = run(STEADY, `${hotSetup}
    const pre = forceSteady(fn, invoke);
    console.log(JSON.stringify({ pre, flags: decodeStatus(pre.status) }));
  `)
  const ok = !out.__error && out.pre && out.pre.ok === true && out.pre.tier === 'turbofanned'
  record('steady: hot fn is turbofanned', ok,
    out.__error ? out.__error : `tier=${out.pre?.tier} status=${out.pre?.status} [${out.flags}]`)
}

// --- check 2: artificial deopt is detected --------------------------------
{
  const out = run(STEADY, `${hotSetup}
    const pre = forceSteady(fn, invoke);
    deoptimize(fn);                       // artificial deopt
    const post = assertStillSteady(fn);   // must notice it fell out
    console.log(JSON.stringify({ pre, post }));
  `)
  const ok =
    !out.__error &&
    out.pre?.ok === true &&
    out.post?.ok === false &&
    out.post?.reason === 'deopted'
  record('deopt: post-assert reports deopted', ok,
    out.__error ? out.__error : `pre.ok=${out.pre?.ok} post=${JSON.stringify(out.post)}`)
}

// --- check 3: --max-opt=0 is honestly not optimized -----------------------
{
  const out = run(['--max-opt=0', '--allow-natives-syntax'], `${hotSetup}
    const pre = forceSteady(fn, invoke);
    console.log(JSON.stringify({ pre, interpreted: isInterpreted(fn), flags: decodeStatus(pre.status) }));
  `)
  const ok =
    !out.__error &&
    out.pre?.ok === false &&
    out.pre?.reason === 'not-optimized' &&
    out.interpreted === true
  record('no-opt: --max-opt=0 stays interpreted', ok,
    out.__error ? out.__error : `tier=${out.pre?.tier} interpreted=${out.interpreted} [${out.flags}]`)
}

// --- check 4: imports cleanly without --allow-natives-syntax --------------
{
  const out = run([], `
    import { nativesAvailable, STATUS, getOptimizationStatus } from ${tierUrl};
    // Calling a wrapper must also be safe (returns undefined, no throw).
    const s = getOptimizationStatus(() => 0);
    console.log(JSON.stringify({ nativesAvailable, bits: Object.keys(STATUS).length, status: s ?? null }));
  `)
  const ok = !out.__error && out.nativesAvailable === false && out.bits > 0 && out.status === null
  record('import: no natives, no crash', ok,
    out.__error ? out.__error : `nativesAvailable=${out.nativesAvailable} bits=${out.bits}`)
}

const failed = results.filter(r => !r.pass).length
console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'} (${results.length} checks)`)
process.exit(failed === 0 ? 0 : 1)

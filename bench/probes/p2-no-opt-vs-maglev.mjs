// P2 (A4) — what does --no-opt actually disable? Does Maglev survive it?
//
// Research verdict said plain --no-opt is unreliable w.r.t. Maglev; the
// protocol picked --jitless for the no-opt tier mode. This probe verifies
// that on the target build:
//   a) default flags: which tier a hot function reaches naturally
//      (also answers maglevDefault for the env fingerprint)
//   b) --no-opt: is Maglev/Sparkplug still active?
//   c) --max-opt=0: interpreter-only alternative
//   d) --jitless: everything off (the protocol's choice)
//
// Run: node bench/probes/p2-no-opt-vs-maglev.mjs

import { STATUS, decodeStatus, runNode, lastJson, section } from './lib.mjs'

// Hot loop: enough calls to blow past invocation-count-for-maglev (400)
// and invocation-count-for-turbofan (3000); loop long enough for OSR too.
const childCode = `
  function f(a, b) { return a + b }
  let acc = 0;
  for (let i = 0; i < 100000; i++) acc += f(i, i % 7);
  // give concurrent recompilation a chance to finish
  await new Promise(r => setTimeout(r, 200));
  f(1, 2);
  console.log(JSON.stringify({ acc, status: %GetOptimizationStatus(f) }));
`

const variants = [
  ['default', []],
  ['--no-opt', ['--no-opt']],
  ['--max-opt=0', ['--max-opt=0']],
  ['--jitless', ['--jitless']]
]

const results = {}
for (const [name, flags] of variants) {
  const res = runNode(['--allow-natives-syntax', ...flags, '--trace-opt'], childCode)
  if (res.status !== 0) {
    console.log(`${name}: child failed: ${res.stderr.split('\n')[0]}`)
    continue
  }
  const { status } = lastJson(res)
  const traceLines = (res.stdout + res.stderr)
    .split('\n')
    .filter(l => /optimizing.*\bf\b|compiling method.*\bf\b/i.test(l))
  const tiers = decodeStatus(status)
  results[name] = { status, tiers }
  section(name)
  console.log(`status=${status}:`, tiers.join(', '))
  if (traceLines.length) console.log('trace-opt:', traceLines.slice(0, 4).join('\n  '))
}

section('verdict')
const noOpt = results['--no-opt']
const jitless = results['--jitless']
const dflt = results['default']
console.log(
  JSON.stringify(
    {
      maglevDefault:
        (dflt.status & (STATUS.kMaglevved | STATUS.kTurboFanned)) !== 0,
      noOptStillOptimizes: (noOpt.status & STATUS.kOptimized) !== 0,
      noOptStillBaseline: (noOpt.status & STATUS.kBaseline) !== 0,
      jitlessPureInterpreter:
        (jitless.status & (STATUS.kOptimized | STATUS.kBaseline)) === 0 &&
        (jitless.status & STATUS.kInterpreted) !== 0
    },
    null,
    2
  )
)

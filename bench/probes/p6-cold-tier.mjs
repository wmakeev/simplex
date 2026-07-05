// P6 (F22) — tiering budget defaults and the ACTUAL tier a real compiled
// expression sits in after 1–10 (…10000) calls: is "cold" really pure
// Ignition on this build?
//
// Note: this V8 (13.6) has no --interrupt-budget flag — tier-up is driven
// by --invocation-count-for-{maglev,turbofan,osr} (recorded below), plus
// bytecode-size-weighted budget internals.
//
// Two functions are inspected per call count k:
//   - wrapper: what compile() returns (the try/catch wrapper — this is the
//     only function the harness can reach via the public API);
//   - arrow: a twin of the generated `data => …` arrow built through the
//     same new Function bootstrap shape (the hot inner function).
//
// Run: node bench/probes/p6-cold-tier.mjs

import { execSync } from 'node:child_process'
import { buildIndexUrl, decodeStatus, runNode, lastJson, section } from './lib.mjs'

section('1. tiering flag defaults')
const opts = execSync(`${process.execPath} --v8-options`, { encoding: 'utf8' })
for (const flag of [
  'invocation-count-for-maglev',
  'invocation-count-for-turbofan',
  'invocation-count-for-osr',
  'minimum-invocations-after-ic-update',
  'interrupt-budget'
]) {
  const m = opts.match(new RegExp(`default: --${flag}=(\\S+)`))
  console.log(`  --${flag}: ${m ? m[1] : '(no such flag)'}`)
}

section('2. actual tier after k calls (fresh process per k)')

const ks = [1, 2, 5, 10, 100, 500, 1000, 5000, 10000]
console.log('k'.padStart(6), 'wrapper tier'.padEnd(34), 'arrow tier')
for (const k of ks) {
  const childCode = `
    const { compile } = await import(${JSON.stringify(buildIndexUrl)});
    const wrapper = compile('a + 424244');
    // twin of the generated arrow, same bootstrap shape as compiler.ts
    const arrow = new Function('ctx',
      'var bop=ctx.binaryOperators; return data=>bop["+"](data.a,424244)'
    )({ binaryOperators: { '+': (a, b) => a + b } });
    let acc = 0;
    for (let i = 0; i < ${k}; i++) { acc += wrapper({ a: i }); acc += arrow({ a: i }); }
    await new Promise(r => setTimeout(r, 100));
    console.log(JSON.stringify({
      acc,
      wrapper: %GetOptimizationStatus(wrapper),
      arrow: %GetOptimizationStatus(arrow)
    }));
  `
  const res = runNode(
    ['--allow-natives-syntax', `--expose-gc`],
    childCode
  )
  const { wrapper, arrow } = lastJson(res)
  const short = s =>
    decodeStatus(s)
      .filter(n => !/kIsFunction|kTopmost|kIsLazy/.test(n))
      .join('|') || 'none'
  console.log(String(k).padStart(6), short(wrapper).padEnd(34), short(arrow))
}

section('note')
console.log(
  'cold mode in the harness = fresh process, k∈{1,10}: expect no kBaseline/' +
    'kOptimized rows for those k above; tier drift at higher k shows where ' +
    'cold stops being cold.'
)

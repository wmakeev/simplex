// P7 (F24) — does an active PerformanceObserver('gc') distort time metrics?
//
// A/A comparison: identical allocation-heavy workload in child processes
// with and without a subscribed gc observer, interleaved O N O N … (R each),
// median-of-medians compared. The protocol uses the observer only as a
// bytes/op run invalidator; this probe quantifies how much having it active
// costs, to decide whether time-metric processes must run WITHOUT it.
//
// Run: node bench/probes/p7-gc-observer-overhead.mjs

import { runNode, lastJson, section } from './lib.mjs'

const R = 7

function childCode(withObserver) {
  return `
    ${withObserver
      ? `const { PerformanceObserver } = await import('node:perf_hooks');
         let gcCount = 0;
         const obs = new PerformanceObserver(list => { gcCount += list.getEntries().length });
         obs.observe({ entryTypes: ['gc'] });`
      : 'const gcCount = -1;'}
    // allocation-heavy workload: forces regular GC activity
    function work(n) {
      let acc = 0;
      for (let i = 0; i < n; i++) {
        const o = { a: i, b: i * 2, s: 'x' + (i & 1023) };
        acc += o.a + o.b + o.s.length;
      }
      return acc;
    }
    // warmup
    work(200000);
    const samples = [];
    for (let s = 0; s < 30; s++) {
      const t0 = process.hrtime.bigint();
      work(100000);
      const t1 = process.hrtime.bigint();
      samples.push(Number(t1 - t0));
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    await new Promise(r => setTimeout(r, 10));
    console.log(JSON.stringify({ median, gcCount: typeof gcCount === 'number' ? gcCount : -1 }));
  `
}

const medians = { on: [], off: [] }
let gcSeen = 0
for (let i = 0; i < R; i++) {
  for (const variant of ['on', 'off']) {
    const res = runNode([], childCode(variant === 'on'))
    const { median, gcCount } = lastJson(res)
    medians[variant].push(median)
    if (variant === 'on') gcSeen += gcCount
  }
}

const med = arr => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)]
const mOn = med(medians.on)
const mOff = med(medians.off)

section(`medians over ${R} interleaved processes (ns per 100k-iteration batch)`)
console.log(`observer ON : ${mOn} (samples: ${medians.on.join(', ')})`)
console.log(`observer OFF: ${mOff} (samples: ${medians.off.join(', ')})`)
console.log(`gc events seen by observers (total): ${gcSeen}`)

section('verdict')
const deltaPct = ((mOn - mOff) / mOff) * 100
console.log(
  JSON.stringify({ deltaPct: Number(deltaPct.toFixed(2)) }) +
    '  (positive = observer adds overhead)'
)

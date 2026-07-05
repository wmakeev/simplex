// P4 (B10) — does Object.freeze of an operator-table-shaped object keep it
// in fast-properties mode (single map transition), or normalize it to
// dictionary mode?
//
// Decisive check: %HasFastProperties before/after freeze.
// Supporting evidence: --log-maps events for the object's map chain.
//
// Run: node bench/probes/p4-freeze-map.mjs

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runNode, lastJson, section } from './lib.mjs'

// Shape mirrors runtime.ts defaultBinaryOperators: ~15 short string keys.
const childCode = `
  const bop = {
    '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b,
    '/': (a, b) => a / b, '^': (a, b) => a ** b, 'mod': (a, b) => a % b,
    '&': (a, b) => String(a) + String(b),
    '<': (a, b) => a < b, '<=': (a, b) => a <= b,
    '>': (a, b) => a > b, '>=': (a, b) => a >= b,
    '==': (a, b) => a === b, '!=': (a, b) => a !== b,
    'in': (a, b) => false, '??': (a, b) => a ?? b
  };
  const before = %HasFastProperties(bop);
  Object.freeze(bop);
  const after = %HasFastProperties(bop);
  // exercise a lookup so ICs see the frozen map
  const f = bop['+'];
  console.log(JSON.stringify({ before, after, probe: f(1, 2) }));
`

section('1. %HasFastProperties before/after Object.freeze')
const res = runNode(['--allow-natives-syntax'], childCode)
const { before, after } = lastJson(res)
console.log(JSON.stringify({ fastBefore: before, fastAfter: after }))
console.log(
  after
    ? 'OK: frozen operator table stays in fast-properties mode (not dictionary)'
    : 'FAIL: freeze normalized the table to dictionary mode'
)

section('2. map events around freeze (--log-maps)')
const logDir = mkdtempSync(join(tmpdir(), 'p4-maps-'))
const logFile = join(logDir, 'v8.log')
const res2 = runNode(
  [
    '--allow-natives-syntax',
    '--log-maps',
    `--logfile=${logFile}`,
    '--no-logfile-per-isolate'
  ],
  childCode
)
lastJson(res2) // ensure child succeeded
let mapLines = []
try {
  mapLines = readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(l => l.startsWith('map,'))
} catch {
  console.log('no v8.log produced — --log-maps unavailable, skipping')
}
if (mapLines.length) {
  const interesting = mapLines.filter(l =>
    /frozen|Normalize|SlowToFast|Object\.freeze|TransitionToFrozen|Freeze/i.test(l)
  )
  console.log(`map events total: ${mapLines.length}; freeze/normalize-related:`)
  console.log(
    interesting
      .slice(0, 10)
      .map(l => '  ' + l.split(',').slice(0, 3).join(',') + ',…,' + (l.split(',').pop() ?? ''))
      .join('\n') || '  (none matched)'
  )
  const normalizeCount = interesting.filter(l => /Normalize/i.test(l)).length
  console.log(`Normalize events: ${normalizeCount}`)
}

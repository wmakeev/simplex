// Fixture corpus registry (measurement-protocol.md §5).
//
// Every `*.mjs` in this directory (except `index.mjs` and `_`-prefixed helpers)
// default-exports one fixture:
//
//   { name, tags, expression, options?, makeData }
//
//   - name       — unique slug (matches the file name).
//   - tags       — category (§5) + granularity ('micro' | 'macro') + optional
//                  markers ('cold', 'throwing', 'mono', 'poly').
//   - expression — the SimplEx source string (never a literal-only expression:
//                  every operand is read from `data` so the compiler cannot
//                  constant-fold it, protocol §10.4).
//   - options    — OPTIONAL, JSON-serialisable declaration of what the fixture
//                  needs from CompileOptions. Functions (stdlib globals /
//                  extensions) are NOT serialisable and never live here; the
//                  fixture declares `{ stdlib: true }` and the consuming side
//                  (worker / parity test) reconstructs the real CompileOptions
//                  via `makeOptions()`. `errorMapper` (only `null` is used) is
//                  serialisable and passes through.
//   - makeData   — deterministic, seeded generator returning JSON-serialisable
//                  data (protocol §10.4). Called with no args; identical output
//                  every time.
//
// The corpus is append-only during an optimisation campaign (protocol §5.1):
// editing an existing fixture's text invalidates every past number for it — add
// a new fixture instead and bump `corpusVersion` when the set changes.

import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createStdlib } from '../../build/src/stdlib/index.js'

// Bump when the fixture set changes (add / deprecate). Goes into every result
// file's fingerprint (protocol §7.2) so results built against different corpora
// are not silently compared (protocol §8.3).
export const corpusVersion = 1

const here = dirname(fileURLToPath(import.meta.url))

const files = readdirSync(here)
  .filter(f => f.endsWith('.mjs') && f !== 'index.mjs' && !f.startsWith('_'))
  .sort()

/** All fixtures, sorted by file name. */
export const fixtures = []
for (const file of files) {
  const mod = await import(pathToFileURL(join(here, file)))
  fixtures.push(mod.default)
}

/**
 * Reconstruct real `CompileOptions` from a fixture's serialisable `options`
 * declaration. This is the bridge over the non-serialisable-options problem:
 * the fixture only ever carries data (`{ stdlib: true }`, `errorMapper: null`);
 * the function-bearing stdlib globals/extensions are materialised here, on the
 * side that actually compiles. Shared by the worker and the parity test so both
 * build identical option objects.
 */
export function makeOptions(fixture) {
  const decl = fixture.options ?? {}
  const options = {}

  if (decl.stdlib) {
    const { globals, extensions } = createStdlib()
    options.globals = globals
    options.extensions = extensions
  }

  // Only `null` is used (protocol §10.11: throwing-path wrapping cost variant).
  if ('errorMapper' in decl) options.errorMapper = decl.errorMapper

  return options
}

/** Materialise a fixture's dataset (deterministic). */
export const getData = fixture => fixture.makeData()

/** Fixtures whose `tags` include every tag in `tags`. */
export const byTags = (...tags) =>
  fixtures.filter(f => tags.every(t => f.tags.includes(t)))

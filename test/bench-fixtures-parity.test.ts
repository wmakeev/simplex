import assert from 'node:assert/strict'
import { suite, test } from 'node:test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compile } from './helpers.js'
import type { CompileOptions } from '../src/compiler.js'

/**
 * Parity gate for the benchmark fixture corpus (measurement-protocol.md §5.2).
 *
 * Every fixture in `bench/fixtures/` must compile and produce the SAME result
 * on both backends — otherwise the benchmarks would be measuring two languages.
 * This test is the synchronisation gate that keeps the corpus honest: it reuses
 * the project's parity `compile` helper, which builds each expression with both
 * `compile()` and `interpret()` and asserts they agree at construction,
 * invocation and thrown errors (type + message).
 *
 * `bench/` is plain ESM outside `tsconfig` and is not compiled by tsc; this test
 * runs from `build/test/`, so the corpus registry is loaded via a dynamic
 * `import()` of an absolute `file://` URL computed relative to the repo root.
 * Options that carry functions (stdlib globals / extensions) are not part of the
 * serialisable fixture — they are reconstructed here through `makeOptions`,
 * exactly as the worker (task 05) will.
 */

interface Fixture {
  name: string
  tags: string[]
  expression: string
  options?: Record<string, unknown>
  makeData: () => unknown
}

type FixtureOptions = CompileOptions<Record<string, unknown>, Record<string, unknown>>

interface Registry {
  fixtures: Fixture[]
  corpusVersion: number
  makeOptions: (fixture: Fixture) => FixtureOptions
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const registryUrl = pathToFileURL(
  resolve(repoRoot, 'bench/fixtures/index.mjs')
).href

const { fixtures, corpusVersion, makeOptions } = (await import(
  registryUrl
)) as Registry

suite(`bench fixture corpus parity (corpusVersion ${corpusVersion})`, () => {
  test('corpus is non-empty and versioned', () => {
    assert.ok(fixtures.length > 0, 'no fixtures found')
    assert.equal(typeof corpusVersion, 'number')
  })

  for (const fixture of fixtures) {
    test(fixture.name, () => {
      assert.ok(fixture.name, 'fixture missing name')
      assert.ok(Array.isArray(fixture.tags) && fixture.tags.length > 0)
      assert.equal(typeof fixture.expression, 'string')

      // The dataset must be JSON-serialisable: the worker receives fixtures
      // through JSON, and data must come from a structure the compiler cannot
      // see (protocol §10.4). A lossless round-trip proves it (no functions,
      // no `undefined` holes that JSON would silently drop).
      const data = fixture.makeData()
      assert.deepStrictEqual(
        JSON.parse(JSON.stringify(data)),
        data,
        `dataset for ${fixture.name} is not JSON-serialisable`
      )

      // Parity `compile` builds BOTH backends and asserts they agree on
      // construction; the returned function asserts result/error parity on
      // invocation.
      const options = makeOptions(fixture)
      const run = compile(fixture.expression, options)
      const input = data as Record<string, unknown>

      if (fixture.tags.includes('throwing')) {
        // Both backends must throw; the parity helper checks type + message.
        assert.throws(() => run(input), `${fixture.name} was expected to throw`)
      } else {
        run(input)
      }
    })
  }
})

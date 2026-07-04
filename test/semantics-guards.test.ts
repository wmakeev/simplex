import assert from 'node:assert/strict'
import { suite, test } from 'node:test'
import { defaultBinaryOperators, CompileError } from '../src/index.js'
import { compile } from './helpers.js'

/**
 * Guard tests for the planned codegen optimizations in
 * `docs/compiler-roadmap.md`. Each case pins observable behavior that a
 * future optimization could silently break:
 *
 * - §9 (inline pipes): `%` captured by a closure must keep the topic value
 *   of its own stage — not read a shared mutable temp at call time.
 * - §12 (let → real JS locals): user binding names that collide with
 *   codegen-internal identifiers must not shadow runtime plumbing.
 * - §4b (static identifier resolution): direct data/globals emission must
 *   preserve hasOwn semantics, unknown-identifier errors, the `undefined`
 *   special case, by-reference globals reads, and the by-reference
 *   globals/data *keyset* (no compile-time global-vs-data classification).
 * - §5 (inline function calls): arguments are evaluated before the callee
 *   null check — a null callee must not skip argument evaluation.
 * - §7 (hoisted `??` temps): nested and re-entrant `??` evaluation must
 *   not clobber a shared temp slot.
 * - §15 (constant folding): folding must not skip validation of dead
 *   branches and must not bypass semantic overrides of the folded ops.
 *
 * All cases run through the parity helper, so both backends are covered.
 */

suite('semantics guards: pipe topic capture (§9)', () => {
  test('lambda capturing % is called in a later stage', () => {
    assert.equal(compile('1 | (() => %) | %()')(), 1)
  })

  test('lambda capturing % is called after the pipe completes', () => {
    assert.equal(compile('let f = (1 | (() => %)), f()')(), 1)
  })

  test('lambda capturing % is invoked within its own stage', () => {
    assert.equal(compile('10 | (() => %)()')(), 10)
  })

  test('nested pipe: escaped lambda keeps the inner topic', () => {
    assert.equal(compile('1 | (10 | (() => %)) | %()')(), 10)
  })

  test('lambda captures outer % from inside a nested pipe stage', () => {
    // Inner pipe reassigns the topic; the lambda made in the inner stage
    // must still see the *inner* topic, while the outer stage sees the
    // outer one.
    assert.equal(compile('1 | (20 | % + 1) + %')(), 22)
  })

  test('curry site capturing % is applied in a later stage', () => {
    const fn = compile('10 | add(#, %) | %(5)', {
      globals: { add: (a: number, b: number) => a + b }
    })
    assert.equal(fn(), 15)
  })

  test('|? short-circuits the whole remaining pipe, captured topics intact', () => {
    // `|?` on null returns from the ENTIRE pipe (later stages, including
    // plain `|`, do not run) — the §9 inline emission must keep that.
    assert.equal(compile('1 | (() => %) | null |? %() | 7')(), null)
    assert.equal(compile('1 | (() => %) |? %()')(), 1)
  })
})

suite('semantics guards: codegen-internal name collisions (§12)', () => {
  test('let binding named "data" does not break free identifier lookup', () => {
    assert.equal(compile('let data = 1, data + a')({ a: 2 }), 3)
  })

  test('let binding named "scope"', () => {
    assert.equal(compile('let scope = 5, scope + a')({ a: 1 }), 6)
  })

  test('let binding named "ctx"', () => {
    assert.equal(compile('let ctx = 2, ctx * a')({ a: 3 }), 6)
  })

  test('let binding named "globals" does not shadow real globals', () => {
    assert.equal(
      compile('let globals = 7, globals + g', { globals: { g: 1 } })(),
      8
    )
  })

  test('lambda param named "params"', () => {
    assert.equal(compile('(params => params + a)(1)')({ a: 2 }), 3)
  })

  test('lambda param named "topic" inside a pipe stage', () => {
    assert.equal(compile('5 | (topic => topic + %)(2)')(), 7)
  })

  test('lambda params named like mangled codegen params (p0, p1)', () => {
    assert.equal(compile('(p0 => p0 + 1)(41)')(), 42)
    assert.equal(compile('((p1, p0) => p0 - p1)(1, 2)')(), 1)
  })

  test('let binding named "_v" (?? temp candidate)', () => {
    assert.equal(compile('let _v = null, _v ?? 5')(), 5)
    assert.equal(compile('let _v = 1, _v ?? 5')(), 1)
  })

  test('let binding named "topic" alongside % in a pipe', () => {
    assert.equal(compile('let topic = 1, (2 | % + topic)')(), 3)
  })
})

suite('semantics guards: identifier resolution (§4b)', () => {
  test('unknown identifier throws', () => {
    const fn = compile('missing')
    assert.throws(() => fn({}), /Unknown identifier - missing/)
  })

  test('inherited data properties are invisible (hasOwn semantics)', () => {
    const fn = compile('inherited')
    const data = Object.create({ inherited: 42 }) as Record<string, unknown>
    assert.throws(() => fn(data), /Unknown identifier - inherited/)
  })

  test('Object.prototype members are not resolvable as identifiers', () => {
    const fn = compile('toString')
    assert.throws(() => fn({}), /Unknown identifier - toString/)
  })

  test('`undefined` resolves to undefined even with an own "undefined" key', () => {
    assert.equal(compile('undefined')({ undefined: 5 }), undefined)
    assert.equal(
      compile('undefined', { globals: { undefined: 5 } })(),
      undefined
    )
  })

  test('globals are read by reference: mutation after compile is visible', () => {
    // Pins today's by-reference semantics. Folding global VALUES at
    // compile time (roadmap §4b) would switch this to snapshot semantics —
    // that must be an explicit, documented decision, not a side effect.
    const globals: Record<string, unknown> = { x: 1 }
    const fn = compile('x', { globals })
    assert.equal(fn(), 1)
    globals['x'] = 2
    assert.equal(fn(), 2)
  })

  test('globals KEY added after compile starts shadowing the data field', () => {
    // The globals/data classification happens per call via Object.hasOwn,
    // not per compile. A compile-time global-vs-data split (raw
    // `data["x"]` lowering) would keep returning the data value here.
    const globals: Record<string, unknown> = {}
    const fn = compile('x', { globals })
    assert.equal(fn({ x: 1 }), 1)
    globals['x'] = 2
    assert.equal(fn({ x: 1 }), 2)
  })

  test('globals KEY deleted after compile falls back to the data field', () => {
    // Inverse case: raw `globals["x"]` lowering would return undefined
    // instead of falling back to data.
    const globals: Record<string, unknown> = { x: 2 }
    const fn = compile('x', { globals })
    assert.equal(fn({ x: 1 }), 2)
    delete globals['x']
    assert.equal(fn({ x: 1 }), 1)
  })
})

suite('semantics guards: call argument evaluation order (§5)', () => {
  test('null callee: non-null assertion in an argument still throws', () => {
    // Arguments are evaluated BEFORE the callee null check. The naive
    // inline emission `_f==null ? undefined : _ensFn(_f)(args)` would
    // silently return undefined here.
    const fn = compile('f(a!)')
    assert.throws(
      () => fn({ f: null, a: null }),
      /Non-null assertion failed: value is null/
    )
  })

  test('null callee: unknown identifier in an argument still throws', () => {
    const fn = compile('f(missing)')
    assert.throws(() => fn({ f: null }), /Unknown identifier - missing/)
  })

  test('null callee: side effects in arguments still run', () => {
    let calls = 0
    const fn = compile('f(g())', {
      globals: {
        g: () => {
          calls++
          return 1
        }
      }
    })
    assert.equal(fn({ f: null }), undefined)
    // The parity helper invokes both backends, so we only assert that the
    // argument was evaluated at least once, not an exact count.
    assert.ok(calls > 0, 'argument side effect must run for a null callee')
  })
})

suite('semantics guards: constant folding gates (§15)', () => {
  test('dead conditional branch is still validated', () => {
    // Folding `if true` must not drop the untaken branch before
    // `validate()` has seen it — the duplicate `let` name below is a
    // compile-time error today and must stay one.
    assert.throws(
      () => compile('if true then 1 else (let a = 1, a = 2, a)'),
      (err: unknown) =>
        err instanceof CompileError &&
        err.message.includes('"a" name defined inside let expression was repeated')
    )
  })

  test('constant arithmetic respects a binaryOperators override', () => {
    // `1 + 2` must evaluate the override, not a folded default result.
    const fn = compile('1 + 2', {
      binaryOperators: { ...defaultBinaryOperators, '+': () => 42 }
    })
    assert.equal(fn(), 42)
  })

  test('constant concatenation respects a binaryOperators override', () => {
    const fn = compile('"a" & "b"', {
      binaryOperators: { ...defaultBinaryOperators, '&': () => 'X' }
    })
    assert.equal(fn(), 'X')
  })

  test('`not` on a constant respects a castToBoolean override', () => {
    const fn = compile('not true', { castToBoolean: () => false })
    assert.equal(fn(), true)
  })

  test('`if` on a constant condition respects a castToBoolean override', () => {
    const fn = compile('if true then 1 else 2', { castToBoolean: () => false })
    assert.equal(fn(), 2)
  })
})

suite('semantics guards: nullish coalescing nesting (§7)', () => {
  test('sibling ?? expressions do not interfere', () => {
    assert.equal(compile('(a ?? 1) + (b ?? 2)')({ a: null, b: null }), 3)
    assert.equal(compile('(a ?? 1) + (b ?? 2)')({ a: 10, b: null }), 12)
  })

  test('nested ?? on the right side', () => {
    assert.equal(compile('a ?? (b ?? 3)')({ a: null, b: null }), 3)
    assert.equal(compile('a ?? (b ?? 3)')({ a: null, b: 2 }), 2)
  })

  test('nested ?? on the left side', () => {
    assert.equal(compile('(a ?? b) ?? c')({ a: null, b: null, c: 5 }), 5)
    assert.equal(compile('(a ?? b) ?? c')({ a: null, b: 4, c: 5 }), 4)
  })

  test('re-entrant ?? through an immediately-invoked lambda', () => {
    assert.equal(compile('null ?? (() => (null ?? 7))()')(), 7)
  })

  test('recursive lambda with ?? in its body', () => {
    const fn = compile(
      'let f = n => if n == 0 then (x ?? 99) else (f(n - 1) ?? -1), f(2)'
    )
    assert.equal(fn({ x: null }), 99)
    assert.equal(fn({ x: 7 }), 7)
  })
})

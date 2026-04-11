# SimplEx Design Decisions

This document captures non-obvious architectural decisions made in the SimplEx compiler — the *why* behind choices that are not self-evident from the code. Each entry records the context, the decision, the alternatives considered, and the trade-offs.

Entries are append-only: once a decision is recorded, update it in place only if the decision itself changes; otherwise leave history intact.

---

## NaN as nullish in `|?` and `??`

**Status:** Implemented.

### Context

Before this change, `|?` (optional pipe) and `??` (nullish coalescing) only checked for `null`/`undefined`. `NaN` slipped through:

- `NaN |? fallback` did not short-circuit — it continued into the pipe step.
- `NaN ?? fallback` returned `NaN` — native JS `??` does not catch NaN.

NaN is a real pitfall in SimplEx because arithmetic that does not go through `ensureNumber` (e.g. `5 mod 0`) still produces it, as do globals and external function results coming from outside the sandbox. Treating NaN as nullish in these two operators makes the "value-is-missing" path do what users expect.

### Decision

Treat NaN as nullish in exactly two places: `defaultPipe` (for `|?`) and the `NullishCoalescingExpression` codegen (for `??`). Everywhere else NaN stays a regular number.

### Scope — intentionally narrow

Other null-safe sites (`obj.prop`, `fn()`, `expr!`) keep their current behavior: they treat NaN as a regular number, consistent with how SimplEx treats NaN as a number value everywhere else in the language. Only `|?` and `??` are semantic "missing value" operators — bending them to catch NaN matches user expectations without changing the identity of NaN elsewhere.

### NaN-check technique: inline `v !== v`

Used `v !== v` (the canonical fast NaN test) rather than `Number.isNaN(v)`:

- No function call on a hot path.
- Works identically in all JS engines and requires no imports/helpers.
- Keeps the generated code compact.

### `??` codegen: inline IIFE, not a context helper

The `NullishCoalescingExpression` visitor emits an inlined IIFE that catches `null`, `undefined`, and `NaN`, while keeping the right operand lazy:

```js
// a ?? b  →
((_v=>_v==null||_v!==_v?(b):_v)(a))
```

Alternatives considered and rejected:

1. **Add `??` to `defaultLogicalOperators` / `ContextHelpers`.** Rejected because `??` has never been overridable in SimplEx — it is not in `defaultBinaryOperators` or `defaultLogicalOperators` today. Adding it would expand the public surface for a semantics-only change.
2. **Introduce a new context helper (e.g. `coalesce`).** Rejected because it would touch `ContextHelpers`, `defaultContextHelpers`, `GEN`, and `bootstrapCodeHead` — a much wider blast radius than the change needs, plus an extra function call hop on every `??` evaluation.
3. **Emit a plain `(L ?? R)` and a wrapping NaN check.** Rejected because it either evaluates `R` eagerly (breaking laziness) or duplicates the `L` expression (breaking referential transparency when `L` has side effects).

The chosen IIFE preserves right-operand laziness via the JS ternary `?:` — `R` is only evaluated when `L` is nullish or NaN. Left is evaluated exactly once (passed as the arrow argument).

### `_v` collision safety

`_v` is the IIFE arrow parameter, scoped to that arrow's body. There is no collision risk because:

- It cannot clash with outer codegen vars — it is a fresh lexical scope.
- Nested `??` (e.g. `a ?? b ?? c`) emits its own arrow, so each `_v` shadows correctly.
- SimplEx user identifiers always go through `get(scope, name)`, never bare `_v`.

### Affected files

- `src/compiler.ts` — `defaultPipe` short-circuit check.
- `src/visitors.ts` — `NullishCoalescingExpression` codegen.

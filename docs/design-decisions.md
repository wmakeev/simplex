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

---

## Eval-free interpreter backend (`interpret`)

**Status:** Implemented.

### Context

`compile()` builds the expression with `new Function()`. That step is blocked under a strict Content Security Policy (no `'unsafe-eval'`) and in several edge/sandboxed runtimes — MV3 browser-extension service workers, Cloudflare Workers, Deno Deploy. Those environments are squarely in SimplEx's target deployment model (edge / sandboxed multi-tenant — see `positioning.md` §2), so a backend that does not need `new Function`/`eval` is worth carrying.

### Decision

Add a second backend: a tree-walking interpreter `interpret()` that evaluates the AST directly, with identical language semantics to `compile()`. It shares the runtime and the compile-time checks with the codegen backend; only the evaluation strategy differs (walk-and-return vs emit-code-and-`new Function`).

### Separate entry point, not re-exported from the root

`interpret()` is reachable only via `simplex-lang/interpret`, NOT re-exported from `src/index.ts`.

**Why:** tree-shaking honesty. The whole point of the eval-free backend is to ship into environments that forbid `new Function`. If `interpret` were re-exported from the root, a bundler pulling in the root module could drag the codegen path (`compiler.ts`, `visitors.ts`, the `new Function` call) into a build that must not contain it. A dedicated entry point guarantees that importing `simplex-lang/interpret` pulls in only `parser`, `constants`, `errors`, `runtime`, `validate` — verified: no `compiler` / `new Function` in the transitive import graph (the `import type CompileOptions` is erased by tsc).

Alternatives rejected:

1. **Single `compile()` with a `backend: 'interpret'` option.** Rejected — a runtime flag cannot tree-shake; the codegen path would always be reachable, defeating the purpose.
2. **Re-export `interpret` from the root.** Rejected for the bundling reason above.

### Shared runtime + shared validation (not duplicated)

Backend-agnostic semantics were extracted into `runtime.ts` (operators, context helpers, `resolveContext`) and compile-time checks into `validate.ts` (duplicate `let` names, `Infinity` computed key, unbound topic). Both backends call them.

**Why:** the failure mode of two backends is silent divergence. Centralizing every piece of semantics that *can* be shared means most changes land in one place and automatically apply to both. What genuinely cannot be shared — emit-code vs return-value — is the only thing each backend implements separately.

### Parity tests as the synchronization mechanism

`test/helpers.ts` exports a parity-`compile` that builds each expression with both backends and asserts identical construction, invocation results, and error type/message. Value-oriented suites run every case through both. This is the structural guarantee that the two backends stay in lockstep: a semantics change applied to only one fails parity.

### No `errorMapper`; errors located from AST nodes

`InterpretOptions = Omit<CompileOptions, 'errorMapper'>`. The codegen backend needs `errorMapper` to translate a V8 stack frame in generated code back to a source offset. The interpreter never generates code — it holds the AST node it is evaluating, so it attributes errors to the source location directly (`errNode` + a single top-level `try/catch` + `locateError`). `errorMapper` is therefore not just unused but meaningless for this backend; omitting it from the type prevents a misleading option.

**Known parity nuance:** inside a pipe body the interpreter can produce a *more precise* error location than codegen (e.g. `x | %.y.z` → interpret `[4,9]`, compile `[0,9]` for the whole pipe). Error type and message match; only the span differs, with interpret being tighter. Accepted as-is — a more precise location is not a regression.

### Performance trade-off

Tree-walking is slower per call than JIT-compiled `new Function` output. `interpret()` is positioned as a **fallback for eval-free environments, not a replacement** for `compile()`. Where `new Function` is available, `compile()` remains the recommended path.

### Affected files

- `src/runtime.ts` — new; extracted shared runtime + `resolveContext`.
- `src/interpreter.ts` — new; `interpret()` + `evalNode()` tree-walker.
- `src/validate.ts` — new; shared static validation pass.
- `src/compiler.ts` — imports shared runtime; calls `validate()` before `traverse()`.
- `src/visitors.ts` — inline validations removed (moved to `validate.ts`).
- `package.json` — `exports` entry `"./interpret"`.
- `test/helpers.ts` — parity-`compile`; `test/interpreter.test.ts` — eval-free-specific cases.

---

## Lambda scope frames are per-invocation locals (issue #30)

**Status:** Implemented (bug fix).

### Context

The codegen backend emitted lambdas as:

```js
((scope,params)=>function(p0){scope=[params,[p0],scope];return BODY})(scope,[...])
```

The generated function **reassigned the closure-captured `scope` variable** on every invocation and never restored it. All invocations of one lambda instance share that single binding, so after a recursive self-call returned, the scope-chain head was a stale frame from the completed recursion. Any `let`-bound recursive lambda with **two or more self-calls in one expression** resolved identifiers against the wrong frame (`fib(10)` → `-80`; a two-base-case variant overflowed the stack). Single-self-call patterns (`n * f(n - 1)`) worked only because JS evaluates operands left-to-right — every read of `n` happened before the recursive call polluted the chain.

The interpreter builds a fresh frame per call (`evalNode(body, [paramNames, args, scope], data)`) and was always correct — a backend divergence the parity suite did not cover (no multi-self-call recursion cases existed).

### Decision

Bind the frame as a fresh per-invocation local instead of mutating the captured variable:

```js
((_scope,params)=>function(p0){var scope=[params,[p0],_scope];return BODY})(scope,[...])
```

Nested emissions inside `BODY` reference `scope` lexically and get the invocation's own frame; nested lambdas capture it correctly (real closure semantics).

`LetExpression` and pipe-stage emissions also reassign a `scope` IIFE parameter, but those IIFEs are invoked once per *evaluation* of the enclosing expression, so the reassignment is local and harmless — reviewed and left unchanged.

### Consequences

- Mutual recursion between sibling `let` bindings now works reliably on both backends (bindings share one frame; lambda bodies resolve names at call time). Documentation previously claimed it was unsupported — corrected in `README.md`, `docs/js-comparison.md`, `docs/agent-guide.md`.
- The multi-branch recursion workaround (binding each self-call with `let` first) is now a stylistic choice, not a requirement.
- Regression suite: `test/recursion.test.ts` (parity — both backends).
- The scope-chain mechanism itself is slated for removal by static scope resolution (`docs/compiler-roadmap.md` §4b); the regression tests must survive that rewrite.

### Affected files

- `src/visitors.ts` — `LambdaExpression` codegen.
- `test/recursion.test.ts` — new regression suite.

# SimplEx Positioning & Development Vector

## Purpose of this document

Captures the strategic position of SimplEx: what problem the language solves, where it sits among alternatives, what distinguishes it, and the direction of future development.

This is a **living, non-exhaustive** document. The language's identity is still being formed — this is one step toward articulating it, not a final word. Entries may be wrong; they should be revised as thinking evolves.

Audience: the author, and AI coding agents working on the project. Both need to understand *why* the language exists and *what it is optimizing for* before proposing features, refactors, or architectural changes.

Complements — does not replace:

- `design-decisions.md` — records specific implementation decisions (append-only log)
- `stdlib.md` — the stdlib API reference
- `alternatives.md` — criterion-by-criterion comparison matrices and side-by-side code samples vs alternative languages
- `compiler-roadmap.md` — detailed cost map of current extensibility indirections and a proposed optimization roadmap

---

## 1. Why the language exists

SimplEx is built first for the author's own ETL-style data pipelines, where a single pipeline run composes dozens of small transformations and each transformation is a user-authored (or LLM-authored) expression.

Stance: **tool-first, community-second.** SimplEx exists to serve the author's products. If others find it useful, that is a welcome bonus, not a design driver. This inverts the usual open-source gravity — feature decisions prioritize fitness for the target pipelines over ecosystem appeal. "Nobody else uses this" is not a concern per se; "it does not fit the pipelines" is.

---

## 2. Target deployment model

SimplEx is designed for **multi-tenant B2B SaaS where tenant isolation is provided by the host platform** (per-invocation lambda, container, or isolated worker), not by the language runtime.

**Host is responsible for:**

- CPU / wall-clock limits (lambda timeout, cgroup)
- Memory limits (container caps)
- Network / filesystem isolation (IAM, security groups)
- Process-level escape prevention (kernel, runtime)

**Language is responsible for:**

- Preventing reachable access to host globals (`process`, `require`, `globalThis`, `fs`)
- Preventing prototype-chain escapes (e.g. `({}).constructor.constructor("return process")()`)
- No `eval` / dynamic code execution paths from within user expressions
- Deterministic, side-effect-free evaluation semantics

Because CPU and memory attacks are the host's problem in the target model, SimplEx does **not** currently implement bounded evaluation (step counters, recursion depth limits, string/array size guards). This is a deliberate scoping choice, not an oversight. Revisitable if the deployment model ever shifts toward in-process multi-tenancy — see §7.

Implication for `globals`: whatever the host puts there is exposed to user code. Host-side contract tests should verify that `globals` never contains anything that reaches `process` / `require` / module internals.

---

## 3. Why an expression DSL at all in the LLM era?

A fair skeptical question, and one the author has repeatedly asked. Three observations push back on "LLMs make language choice irrelevant":

1. **Small, well-defined DSLs are easier for LLMs to generate correctly** than arbitrary JS in a restricted subset. Smaller grammar = less surface for hallucination, and grammar-constrained generation becomes cheap if the inference provider supports it.
2. **Expressions as data.** A SimplEx expression is a string that can be stored, diffed, parsed, analyzed, and rendered in UIs. That matters when pipeline transformations are user-visible artifacts, versioned independently of code.
3. **Expression-language adoption is rising, not falling.** CEL is now the de facto standard for policy evaluation (Kubernetes admission, Envoy, Firebase Rules, Google Cloud IAM). expr-lang dominates Go-based workflow engines (n8n uses its JS port). JSONata sits inside IBM App Connect and Node-RED. LLMs increase the value of such DSLs by lowering the authoring barrier.

The argument that carries real weight is not "LLMs kill DSLs" but "why not adopt an existing DSL?" — addressed in §4.

---

## 4. Comparison to nearest alternatives

Realistic alternatives for an embedded expression language in a Node.js ETL pipeline. For criterion-by-criterion matrices (safety, performance, ergonomics, ecosystem, stdlib) and side-by-side code samples, see `alternatives.md`. The narrative below summarizes.

### Common Expression Language (CEL)

Google-designed; used in IAM, Envoy, Kubernetes admission, Firebase Rules, gRPC. Explicitly designed for safe policy evaluation in multi-tenant systems: **no recursion, no loops, bounded complexity by construction**. Macros (`list.filter(x, cond).map(x, f)`) instead of user-defined lambdas.

JS implementations (all AST-walking interpreters; none compile to native JS):

- **`@marcbachmann/cel-js`** — zero-deps, currently fastest on JS. Published benchmarks on Node 24 / Apple M3: variable lookup ~15.6M ops/sec, arithmetic ~213.8M ops/sec, JWT claims check ~1.75M ops/sec.
- **`cel-js` (ChromeGG)** — Chevrotain-based; ~10–300× slower than `@marcbachmann/cel-js` depending on workload.
- **`@bufbuild/cel` / `cel-es`** — TypeScript, currently beta.

CEL provides what SimplEx does not: cross-runtime portability, a strong public spec, LLM training data, community gravity, and safety-by-construction (bounded complexity as a *language property*, not a host responsibility).

SimplEx provides what CEL lacks: user-defined lambdas, `let` bindings, pipe operator with `%` topic reference, tagged templates, non-null assertion `!`, extension methods via `::`, and a richer stdlib out of the box. incident.io publicly cited CEL's thin built-in set as a reason they moved to JS for their catalog importer — SimplEx's stdlib closes exactly that gap.

### QuickJS-WASM + restricted JS

Embeds a full JS engine in a WASM sandbox (`quickjs-emscripten`). Gives real CPU/memory/stack limits *inside a single Node process*. VM startup ~1–5 ms. LLMs generate JS natively and abundantly.

Trade-off: per-expression overhead is higher than JIT-compiled JS — the VM is an interpreter, and marshaling data across the WASM boundary has a cost. Well-suited when the language must be full JS **and** the host cannot provide isolation. In SimplEx's target model, this would be an unnecessary extra layer on top of existing host isolation.

### Plain JS via `new Function` / vm2 / isolated-vm

`new Function` alone is not escape-safe — the classic `(function(){}).constructor("return process")()` works. `vm2` has a long history of sandbox escapes and is effectively abandoned. `isolated-vm` is viable but heavy (a separate V8 isolate per execution context). None of these is a drop-in "safe expression evaluator" without either trust or a true isolate.

### JSONata, expr-js, JEXL, Filtrex, jq

Each solves a narrower slice (JSON transformation, filter expressions, command-line pipelines). Worth considering when the domain is narrow and matches one of them directly. None adds CPU/memory bounds either — so if host isolation is present, any of them is a candidate; if not, none of them helps.

---

## 5. What distinguishes SimplEx

No single feature defines the language. The identity is the *combination*:

- **Compiles to native JS via `new Function()`.** After one-time compile, expressions execute as JIT-optimized JS — structurally different from AST-walking interpreters. This is the single clearest performance distinction from cel-js / JSONata / expr-js.
- **Null-safe property access and calls by default.** `a.b.c` never throws on missing intermediates; `!` is explicit opt-in for "I assert this is not null". Inverted from JS (which has `?.` opt-in and no explicit `!`) — more practical for expressions over optional data structures.
- **Immutability conventions in stdlib.** `toSorted` / `toReversed` instead of mutating variants; no mutation primitives in the core language. Matches ETL's "functions over data" mental model.
- **Pipes with topic reference.** `x | f(%) | g(%, 2)` reads top-down, composes without nesting, and `|?` short-circuits on null/undefined/NaN. Closes the "long chains read backwards" problem that plain method-chaining has.
- **Extension methods via `::`.** Injects domain-specific method bags without mutating prototypes or polluting globals. Null-safe: `null::method()` → `undefined`.
- **Currying placeholder `#`.** `add(#, 3)` is shorter and clearer than `x => add(x, 3)` in pipe chains.
- **Tagged templates.** Enable domain-specific embedded mini-languages (SQL fragments, URL builders, query DSLs) while keeping interpolation natural.
- **Separate `+` and `&`.** Arithmetic and concatenation do not share an operator — removes a persistent source of accidental string-number coercion bugs.
- **Zero runtime dependencies, TypeScript-native, pluggable `ErrorMapper`.** Fits cleanly into TS projects without bringing in a parser generator runtime or its transitive deps.
- **NaN as nullish in `|?` and `??`.** Narrow, deliberate — matches user intuition about "missing values" without changing NaN identity elsewhere (see `design-decisions.md`).

---

## 6. Development vector

In priority order:

### 6.1 Stability of core semantics over configurability

Historically SimplEx allowed overriding operators, logical helpers, identifier lookup, property access, function calls, and the pipe hook via `CompileOptions.ContextHelpers`. That configurability was premised on *human authors* tailoring the language.

Reality: authors are increasingly LLMs, and configurable semantics are poison for LLMs — the same source text can mean different things under different compile options. Plus: every override point is a runtime indirection that costs performance.

Planned direction: commit to **fixed core semantics** (operators, logical ops, identifier resolution, property access, call semantics, pipe). Keep extensibility only at the **stdlib + `extensions` (`::` method bags) + `globals` + `errorMapper`** layer.

Extensibility removed under this plan (all currently on `ContextHelpers`): `unaryOperators`, `binaryOperators`, `logicalOperators`, `castToBoolean`, `castToString`, `getIdentifierValue`, `getProperty`, `callFunction`, `nonNullAssert`, `pipe`.

### 6.2 Smarter compiler — identifier inlining, drop `bop`/`uop` dispatch

Current generated code for `a + b` is roughly `bop["+"](get(scope, "a"), get(scope, "b"))` — about a dozen indirections per addition. `compiler-roadmap.md` enumerates each and proposes direct-helper calls, static scope resolution, and inline pipes / nullish / function calls.

The **highest-impact single item** is static environment resolution during `traverse()`: classify each `Identifier` node as lambda-param / let-binding / global / data, and emit direct access — eliminating the `_get`/`scope` linked-list walk entirely. This is a structural prerequisite for several other optimizations (pipes as comma sequences, `let` as real `var` locals).

See `compiler-roadmap.md` for the full cost map, per-item impact estimates, and recommended order of attack.

### 6.3 LLM-friendliness as a first-class concern

Because authors are predominantly LLMs (directly or via a user prompting them), design decisions should weigh:

- **Compact, self-contained language spec** (in the style of the current `CLAUDE.md`) — small enough to fit in a system prompt, rich enough that example-driven learning works for any Opus/Sonnet-class model.
- **Machine-readable grammar** (the PEG source) for constrained generation if inference providers expose grammar constraints.
- **Structured parse errors with source locations**, suitable for LLM retry-with-feedback loops.
- **Stable, unambiguous semantics** — the direct benefit of §6.1.

### 6.4 Dogfooding on real pipelines

The clearest test of the language's value is using it in the author's own ETL products and measuring:

- Expression-authoring velocity (human and LLM)
- Error rate and error diagnostics quality
- Per-expression throughput and compile time
- Head-to-head against `@marcbachmann/cel-js` (closest analogue) and QuickJS-WASM-sandboxed TS on the same workload

---

## 7. Non-goals

Stating the things we are explicitly **not** trying to do:

- **Cross-runtime portability.** No Go / Python / Java / Rust implementations planned. TS/JS host only.
- **Beating CEL as a public standard.** Not competing for policy-language mindshare.
- **In-process multi-tenant sandbox with bounded evaluation.** Current model delegates this to the host. Revisitable but not a current investment.
- **Turing-completeness guarantees for static analysis.** SimplEx has user-defined lambdas and is Turing-complete. Termination is a host-isolation concern.
- **Feature parity with full JS.** Expressions only; no statements, no assignment (except `let`), no side effects beyond what extensions deliberately expose.
- **Backward compatibility across breaking redesigns.** The language is pre-1.x in spirit — when a decision improves the target pipelines, it ships even if it breaks existing expressions.

---

## 8. Open questions and research directions

Threads worth pulling. These are prompts for future sessions, not committed work.

### Bounded evaluation without host isolation

If the deployment model expanded to shared-process multi-tenancy (cold-start-sensitive, many tiny invocations, no per-request lambda), the language would need its own CPU / memory / recursion limits. Three mechanisms typically combined:

- **Operation counter** injected during codegen — decrements a budget at each step; throws on exhaustion.
- **Recursion-depth limit** for lambdas.
- **Size guards** in stdlib (`Str.repeat`, `Arr.concat`, template expansions, etc.) rejecting obviously-adversarial inputs.

Plausible future, significant R&D. The operation counter especially needs a careful codegen strategy to not destroy JIT optimization of compiled expressions.

### LLM generation benchmark

Design a repeatable benchmark: N real pipeline expressions with known-correct outputs on fixture data, prompted to a standard model with the SimplEx spec as context. Measure first-shot correctness, retry convergence, and compare against CEL and TS baselines for the same tasks. Would empirically anchor the LLM-friendliness investment in §6.3 instead of leaving it speculative.

### Syntax extensions worth considering

Candidates, none committed:

- **Destructuring in `let` / lambdas**: `let {x, y} = obj, x + y`, `({a, b}) => a + b`.
- **Rest parameters** in lambdas: `(a, ...rest) => ...`.
- **Optional chaining `?.`** — redundant today (since `.` is already null-safe) but LLMs reflexively reach for it. Could be a parse-time synonym for `.`, or a compile error with a helpful message directing to `.`.
- **Pattern-matching expression**: `match expr { ... }` as a cleaner alternative to nested `if`/`else`.
- **Type annotations as hints** (not runtime-enforced): `let x: number = ...` for LLM-directed static checks or IDE tooling.
- **Numeric separators** (`1_000_000`) — trivial.
- **BigInt literal suffix** (`42n`) — likely needed once `bigint` semantics get more attention.
- **Range syntax** (`1..10`) — useful in pipeline filters, needs dedicated parse/runtime design.

Each weighed against "does this help the target pipelines, or grow surface area for no pipeline benefit?"

### Compiler IR between AST and emitted JS

Currently `traverse()` is AST → string codegen directly. Introducing an intermediate representation would make the `compiler-roadmap.md` optimizations (static scope, operator lowering, temp-slot hoisting, pipe-as-comma) composable rather than entangled in visitor code. Worth considering *before* the static-scope pass, because retrofitting an IR later is more painful than adopting it first.

### Pipeline-level compilation

A pipeline of 30 expressions today compiles each independently — parser setup, bootstrap, and generic wrapper are all repeated 30 times. A pipeline-level compiler entry point that shares a bootstrap, interns common sub-expressions, and emits one module with N callable exports would cut compile time substantially and enables cross-expression optimizations (shared temp slots, lifted stdlib references).

### Stdlib philosophy

Stdlib is the primary extension surface — questions worth revisiting periodically:

- How far should it go? incident.io's experience suggests the line is "everything domain-generic users reach for" (trimPrefix, coalesce, date arithmetic, case conversion, path manipulation).
- Should there be a "strict" stdlib (tight types, no coercion) vs a "pragmatic" one?
- Per-function cost of NaN-normalization: worth measuring whether the `|? / ??` NaN-as-nullish convention (see `design-decisions.md`) lets us relax NaN checks inside stdlib functions themselves without surprising users.

### Error messages as an LLM interface

A human consumer of error messages wants "line and column, human sentence". An LLM retry loop wants "structured cause + suggested correction + minimal repro context". These differ. Worth designing a structured error schema alongside the human-readable string — specifically for LLM retry-with-feedback loops.

### When to drop SimplEx for a particular product

Honest self-check. The language is the wrong choice when:

- Cross-runtime evaluation is required → CEL
- Arbitrary full-JS logic is needed → QuickJS-WASM-sandboxed TS
- The pipeline only needs trivial filters → JSONata or a small filter lib
- The deployment model is in-process multi-tenant without host isolation → CEL (bounded) or QuickJS (isolated)

A product decision to pick a different language for a specific use case is not a failure of SimplEx — it is a correct application of the tool-first stance stated in §1.

---

## Maintenance

- This is a **living strategic document**, updated whenever positioning, target deployment, or development direction changes.
- Kept separate from `design-decisions.md` (specific impl decisions) and `compiler-roadmap.md` (performance/compiler roadmap).
- When an "Open question" is resolved, move the answer to the appropriate document (positioning shift → update §1–§7 here; specific design call → add to `design-decisions.md`; compiler change → update `compiler-roadmap.md`).
- AI agents working on the project should read this document before proposing structural changes, to ensure proposed work aligns with the stated development vector.

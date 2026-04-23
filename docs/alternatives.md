# Embedded Expression Language Alternatives

Side-by-side comparison of embedded expression languages and safe code execution environments evaluated as alternatives to SimplEx. Complements the narrative comparison in `positioning.md` §4 with concrete, criterion-by-criterion matrices.

Data reflects state as of this document's last update (see `git log` for the file's history). Specific numbers (ops/sec benchmarks, version status) will drift — treat them as indicative, not authoritative.

## Candidates

| Name | Role | JS implementation evaluated |
|---|---|---|
| **SimplEx** | This project. Expression DSL compiled to native JS via `new Function()`. | — |
| **CEL** | Google's Common Expression Language for policy evaluation. | `@marcbachmann/cel-js` (fastest), `cel-js` (ChromeGG), `@bufbuild/cel` / `cel-es` |
| **QuickJS-WASM** | Full JS engine compiled to WASM, with real CPU/memory limits. | `quickjs-emscripten` |
| **JSONata** | Query/transformation language for JSON, inspired by XPath. | `jsonata` (reference impl, pure JS) |
| **expr-lang** | Expression language popular in Go workflow engines. | `@arnau/expr-eval-js` / ports (JS support less mature than Go) |
| **JEXL** | JS expression language (jexl/liquidjs-style). | `jexl` |
| **JSONata-lite / Filtrex / ...** | Narrower filter-expression libraries. | various |
| **Plain JS** | Evaluated via `new Function`, `vm2`, `isolated-vm`, or `node:vm`. | — |

All matrices below cover the first five candidates; the narrower libraries and plain-JS variants are discussed only in the notes section.

## 1. Safety & isolation

"Safety at the language level" means: assuming the host evaluator does not itself provide isolation, can user-authored expressions reach host primitives or break out of the evaluator?

| Criterion | SimplEx | CEL-js | QuickJS-WASM | JSONata | expr-lang (JS) | Plain JS (`new Function`) | vm2 | isolated-vm |
|---|---|---|---|---|---|---|---|---|
| Parser-gated input (no eval) | yes | yes | yes (VM bytecode) | yes | yes | **no** | yes | yes |
| Prototype-chain access blocked | yes (codegen) | yes | yes (WASM boundary) | yes | yes | **no** | partial (breaks periodically) | yes (isolate) |
| Side-effect-free semantics | yes | yes | depends on globals | yes | yes | no | no | no |
| Built-in CPU / step limit | no (host) | no (host) | **yes** (interrupt handler) | no | no | no | configurable | yes (V8 flags) |
| Built-in memory limit | no (host) | no (host) | **yes** | no | no | no | no | yes |
| Built-in recursion depth limit | no | **yes** (no user recursion) | **yes** (stack limit) | no | no (but limited constructs) | no | no | yes |
| Suitable for in-process untrusted multi-tenant | no | **yes** (bounded by design) | **yes** | no | no | no | no (abandoned) | yes (heavy) |
| Public escape CVE history | none known | none known | none known | none known | none known | by design | many, unfixable | low |

**Summary:** CEL and QuickJS-WASM are the only candidates suitable for *in-process* multi-tenant untrusted evaluation without help from the host. SimplEx, JSONata, expr-lang all delegate CPU/memory bounding to the host platform — a good fit when lambda/container isolation is available.

## 2. Performance

| Criterion | SimplEx | CEL-js (`@marcbachmann`) | QuickJS-WASM | JSONata |
|---|---|---|---|---|
| Evaluator architecture | Codegen → `new Function` (JIT-compiled) | Parsed AST + callable closure (interpreted) | Parsed → bytecode → QuickJS VM | AST walker |
| Per-expression runtime ceiling | ≈ native JS after JIT warmup | AST walk (bounded by closure dispatch) | VM interpreter, ~3–5× slower than native | AST walk |
| Indicative ops/sec, variable lookup (M3, Node 24) | not yet benchmarked | ~15.6M | much lower (VM overhead) | not published |
| Indicative ops/sec, pure arithmetic | not yet benchmarked | ~213M | ~tens of M | not published |
| Startup / compile cost | Peggy parse + `new Function` compile | Hand-written parse + closure build | Parse + bytecode + one-time VM init (1–5 ms) | Parse + AST |
| Per-invocation allocation pressure | current: moderate (scope chain, closures); post–compiler-roadmap: low | low (closure + temp values) | moderate (FFI marshalling) | moderate (AST interpreter state) |
| Runtime bundle size impact | none (zero-dep, codegen as string) | zero-dep (~20 KB) for `@marcbachmann`, Chevrotain adds more | ~300 KB WASM binary | ~140 KB pure JS |

**Summary:** SimplEx has a *structural* performance advantage on expression bodies (JIT-compiled vs. interpreted) but currently leaves much of it on the table due to bop/uop dispatch and scope-chain walks — see `compiler-roadmap.md`. The gap over `@marcbachmann/cel-js` is therefore smaller in practice than in theory until the roadmap optimizations land.

## 3. Authoring ergonomics

| Feature | SimplEx | CEL-js | QuickJS-JS | JSONata | expr-lang (JS) |
|---|---|---|---|---|---|
| Null-safe property access default | yes (`.` is null-safe) | partial (`has()` macro) | no (`?.` opt-in) | yes | yes (`?.`) |
| Non-null assertion | yes (`!`) | no | no (TS level only) | no | no |
| User-defined lambdas | yes | **no** (macros only) | yes | yes (`function($x){...}`) | partial |
| `let` bindings | yes | no | yes | yes (`$var :=`) | no |
| Pipe / topic operator | yes (`\|`, `\|?`, `%`) | no | no | implicit pipe in `.` chain | partial (pipeline syntax) |
| Template literals | yes (incl. tagged) | no | yes | no | no |
| Currying placeholder | yes (`#`) | no | no | no | no |
| Separate arithmetic / string-concat operators | yes (`+` vs `&`) | no | no | no | no |
| Extension methods on values | yes (`::`) | via registered functions | yes (any JS) | via custom functions | via env |
| Custom operators at compile time | yes (today) / no (post-roadmap) | no | — | no | no |
| Immutability enforced in stdlib | yes (`toSorted`, `toReversed`, ...) | N/A | no | yes (pure) | no |
| Reserved-word minimalism | moderate | high (C-like) | low (full JS) | moderate | high |

**Summary:** SimplEx emphasizes authoring ergonomics over portability (pipes, `!`, `#`, tagged templates, `::`). CEL optimizes for safety-by-construction and spec portability, at the cost of user-defined lambdas and most of the ergonomic sugar. QuickJS gives full JS ergonomics but no language-level guardrails.

## 4. Ecosystem & maturity

| Criterion | SimplEx | CEL | QuickJS | JSONata | expr-lang |
|---|---|---|---|---|---|
| Cross-runtime portability | JS/TS only | **Go, Java, C++, Python, JS** | any host with QuickJS | JS only (reference), limited ports | Go primary, JS port secondary |
| Notable production adopters | author's own products | Kubernetes admission, Envoy, Firebase Rules, Google Cloud IAM, gRPC | Figma (plugins), Cloudflare Workers (historical), many embedded | IBM App Connect, Node-RED | n8n (JS port), Argo (Go), Uptrace |
| Public spec | internal (`CLAUDE.md` + grammar) | yes, versioned | ECMAScript subset | yes | yes |
| Community size | none (single-author) | large | medium | medium | growing |
| LLM training-data coverage | low — must be supplied via system prompt | high | high (as JS) | medium | medium |
| Backward-compatibility commitment | none (pre-1.x spirit) | strict (conformance suite) | strict (ES subset) | stable | stable in minors |
| License | repo default | Apache-2.0 | MIT (engine) | MIT | MIT |

**Summary:** CEL wins decisively on ecosystem and cross-runtime reach. SimplEx explicitly does not compete on this axis (see `positioning.md` §7 non-goals).

## 5. Standard-library coverage

Rough qualitative comparison. "Rich" = covers most common needs for the domain; "basic" = requires user extension for typical workloads; "none" = not provided by the language itself.

| Domain | SimplEx (`createStdlib`) | CEL core | JSONata | expr-lang |
|---|---|---|---|---|
| Strings | rich (`Str.*`, 20+ fns) | basic (`contains`, `startsWith`, `endsWith`, `matches`) | rich | rich |
| Numbers & Math | rich (`Num.*`, `Math.*`) | basic arithmetic + conversions | rich | rich |
| Arrays | rich (`Arr.*`, immutable) | macros (`filter`, `map`, `all`, `exists`, `exists_one`, `size`) | rich | filter/map/reduce-ish |
| Objects | rich (`Obj.*`) | `has` only | rich (keys, values, merge, etc.) | basic (keys/values) |
| Dates | present (`Date.*`) | timestamp/duration arithmetic | rich | rich |
| JSON serialization | yes (`Json.*`) | no | implicit (language is JSON-native) | no |
| Regex | via `Str.match` / `Str.replace` | `matches` macro | yes (`$match`) | yes |

**Summary:** This is where CEL's minimalism hurts in practice — incident.io publicly cited implementing `trimPrefix` / `coalesce` themselves as one reason they moved away from CEL. SimplEx's stdlib deliberately covers those domains up front.

## 6. Side-by-side code samples

### Task: filter users aged 18+ and return their names

```text
SimplEx    users | Arr.filter(%, u => u.age >= 18) | Arr.map(%, u => u.name)
CEL        users.filter(u, u.age >= 18).map(u, u.name)
JSONata    users[age >= 18].name
expr-lang  filter(users, .age >= 18) | map(#, .name)
QuickJS    users.filter(u => u.age >= 18).map(u => u.name)
```

### Task: username with fallback, upper-cased

```text
SimplEx    (user.name ?? "Guest") | Str.toUpper(%)
CEL        (has(user.name) ? user.name : "Guest").upperAscii()
JSONata    $uppercase(user.name ? user.name : "Guest")
expr-lang  toUpper(user?.name ?? "Guest")
QuickJS    (user?.name ?? "Guest").toUpperCase()
```

### Task: sum of invoice totals where status == "paid"

```text
SimplEx    invoices | Arr.filter(%, inv => inv.status == "paid") | Arr.sum(Arr.map(%, inv => inv.total))
CEL        invoices.filter(inv, inv.status == "paid").map(inv, inv.total).sum()
JSONata    $sum(invoices[status = "paid"].total)
expr-lang  sum(map(filter(invoices, .status == "paid"), .total))
QuickJS    invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0)
```

Observations:

- JSONata is the most compact for tree-shaped JSON queries but its syntax is a dialect, not a general-purpose one.
- CEL's macros are expressive but limited (no arbitrary lambdas — a lambda is always `x, body` inside one of the fixed macros).
- expr-lang's `#` placeholder mirrors SimplEx's `#` conceptually.
- SimplEx's pipe + topic + `Arr.*` reads top-down; CEL's method-chain reads left-to-right but nests on composition.

## 7. Quick chooser

Match the target deployment and constraints to the recommended candidate:

| If the situation is... | Consider |
|---|---|
| Multi-runtime policy evaluation (same expression runs in Go, Java, JS) | **CEL** |
| In-process untrusted multi-tenant, no host isolation available | **CEL** or **QuickJS-WASM** |
| Host provides isolation (lambda / container / worker) and TS/JS is the only runtime | **SimplEx**, `@marcbachmann/cel-js`, or QuickJS-WASM |
| Authors are LLMs generating many similar expressions, ergonomics matters | **SimplEx** (if spec can be injected) or full JS in QuickJS |
| Query/transform JSON trees, XPath-style ergonomics | **JSONata** |
| Simple user-configurable filter expressions | **JEXL** / **Filtrex** / small filter libs |
| Full JS semantics required, host cannot isolate | **QuickJS-WASM** or **isolated-vm** |
| Full JS semantics required, host isolates per invocation | plain JS via `new Function`, with a safe-globals discipline |
| Authoring velocity + pipe-heavy ETL, TS host, your own products | **SimplEx** |

## 8. Candidate notes

### SimplEx

Designed for the author's own pipelines. Tool-first, community-second (see `positioning.md` §1). Native-JS compilation via `new Function` is the structural distinguisher; current codegen leaves JIT potential unrealized due to bop/uop dispatch and scope-chain walks (see `compiler-roadmap.md`).

### CEL and JS implementations

Three notable JS implementations, with different architecture trade-offs:

- `@marcbachmann/cel-js` — zero-deps, fastest. AST-walker closure; "compiled" marketing, but still interpreter-flavored. Currently the strongest baseline to benchmark SimplEx against.
- `cel-js` (ChromeGG) — Chevrotain-based; slower (~10–300× vs. `@marcbachmann/cel-js`).
- `@bufbuild/cel` (`cel-es`) — TypeScript, beta. Under active development by Buf.

### QuickJS-WASM

`quickjs-emscripten` wraps the QuickJS engine in a WASM sandbox. Configurable memory limit, stack limit, and interrupt handler make it the canonical "safe JS" option when host isolation is not enough. The trade-off is interpreter overhead and FFI marshalling between JS host and WASM guest.

### JSONata

Designed specifically for JSON query/transform. Native JSON pathing, rich stdlib, path predicates. Its syntax is a dialect — the learning investment is not reusable elsewhere. No CPU/memory bounding; relies on host isolation.

### expr-lang

Go-first expression language, widely used in workflow engines (n8n, Argo). JS ports exist but are less mature than the Go original. Competitive ergonomics (pipelines, `#`, null-safety) but smaller ecosystem on the JS side.

### Plain JS via `new Function` / vm2 / `node:vm`

`new Function(code)` alone is not escape-safe (`({}).constructor.constructor("return process")()` is the classic path). `vm2` accumulated multiple unfixable sandbox-escape CVEs and is effectively abandoned. `node:vm` is not a security boundary per Node.js documentation. None of these should be used as a language-level safety layer.

### `isolated-vm`

Real V8 isolate per evaluation context. Actual CPU/memory limits, real isolation. Heavy: each isolate costs tens of MB; startup is measurable. Appropriate when full JS must run untrusted and QuickJS is not enough.

## Maintenance

- Update this document when candidate landscape shifts meaningfully (new entrant, retirement, breaking version, new benchmark data).
- Keep it criterion-first (the matrices), not narrative-first — the narrative version lives in `positioning.md`.
- When in doubt, **measure, don't speculate**: if a performance claim above is contested, the answer is a microbenchmark on representative workloads, not revised prose.

# Rethinking Extensibility vs. Performance

## Premise

SimplEx was originally designed as an extensible language: operators, identifier
lookup, property access, function calling, and pipe semantics can all be
overridden via `CompileOptions`. That flexibility was meant for humans tailoring
the language to their use cases.

Reality check: most expression code is now written by LLM agents. For agents,
predictable, stable, uniform semantics are far more valuable than configurability —
redefined operators introduce ambiguity the agent cannot see from source. The
standard library remains the extensibility story; the core language should be
stable and versioned.

If we commit to fixed core semantics, the compiler can emit much tighter code.
This document surveys the current indirections introduced by extensibility and
proposes inline/specialized alternatives with a performance estimate for each.

> **Update (2026-07-04).** The "proper compiler-plugin mechanism" deferred by
> the closing paragraph has since been designed: see `.research/001-plugins/`.
> The proposals below become the *default lowering*; the override surface
> listed under "extensibility that migrates to plugins" moves to compile-time
> plugins (pay-per-use) instead of disappearing outright. Two rules for
> implementing the items below:
>
> 1. **Every fast emission keeps a slow twin.** Implementing a fast path must
>    not delete the alternative emission form — it becomes the branch for
>    overridden operations (legacy `ContextOptions` during the transition,
>    plugin slots after). Branch granularity differs by phase:
>    - *Legacy phase:* the switch is flipped once per compile — any legacy
>      semantic override selects a whole legacy visitor table (wholesale
>      fallback); no `if`s inside individual visitors.
>    - *Plugin phase:* visitors may branch **per operation** on
>      `resolved.overridden` (`.research/001-plugins/02-plugin-api.md`) —
>      that check runs at compile time only and emits either the direct
>      plugin-slot call or the fast default lowering. No runtime `if`
>      appears in the emitted code, and no per-override-combination
>      visitor tables are generated (that would be combinatorial).
> 2. Items that *remove* public API ship together with the plugin mechanism
>    (deprecation → removal in the next major), not with the performance
>    work. The performance half of this roadmap can land first and alone.

Legend for impact ratings:

- **High** — measurable speedup on most expressions (eliminates per-op function
  calls, allocations, or property lookups that happen in virtually every runtime
  execution).
- **Medium** — meaningful speedup on a subset of expressions (lambdas, pipes,
  let, logical ops) but not every evaluation.
- **Low** — micro-optimization, visible only in tight benchmark loops.

## Current Indirections (map of costs)

The generated code for even the trivial expression `a + b` looks like:

```js
bop["+"](get(scope, "a"), get(scope, "b"))
```

That one line costs, per evaluation:

1. Two property lookups on `bop` (once per op — JITs cache this well, but it
   is still an observable pattern).
2. Two `get()` calls, each of which:
   - Bounces through `_get` (bound to `data`).
   - Calls `Array.prototype.findIndex(it => it === name)` — **allocates a
     fresh closure every call**.
3. For `+`, `bop["+"]` is `numericOp((a,b) => a+b)` — a **double function
   call**: the `numericOp` wrapper plus the inner arrow.
4. Each operand passes through `ensureNumber`, which does `typeof` and
   `Number.isFinite`.

A dozen independent indirections for a single addition. Every one of them
exists because the operator, the lookup, or the numeric guard could, in
principle, be swapped at compile time.

The sections below walk the compiler/visitors layer by layer.

---

## 1. Binary operators — dictionary dispatch + wrapper layers

**Where:** `src/runtime.ts:223-284`, `src/visitors.ts:111-112`.

**Current:**

```js
// visitors.ts
wrapOp(GEN.bop, '+', node, visit(left), visit(right))
// → generates: bop["+"](L, R)
```

And in runtime.ts:

```ts
const numericOp = (fn) => (a, b) => fn(ensureNumber(a), ensureNumber(b))
binaryOperators['+'] = numericOp((a, b) => a + b)
```

**Cost:** per `+`/`-`/`*`/`/`/`mod`/`^`: one dictionary lookup + two nested
function calls + two `ensureNumber` calls. `numericOp` exists purely as a DRY
helper — JITs may not inline the inner arrow through the closure.

**Proposed:** emit direct calls to named runtime helpers imported in the
bootstrap, and fold `numericOp` into each helper. No dictionary, no wrapper:

```js
// Bootstrap:
var _add = ctx.add, _sub = ctx.sub, ...
// Emitted:
_add(L, R)
```

Even better, generate inline code for pure numeric cases:

```js
// For a + b:
(function(){var _l=(L),_r=(R);
  if((typeof _l!=='number'||_l!==_l||_l===Infinity||_l===-Infinity)&&typeof _l!=='bigint')throw ...;
  // same for _r
  return _l+_r;})()
```

That IIFE is still heavier than a helper call because of the throw path, so
the named helper is probably the sweet spot.

**Impact: High.** Arithmetic appears in nearly every expression.

**Special case — equality:** `==` and `!=` are already pure identity checks
with no guards (`(a,b)=>a!==b`). These should be emitted as raw JS:

```js
(L)===(R)   // for ==
(L)!==(R)   // for !=
```

Eliminates a dictionary lookup *and* a function call for the cheapest
operators. **Impact: Medium.**

**Special case — `in`:** currently uses `Object.prototype.toString.call(b)`
with a switch. Fine as-is — the type discrimination is unavoidable.

---

## 2. Unary operators — same story

**Where:** `src/runtime.ts:204-216`, `src/visitors.ts:108-109`.

`-x` compiles to `uop["-"](L)` → `val => -ensureNumber(val)`. Same
dictionary + wrapper issue.

**Proposed:** dedicated helpers (`_neg`, `_pos`, `_not`, `_typeof`) or direct
inline emission for the trivial cases:

```js
!_bool(L)      // for `not x` → already one function call
typeof (L)     // for `typeof x` → zero calls
```

`typeof` as a unary is especially painful today: `uop["typeof"](visit(x))`
wraps the built-in `typeof` behind two function calls and a hashmap lookup.

**Impact: Medium** (unary ops are less common than binary, but `not` is
frequent in conditions).

---

## 3. Logical operators — two thunk allocations per `and`/`or`

**Where:** `src/runtime.ts:296-306`, `src/visitors.ts:114-121`.

**Current:**

```js
// a and b →
lop["and"](()=>(L), ()=>(R))
```

The thunks exist to preserve short-circuit semantics through a function
boundary. This is *genuinely* expensive: **two closures allocated per
evaluation**, plus the dictionary lookup, plus the wrapper call.

**Proposed:** emit native `&&`/`||` with a single `bool()` coercion:

```js
// a and b →  (_bool(L) && _bool(R))
// a or  b →  (_bool(L) || _bool(R))
```

JavaScript already short-circuits natively; the thunks become unnecessary.
Fixed core semantics (always boolean, always short-circuit) make this safe.

**Impact: High.** Every `and`/`or`/`&&`/`||` in user code currently allocates
two closures. Eliminating those is a large win for any expression that uses
boolean logic (which is most of them in conditional code paths).

Plugin note: an override of `and`/`or` keeps the thunk signature
`(l: () => unknown, r: () => unknown)` — short-circuiting is impossible to
implement otherwise. Codegen therefore retains thunk emission as the slow
twin for overridden logical operators; native `&&`/`||` is the default-path
emission only.

---

## 4. Identifier lookup — `_get` walks a linked list

**Where:** `src/compiler.ts:54-63` (bootstrap), `src/runtime.ts:51-67`
(`defaultGetIdentifierValue`).

**Current:**

```js
function _get(_scope, name){
  if(_scope===null) return getIdentifierValue(name, globals, this);
  var paramIndex = _scope[0].findIndex(it => it === name);  // ← closure alloc
  if(paramIndex === -1) return _get.call(this, _scope[2], name);
  return _scope[1][paramIndex];
}
```

Issues:

1. `findIndex(it => it === name)` **allocates a new closure on every lookup**
   just to do an equality check. `indexOf(name)` does the same thing without
   the closure.
2. Scope is a linked list of `[names, values, parent]` tuples. Every lookup
   potentially walks the whole chain, even though at compile time we know
   exactly which frame each identifier lives in.
3. `getIdentifierValue` is pluggable — so the compiler cannot fold
   `globals`/`data` into direct property access at codegen time.

### 4a. Cheap wins (no compiler rewrite)

1. Replace `findIndex(it => it === name)` with `indexOf(name)`. One-line
   change. **Impact: High** — identifier lookup is the single hottest path
   in the runtime, and every call currently allocates a closure.

2. Drop the per-evaluation `_get.bind(data)`. The bootstrap does
   `var get = _get.bind(data)` *inside* the returned `data => {...}` arrow —
   so **every invocation of the compiled function allocates a fresh bound
   function**, even for a trivial expression with one identifier. Fix: give
   `_get` an explicit `data` parameter instead of `this`, and emit
   `get(scope, "x", data)` at each identifier site. Zero per-call
   allocation, no semantics change. **Impact: High, Effort: Trivial** —
   same tier as the `indexOf` fix; do both together.

### 4b. Structural win — static scope resolution

This is the big one, and it is the single biggest performance lever in the
whole project. Today every identifier reference inside a lambda or `let` is
a runtime walk of a scope chain. Because the compiler doesn't track bindings,
it cannot distinguish between `param`, `let-bound`, `global`, and `data`
references — so it emits the generic `get(scope, "x")` for all four.

**Proposed:** during `traverse()`, track an environment. For each
`Identifier` node, classify it:

- **lambda parameter** → emit the mangled JS param name directly (`p0`,
  `p1`, …). Already generated; just reference it.
- **let binding** → emit the mangled JS variable name directly. The let
  codegen can switch from `_varValues.push(init)` to real JS `var`/`let`
  declarations.
- **free (not bound by any enclosing lambda/let/pipe)** → emit
  `_freeGet(globals, data, "x")` — a direct helper call that skips the
  scope-chain walk but re-runs the globals-vs-data classification at
  runtime. Do **not** split free identifiers into `global` / `data`
  classes at compile time by inspecting the keysets — that silently
  snapshots the keyset (see the caveats below).

Two invariants (decided 2026-07-04, see `.plan/2026-07-04-compiler-roadmap-plan/fork-decisions.md`,
fork 4):

- **Static resolution of local bindings is unconditional.** Lambda params,
  `let` bindings and the `%` topic are always emitted as real JS locals — no
  override can affect them (the identifier hook is only ever consulted after
  the local scope misses, by definition).
- **The `_freeGet` fast lowering (and any future snapshot mode) applies
  only when no plugin overrides the identifier hook.** With an override
  present, every *free* identifier lowers to a single direct call of the
  plugin fn; locals stay static regardless.

Design note: the environment pass should bind *pattern → set of names*, not
*parameter → single name* — destructuring in `let`/lambda params is an
accepted candidate (`.research/004-syntax-extensions/`) and will need
exactly that shape.

Three semantics-preservation caveats (pinned by guard tests in
`test/semantics-guards.test.ts`):

- **The globals/data *keyset* is read by reference, not just the values.**
  `defaultGetIdentifierValue` re-checks `Object.hasOwn(globals, name)` and
  then `Object.hasOwn(data, name)` on every call (`src/runtime.ts:51-67`).
  Adding a key to `globals` after `compile()` starts shadowing the
  same-named data field on the next invocation; deleting it falls back to
  data. A compile-time `global`-vs-`data` classification freezes that
  decision at compile time and changes both cases. Hence `_freeGet` above:
  the win is skipping the scope-chain walk, the runtime `hasOwn`
  classification stays. Direct `globals["x"]` / `data["x"]` emission is
  allowed only under an explicit, documented snapshot/frozen-globals mode.
- **Raw `data["x"]` is not equivalent to today's lookup.**
  `defaultGetIdentifierValue` does an `Object.hasOwn` check
  (prototype-pollution safety: inherited properties like `toString` must
  stay invisible), throws `Unknown identifier` on a miss, and special-cases
  the `undefined` identifier (returns `undefined` even when data has an own
  `"undefined"` key). `_freeGet` must keep all three; it is
  `defaultGetIdentifierValue` minus the pluggable indirection, not a raw
  property read.
- **Globals are read by reference today.** Mutating the `globals` object
  after `compile()` is visible to subsequent invocations. Folding global
  *values* into the emitted code silently switches that to snapshot
  semantics — either fold only the lookup (bind the object, read the
  property at runtime) or make snapshotting an explicit, documented
  decision first.

This eliminates:

- The entire `_get` helper for scoped references.
- The scope linked list (`[names, values, parent]`) for lambdas and `let`.
- The closure allocation in `findIndex`.
- All `_varNames`/`_varValues` arrays for `let` (`src/visitors.ts:416-431`).
- All `scope = [params, [p0,p1], scope]` boilerplate inside lambdas
  (`src/visitors.ts:318-322`).

**Impact: Very High** for any expression that uses lambdas or `let`.
Lambdas go from "lookup through a chain on every parameter reference" to
"zero-cost variable access". `let` bindings become true JS locals.

This is also the most involved change: it requires an environment-tracking
pass in `visit`, handling of shadowing, and a decision about how to handle
the `%` topic reference (which is today a lambda-scope-like binding created
by pipes). All of those are tractable — `%` becomes a mangled local
(`_t0`, `_t1` for nested pipes) just like a lambda param.

History note: the runtime scope-chain mechanism this section removes has
already produced one correctness bug — issue #30, where lambda codegen
mutated the closure-captured `scope` variable per invocation, breaking
recursion with multiple self-calls (fixed by binding the frame as a
per-invocation local; see `docs/design-decisions.md`). The regression
suite `test/recursion.test.ts` (fib, mutual recursion, Y combinator, …)
must pass unchanged after the §4b rewrite.

### 4c. Migrate `getIdentifierValue` to a plugin hook

Once globals/data are resolved at compile time, the *default* lowering stops
calling `getIdentifierValue` entirely. The override point does not disappear
— it migrates to a plugin hook (`.research/001-plugins/`): real use cases
exist (case-insensitive field lookup, lazy row proxies, virtual variables,
soft-fail resolution), they just must not tax expressions that don't use
them. **Impact: Low** (cleanup, not a speedup), but simplifies the mental
model.

---

## 5. Function call — wrapper + `apply` with array allocation

**Where:** `src/runtime.ts:139-145`, `src/visitors.ts:212-251`.

**Current:**

```js
// f(a,b,c) →
call(visit(f), [visit(a), visit(b), visit(c)])
// where:
function defaultCallFunction(fn, args){
  return fn==null ? undefined
    : (args===null ? ensureFunction(fn)() : ensureFunction(fn).apply(null, args))
}
```

Costs:

1. A fresh args array allocated per call (even though all elements are
   immediately consumed and then discarded).
2. `apply(null, args)` instead of a direct call.
3. The wrapper itself.

**Proposed:** inline the null-safe call site — but **argument evaluation
order must be preserved**. Today the args array is built *before*
`defaultCallFunction` sees the callee: JS evaluates every argument of
`call(F, [A0, A1, ...])` first, and only then the helper returns
`undefined` for a null callee (the interpreter does the same — callee,
then `args.map(...)`, then `ctx.callFunction`). So `f(a!)` with
`f: null, a: null` throws the non-null assertion *from the argument*, and
`f(missing)` with `f: null` throws `Unknown identifier`. The naive
emission `(_f=(F))==null ? undefined : _ensFn(_f)(A0, A1)` skips argument
evaluation when the callee is null — a silent semantic change (swallowed
argument errors, skipped host-function side effects). The correct
emission evaluates callee and arguments into temp slots in source order:

```js
// f(a,b,c) →
(_f=(visit f), _a0=(visit a), _a1=(visit b), _a2=(visit c),
 _f==null ? undefined : _ensFn(_f)(_a0, _a1, _a2))

// f() → no argument slots needed
((_f=(visit f))==null ? undefined : _ensFn(_f)())
```

No helper, no array, no `apply`. `_ensFn` is a named import of
`ensureFunction` bound into the bootstrap. Because every argument needs a
temp slot, this item **hard-depends on the temp-slot allocator** (see
"Shared infrastructure" below) — it must not land before it. Guard tests
pinning the argument-evaluation order: `test/semantics-guards.test.ts`.

**Impact: High.** Function calls are extremely common (stdlib usage,
chained operations, extensions). Eliminating the args array on every call
is a large allocation reduction.

Currying (`#`) can stay as-is structurally, but should emit the same inline
pattern inside the curried wrapper. Note the current curry emission
`(scope=>(a0)=>call(...))(scope)` allocates two closures per evaluation of
the curry site even when the resulting function is never called; after §4b
the outer scope-capturing IIFE becomes unnecessary.

---

## 6. Property access — dispatcher call for every `a.b`

**Where:** `src/runtime.ts:96-136`, `src/visitors.ts:197-210`.

**Current:** every `a.b`, `a[b]`, and `a::b` compiles to a single
`prop(obj, key, extension)` call, which handles:

- Null-safety (`obj==null → undefined`)
- Extension dispatch (`::`)
- String index access (`"abc"[0]`)
- `hasOwn` check (prototype-pollution-safe)
- Map fallback (`obj.get(key)`)

This is genuinely a lot of logic per call. The uniform handler makes the
generated code small, but each call is a function dispatch with a `switch`
on types.

**Proposed split by form:**

1. **Dot access `a.b`** (static, non-computed, non-extension) — ~95% of
   real usage. Emit inline:

   ```js
   ((_o=(L))==null ? undefined : _propDot(_o, "b"))
   ```

   where `_propDot` is a direct named import that runs the `hasOwn`/`Map`
   logic but without the `extension` branch or `isSimpleValue` key check
   (both unnecessary for static keys). Slightly smaller hot path.

2. **Computed access `a[expr]`** — same, but with a key check.

3. **Extension access `a::method()`** — always goes through the full
   extension dispatcher. No change.

Also notable: the `extension` parameter is threaded through every single
property access today, even when only a tiny fraction use `::`. Splitting
the emission paths removes that parameter from the hot path entirely.

**Impact: Medium.** Property access is very common, but most of the cost
is the actual `hasOwn` check, which we cannot skip without changing
semantics. The win comes from eliminating the dispatcher function call
and the per-call `extension` parameter.

---

## 7. Nullish coalescing — arrow IIFE per evaluation

**Where:** `src/visitors.ts:253-263`.

**Current:**

```js
// a ?? b →
((_v=>_v==null||_v!==_v?(R):_v)(L))
```

A fresh arrow is allocated on every evaluation. V8 usually elides this in
the optimizing tier, but it is not free in the interpreter or baseline tier,
and it bloats the generated code.

**Proposed:** hoist a single temp variable at function level and reuse it
via comma operator, or use a shared non-allocating helper:

```js
// Generated code as a comma expression in an IIFE parameter:
((_v)=>_v==null||_v!==_v?(R):_v)(L)   // current
// vs. helper:
_nc(L, ()=>(R))  // still a thunk — worse
// vs. inline with hoisted temp:
(_v=(L), _v==null||_v!==_v ? (R) : _v)   // needs _v declared at function top
```

The hoisted-temp version needs the code generator to declare temp slots at
the outer function level. That capability is shared infrastructure — see
"Shared infrastructure: temp slots" below; once it exists, this item is
trivial. Note the temp must be unique per nesting depth: nested `??` and
re-entrant evaluation through lambdas must not clobber a single shared
slot (guard tests: `test/semantics-guards.test.ts`).

**Impact: Low.** V8 handles this pattern well.

---

## 8. Non-null assert `!` — wrapper call

**Where:** `src/runtime.ts:148-158`, `src/visitors.ts:194-195`.

**Current:** `nna(visit(x))`.

**Proposed:** inline expansion:

```js
// x! →
((_v=(visit x)),(_v==null ? _throwNNA(_v===null) : _v))
```

where `_throwNNA` is a tiny helper that builds and throws the error.

**Impact: Low.** `!` is uncommon.

---

## 9. Pipe sequences — array of tail descriptor objects

**Where:** `src/runtime.ts:161-178`, `src/visitors.ts:265-296`.

**Current:** a pipe compiles to:

```js
pipe(HEAD, [
  { opt: false, fwd: false, next: (scope=>topic=>{...})(scope) },
  { opt: true,  fwd: false, next: (scope=>topic=>{...})(scope) },
  ...
])
```

Per evaluation of a pipe with N tail elements, this allocates:

- 1 outer array.
- N descriptor objects.
- N `next` closures (with captured scope).
- The `pipe` helper iterates that array with a `for..of` (allocating an
  iterator).

For a pipe that runs on every row of a dataset, this is a lot of garbage.

**Proposed:** emit the pipe as an inline comma expression using a shared
temp. For a pipe `H | S1 | S2 |? S3`:

```js
(_t=(H),
 _t=(S1 using _t as %),
 _t=(S2 using _t as %),
 (_t==null||_t!==_t) ? _t : (_t=(S3 using _t as %)),
 _t)
```

`%` inside each stage is just `_t` — no scope frame needed at all. Only `|`
and `|?` exist in the emission — both with statically known semantics, so
the comma-chain needs no conditional branch per stage kind (see the `|>`
note below).

**Correctness caveat — `%` captured by closures.** A lambda (or curry
site) defined inside a stage may capture `%` and be invoked *later*, after
`_t` has been reassigned by subsequent stages:

```js
1 | (() => %) | %()        // must return 1, not the lambda itself
```

With a single shared `_t`, the escaped lambda would read the temp's
*current* value at call time instead of the topic it closed over. The
emission must therefore bind the topic per stage — e.g. emit each stage as
an arrow taking the topic as a parameter, `(_t => (stage))(prev)` — either
for every stage (one cheap arrow per stage per evaluation, still strictly
better than today's descriptor objects + array + iterator allocation), or
only for stages whose subtree contains a `LambdaExpression` or curry
placeholder with a free `%`. Nested pipes need one distinct binding per
pipe level.

**Correctness caveat — `|?` terminates the whole pipe.** The emission
sketch above guards only the single `|?` stage, but today's `defaultPipe`
*returns from the entire pipe* when `|?` sees `null`/`undefined`/`NaN` —
later stages, including plain `|` ones, do not run
(`a | b |? c | d` with `b` → `null` yields `null`, never reaching `d`).
The inline emission must therefore nest the *remainder* of the chain into
the non-null branch of each `|?` conditional, not just the next stage:

```js
// H | S1 |? S2 | S3 →
(_t=(H), _t=(S1),
 (_t==null||_t!==_t) ? _t : (_t=(S2), _t=(S3), _t))
```

Guard tests pinning both caveats: `test/semantics-guards.test.ts`.

**Prerequisites:**

- Static scope resolution (§4b) so `%` can be a real temp.
- Temp slot hoisting (shared with §7).

**Impact: High** for pipe-heavy code; many stdlib chains will benefit
substantially.

`|>` note (decided 2026-07-04): the reserved `|>` operator is removed from
the language **entirely — grammar included** — in the next major, together
with the legacy `ContextOptions` removal. There is no `pipe` override entry
point to preserve and no plugin hook replacing it (the hook was dropped from
the plugin design). If this section is implemented before the major, the
inline emission temporarily keeps the current runtime-throw branch for `|>`;
the branch is deleted with the grammar. Removal checklist lives in
`.plan/2026-07-04-compiler-roadmap-plan/fork-decisions.md`, fork 1.

---

## 10. `ensureNumber` / `ensureRelationalComparable` — called twice per op

**Where:** `src/tools/index.ts:91-102, 123-138`.

Each numeric binary op calls `ensureNumber` twice; each relational op calls
`ensureRelationalComparable` twice. These are small functions but they run
millions of times in hot loops.

**Proposed:** dedicate per-operator inline helpers that combine the guard
with the operation:

```ts
export function numAdd(a, b) {
  if ((typeof a !== 'number' || !Number.isFinite(a)) && typeof a !== 'bigint') throw ...
  if ((typeof b !== 'number' || !Number.isFinite(b)) && typeof b !== 'bigint') throw ...
  return a + b
}
```

JITs can inline these at the call site, whereas `numericOp((a,b)=>a+b)`'s
inner arrow hides behind a closure. **Impact: Medium.**

House the fused helpers in `runtime.ts` so `interpret()` picks them up
too — the interpreter gets the same win for free, and the parity surface
does not grow (unlike raw inline emission, which makes the operator
semantics exist a second time inside generated code).

Alternative, more aggressive: inline the type check inline in codegen as
discussed in §1. Downside: much larger generated code.

---

## 11. `castToBoolean` for `if` condition and `not`

Already a simple `Boolean(val)`. JS `Boolean(x)` is extremely fast and
already inlined by V8. Could be emitted as `!!(x)` to shave one function
call:

```js
// if a then b →
(!!(visit a) ? (visit b) : undefined)
```

**Impact: Low.**

---

## 12. `let` expression — arrays of names and values

**Where:** `src/visitors.ts:400-433`.

Already covered in §4b: today, `let x=1, y=2, expr` generates two arrays,
pushes names/values, and looks up through `_get`. After static scope
resolution, it becomes:

```js
((_s)=>{
  var x = (init1);     // real JS local
  var y = (init2);
  return (expr);       // `x`/`y` referenced directly, no `get`
})(_s)
```

Or, if we drop the outer scope closure entirely (because we no longer
need the chain at runtime), just a nested block expression via arrow.

**Naming caveat:** once `let` bindings become real JS identifiers, user
names can collide with codegen-internal ones — `data`, `ctx`, `scope`,
`globals`, `params`, `topic`, `p0`, `a0`, `_v` are all valid SimplEx
identifiers (`let data = 1, ...` is legal today and must not shadow the
runtime `data` parameter that free-identifier lookup relies on). Emit
mangled names (`u_x`-style or counter-based), exactly as lambda params
already do (`p0`) — never the raw user name. Guard tests pinning this:
`test/semantics-guards.test.ts`.

**Impact: High** for `let`-heavy expressions.

---

## 13. Logical-op `not` coercion inconsistency

Minor: `not x` emits `!_bool(x)` (good), but the `if` visitor emits
`_bool(x)` without the negation path. Both paths are already direct. OK
as-is.

---

## 14. Error-mapping wrapper

**Where:** `src/compiler.ts:100-116`.

Every compiled expression is wrapped in `try/catch` + `errorMapper.mapError`
unless `errorMapper: null`. The wrapper adds a function-call layer to every
invocation.

This is not really an extensibility cost, but worth noting: users who know
they don't need source-mapped errors (benchmarks, trusted expressions) can
opt out today — but perhaps the default should change for hot-path usage,
or the wrapper should be elided when the expression provably cannot throw.

An alternative to eliding: emit the `try/catch` *inside* the generated
function itself (around the expression body). That removes the extra
call layer while keeping error mapping intact.

**Impact: Low** for normal use; **Medium** for extremely tight loops where
the function call dominates.

---

## 15. Constant folding — absent today

No folding pass exists: `1 + 2`, `"a" & "b"`, `not true`,
`if true then a else b`, and template literals with constant parts all
compile to runtime operator calls. Since most expressions are authored by
LLM agents — which routinely embed constants and self-documenting
intermediate values — an AST-level folding pass before codegen is cheap,
effective, and shrinks the generated code as a bonus.

Rules:

- Fold only subtrees whose evaluation provably does not throw (`1 + "a"`
  must remain a *runtime* error with a source location — folding must not
  move the throw to compile time or change its type/message/location).
- The pass runs on the AST (like `validate()`), shared by both backends,
  so parity is preserved by construction.
- `if true/false then ... else ...` folds to the taken branch; dead
  branches are dropped (they were already validated — see the placement
  rule below).
- **Placement: folding runs strictly after `validate()` on the original
  AST.** The plugin pipeline sketches transforms running before
  validation (`.research/001-plugins/02-plugin-api.md`); folding must
  not follow that placement, or dropping a dead branch would hide
  compile-time errors that `validate()` reports today — e.g.
  `if true then 1 else (let a = 1, a = 2, a)` must keep throwing
  `CompileError` for the duplicate `let` name in the untaken branch.
- **Override gating: fold only operations with default semantics.**
  `1 + 2` under a legacy `binaryOperators` override of `+` (or a plugin
  operator slot) evaluates the override today; folding with the default
  operator would silently change the result. The same applies to
  `castToBoolean` overrides (`not`, `if` conditions, `and`/`or`) and
  `castToString` overrides (`&`, template literals). In the plugin era,
  implement folding as a **core optimization pass** that consults
  `resolved.overridden` — not as an ordinary transform plugin — or give
  the transform context an explicit `canFold(op)` API. During the legacy
  transition, any semantic override in `ContextOptions` disables folding
  for the affected operations (simplest: disables the pass wholesale).

Guard tests pinning the placement and gating rules:
`test/semantics-guards.test.ts`.

**Impact: Medium** (expression-dependent), **Effort: Small–Medium.**
Independent of everything else — can land at any point.

---

## 16. Compile-time performance (out of scope, recorded explicitly)

This roadmap targets evaluation speed. Compile throughput has its own
costs, relevant when many expressions are compiled on the fly:

- `combineVisitResults` (`src/visitors.ts`) builds output via `reduce` +
  string/array concatenation — O(n²) in the number of code parts. A
  push-based accumulator makes it linear.
- Peggy parse dominates compile time for small expressions; nothing to do
  short of a parser swap (non-goal).
- An LRU compile cache keyed by `(expression, options identity)` speeds up
  repeated compiles by orders of magnitude with zero compiler changes.

These are not scheduled; they are listed so the scope cut is explicit.

---

## Shared infrastructure: temp slots (prerequisite for §5–§9)

§5, §6, §7, §8 and §9 each independently assume a temp variable (`_f`,
`_o`, `_v`, `_t`) that today's generator cannot produce: temps must be
*declared* at the enclosing emitted-function level and *named uniquely*
per nesting depth — nested `??`, nested pipes, and lambda bodies each
need their own slot, and a single shared name is clobbered by re-entrant
evaluation (see the §9 correctness caveat). Build this once — a small
allocator in the traverse context that hands out `_v0, _v1, …` per
enclosing emitted function and records which declarations to hoist — and
all five items consume it. Without it, each item grows its own ad-hoc
variant.

---

## Step 0 — benchmark harness (before any of the above)

The repository currently has **no benchmarks**; every Impact rating in
this document is an estimate. Two deserve explicit skepticism: dictionary
lookups (`bop["+"]`) are near-free under V8 inline caches, so §1's win
rests on eliminating the `numericOp` double call, not the dictionary; and
V8 often sinks short-lived closures in the optimizing tier, so allocation
wins should be measured, not assumed. The *safest* bets are the pure
allocation eliminations: §3 thunks, §5 args array, §9 descriptor
objects, §4a `findIndex` closure + `bind(data)`.

Before phase-2 work starts: add a micro+macro benchmark suite (e.g.
`mitata` / `tinybench`) over a fixed set of representative expressions
(arith-heavy, pipe-heavy, lambda-heavy, property-heavy, mixed stdlib),
run per-item before/after, and record the numbers next to each landed
item in this document.

---

## Summary table

| # | Area | Change | Impact | Effort |
|---|---|---|---|---|
| 4a | Identifier lookup | `indexOf` instead of `findIndex(closure)` | High | Trivial |
| 4a | Identifier lookup | drop per-eval `_get.bind(data)`; pass `data` as arg | High | Trivial |
| 3 | Logical ops | Inline `&&`/`\|\|`, drop thunks | High | Small |
| 1 | Binary arith | Named helpers, drop dict + wrapper | High | Small |
| 5 | Function call | Inline null-safe call via temp slots, drop args array (depends on allocator) | High | Small |
| 4b | Scope resolution | Static env pass; direct JS locals | Very High | Large |
| 12 | `let` | Real JS `var` locals (depends on 4b) | High | Medium |
| 9 | Pipes | Inline comma-sequence, drop descriptor array (depends on 4b) | High | Medium |
| 2 | Unary ops | Named helpers, inline `typeof`/`not` | Medium | Small |
| 1 (eq) | `==`/`!=` | Emit raw `===`/`!==` | Medium | Trivial |
| 6 | Property access | Split dot/computed/extension paths | Medium | Medium |
| 10 | Numeric guards | Combine guard + op per helper | Medium | Small |
| 15 | Constant folding | AST-level folding pass before codegen | Medium | Small–Medium |
| — | Temp-slot allocator | shared codegen infra unblocking §5–§9 | — (enabler) | Small |
| 7 | `??` | Hoisted temp via comma | Low | Medium |
| 8 | `!` non-null assert | Inline | Low | Small |
| 11 | `castToBoolean` | Emit `!!x` | Low | Trivial |
| 14 | Error mapping | Elide wrapper when safe, or inline try/catch | Low–Medium | Medium |

## Recommended order of attack

0. **Benchmark harness.** No measurements exist today; establish the
   baseline first (see "Step 0" above) and re-measure after each item.
1. **§4a — `findIndex` → `indexOf` + drop `_get.bind(data)`.** Zero-risk,
   trivial, high impact. Do this today regardless of the larger strategy.
2. **§3 — native `&&`/`||`.** Small surface change, closes a significant
   allocation source.
3. **§1 + §2 — fast default operator lowering.** Emit named-helper calls
   on the default path; detect legacy operator overrides at compile time
   and fall back to the wholesale legacy visitor table + bootstrap (intro
   rule 1). No public API is removed here —
   `binaryOperators`/`unaryOperators`/`logicalOperators` stay in
   `CompileOptions` until the plugin mechanism ships and its deprecation
   window closes (intro rule 2; migration table at the end of this
   document).
4. **Temp-slot allocator + §5 — inline function calls.** The allocator
   built here also unblocks §6–§9. Also removes `callFunction` from
   the override surface.
5. **§4b + §12 + §9 — static scope resolution.** The headline change.
   This is the one feature that actually opens the door to emitting
   JavaScript instead of an interpreter-flavored walker. Requires an
   environment-tracking pass, shadowing logic, and careful test coverage
   for let/lambda/pipe interactions, but the payoff is large and it also
   simplifies the runtime surface enormously.
6. **§15 — constant folding.** Independent of everything else; schedule
   opportunistically at any point.
7. Remaining items as cleanup.

Guard tests for the semantics-preservation caveats called out in §4b, §5,
§7, §9, §12 and §15 live in `test/semantics-guards.test.ts` — they pass
against the current implementation and exist to fail loudly if an
optimization changes observable behavior.

## What to preserve

Extensibility that should **remain**:

- **Standard library** (`createStdlib`) — the stdlib is the extension
  story for users. It is not in the runtime hot path of core operators.
- **`globals` and `extensions`** — data injection and `::` method bags are
  part of the language, not overrides of it.
- **`errorMapper`** — engine-specific concern, must remain pluggable for
  non-V8 environments.

Extensibility that **migrates to compile-time plugins**
(`.research/001-plugins/` — the default lowering stops paying for it;
expressions compiled with a plugin pay per overridden operation):

| Today's option | Plugin surface |
|---|---|
| `unaryOperators`, `binaryOperators` | `plugin.operators.unary` / `.binary` (plain or guarded) |
| `logicalOperators` | `plugin.operators.logical` (thunk signature preserved, see §3) |
| `castToBoolean`, `castToString` | `plugin.helpers.castToBoolean` / `.castToString` |
| `getIdentifierValue` | `plugin.helpers.getIdentifierValue` (see §4b invariants) |
| `getProperty` | `plugin.helpers.getProperty` |
| `callFunction` | `plugin.helpers.callFunction` |
| `nonNullAssert` | `plugin.helpers.nonNullAssert` |

Removed outright, with no plugin replacement (decided 2026-07-04):

- The `pipe` override and the reserved `|>` operator — deleted from the
  language, grammar included, in the next major (see §9 note).

The compiler-plugin mechanism itself is designed in `.research/001-plugins/`
(semantic + transform plugins, mandatory `explain()`, migration path from
`ContextOptions`). The override surface is not dead — it is mispriced: today
every evaluation pays for extensibility nobody asked for. Plugins flip that
to pay-per-use, and the migration path there (fast core → plugins →
deprecation → removal in the next major) is the intended order of work.

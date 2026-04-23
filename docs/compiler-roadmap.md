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

**Where:** `src/compiler.ts:236-297`, `src/visitors.ts:112-113`.

**Current:**

```js
// visitors.ts
wrapOp(GEN.bop, '+', node, visit(left), visit(right))
// → generates: bop["+"](L, R)
```

And in compiler.ts:

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

**Where:** `src/compiler.ts:217-229`, `src/visitors.ts:109-110`.

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

**Where:** `src/compiler.ts:310-316`, `src/visitors.ts:115-122`.

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

---

## 4. Identifier lookup — `_get` walks a linked list

**Where:** `src/compiler.ts:350-356` (bootstrap).

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

Replace `findIndex(it => it === name)` with `indexOf(name)`. One-line change.
**Impact: High** — identifier lookup is the single hottest path in the
runtime, and every call currently allocates a closure.

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
- **global** → emit `globals["x"]` (or even fold static globals at compile
  time when they are known).
- **data field** → emit `data["x"]`.
- **unresolved** → fall back to `getIdentifierValue`, or throw `CompileError`.

This eliminates:

- The entire `_get` helper for scoped references.
- The scope linked list (`[names, values, parent]`) for lambdas and `let`.
- The closure allocation in `findIndex`.
- All `_varNames`/`_varValues` arrays for `let` (`src/visitors.ts:441-459`).
- All `scope = [params, [p0,p1], scope]` boilerplate inside lambdas
  (`src/visitors.ts:330-339`).

**Impact: Very High** for any expression that uses lambdas or `let`.
Lambdas go from "lookup through a chain on every parameter reference" to
"zero-cost variable access". `let` bindings become true JS locals.

This is also the most involved change: it requires an environment-tracking
pass in `visit`, handling of shadowing, and a decision about how to handle
the `%` topic reference (which is today a lambda-scope-like binding created
by pipes). All of those are tractable — `%` becomes a mangled local
(`_t0`, `_t1` for nested pipes) just like a lambda param.

### 4c. Drop `getIdentifierValue` from `ContextHelpers`

Once globals/data are resolved at compile time, `getIdentifierValue` no
longer has to be an override point. Remove from `ContextHelpers`, keep a
private helper. **Impact: Low** (cleanup, not a speedup), but simplifies
the mental model.

---

## 5. Function call — wrapper + `apply` with array allocation

**Where:** `src/compiler.ts:152-158`, `src/visitors.ts:220-259`.

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

**Proposed:** inline the null-safe call site:

```js
// f(a,b,c) →
((_f=(visit f))==null ? undefined : _ensFn(_f)(visit a, visit b, visit c))

// f() →
((_f=(visit f))==null ? undefined : _ensFn(_f)())
```

No helper, no array, no `apply`. `_ensFn` is a named import of
`ensureFunction` bound into the bootstrap.

**Impact: High.** Function calls are extremely common (stdlib usage,
chained operations, extensions). Eliminating the args array on every call
is a large allocation reduction.

Currying (`#`) can stay as-is structurally, but should emit the same inline
pattern inside the curried wrapper.

---

## 6. Property access — dispatcher call for every `a.b`

**Where:** `src/compiler.ts:109-149`, `src/visitors.ts:205-218`.

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

**Where:** `src/visitors.ts:261-271`.

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
the outer function level. Doable but more invasive.

**Impact: Low.** V8 handles this pattern well.

---

## 8. Non-null assert `!` — wrapper call

**Where:** `src/compiler.ts:161-171`, `src/visitors.ts:202-203`.

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

**Where:** `src/compiler.ts:174-191`, `src/visitors.ts:273-301`.

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

`%` inside each stage is just `_t` — no scope frame needed at all. `|>`
raises a `CompileError` at compile time (today it is a runtime throw
inside the helper).

**Prerequisites:**

- Static scope resolution (§4b) so `%` can be a real temp.
- Temp slot hoisting (shared with §7).

**Impact: High** for pipe-heavy code; many stdlib chains will benefit
substantially. This also removes the `pipe` override entry point — fine,
since `|>` is no longer a runtime concept.

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

**Where:** `src/visitors.ts:414-460`.

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

**Impact: High** for `let`-heavy expressions.

---

## 13. Logical-op `not` coercion inconsistency

Minor: `not x` emits `!_bool(x)` (good), but the `if` visitor emits
`_bool(x)` without the negation path. Both paths are already direct. OK
as-is.

---

## 14. Error-mapping wrapper

**Where:** `src/compiler.ts:432-448`.

Every compiled expression is wrapped in `try/catch` + `errorMapper.mapError`
unless `errorMapper: null`. The wrapper adds a function-call layer to every
invocation.

This is not really an extensibility cost, but worth noting: users who know
they don't need source-mapped errors (benchmarks, trusted expressions) can
opt out today — but perhaps the default should change for hot-path usage,
or the wrapper should be elided when the expression provably cannot throw.

**Impact: Low** for normal use; **Medium** for extremely tight loops where
the function call dominates.

---

## Summary table

| # | Area | Change | Impact | Effort |
|---|---|---|---|---|
| 4a | Identifier lookup | `indexOf` instead of `findIndex(closure)` | High | Trivial |
| 3 | Logical ops | Inline `&&`/`\|\|`, drop thunks | High | Small |
| 1 | Binary arith | Named helpers, drop dict + wrapper | High | Small |
| 5 | Function call | Inline null-safe call, drop args array | High | Small |
| 4b | Scope resolution | Static env pass; direct JS locals | Very High | Large |
| 12 | `let` | Real JS `var` locals (depends on 4b) | High | Medium |
| 9 | Pipes | Inline comma-sequence, drop descriptor array (depends on 4b) | High | Medium |
| 2 | Unary ops | Named helpers, inline `typeof`/`not` | Medium | Small |
| 1 (eq) | `==`/`!=` | Emit raw `===`/`!==` | Medium | Trivial |
| 6 | Property access | Split dot/computed/extension paths | Medium | Medium |
| 10 | Numeric guards | Combine guard + op per helper | Medium | Small |
| 7 | `??` | Hoisted temp via comma | Low | Medium |
| 8 | `!` non-null assert | Inline | Low | Small |
| 11 | `castToBoolean` | Emit `!!x` | Low | Trivial |
| 14 | Error mapping | Elide wrapper when safe | Low–Medium | Medium |

## Recommended order of attack

1. **§4a — `findIndex` → `indexOf`.** Zero-risk, trivial, high impact.
   Do this today regardless of the larger strategy.
2. **§3 — native `&&`/`||`.** Small surface change, closes a significant
   allocation source.
3. **§1 + §2 — drop operator dictionaries.** Decide the story for
   `binaryOperators`/`unaryOperators`/`logicalOperators` options. If we
   commit to "no override", we remove them from `CompileOptions`.
4. **§5 — inline function calls.** Also removes `callFunction` from
   the override surface.
5. **§4b + §12 + §9 — static scope resolution.** The headline change.
   This is the one feature that actually opens the door to emitting
   JavaScript instead of an interpreter-flavored walker. Requires an
   environment-tracking pass, shadowing logic, and careful test coverage
   for let/lambda/pipe interactions, but the payoff is large and it also
   simplifies the runtime surface enormously.
6. Remaining items as cleanup.

## What to preserve

Extensibility that should **remain**:

- **Standard library** (`createStdlib`) — the stdlib is the extension
  story for users. It is not in the runtime hot path of core operators.
- **`globals` and `extensions`** — data injection and `::` method bags are
  part of the language, not overrides of it.
- **`errorMapper`** — engine-specific concern, must remain pluggable for
  non-V8 environments.

Extensibility that can be **removed** under this proposal:

- `unaryOperators`, `binaryOperators`, `logicalOperators` overrides.
- `castToBoolean`, `castToString` overrides.
- `getIdentifierValue`, `getProperty`, `callFunction`, `nonNullAssert`,
  `pipe` overrides (the entire `ContextHelpers` interface as an override
  point).
- The `|>` pipe reserved-hook — becomes a compile-time error.

If a future use case genuinely requires changing core semantics, a
proper compiler-plugin mechanism can be designed for it at that point.
Today it is dead configuration surface that costs performance on every
evaluation.

# JavaScript vs SimplEx

SimplEx is **not** a subset of JavaScript. It borrows JavaScript's expression syntax — arrow functions, template literals, `??`, spread — but it is a different language with its own semantics: no statements, no mutation, no host APIs, strict equality only, boolean-only logical operators, and a small curated standard library.

This document compares the two side by side. For each feature it lists the JavaScript form, the SimplEx form (or an explicit "no" with the idiomatic replacement), and a short note. Use it as a translation reference and as a checklist for "is this thing actually here?".

The README's [Like JS, but…](../README.md#like-js-but) section is a short summary of the most painful differences. This document is exhaustive.

---

## Values and operators

| Feature | JavaScript | SimplEx | Note |
|---|---|---|---|
| Number literals | `42`, `.5`, `1.2e3`, `0xFF`, `1n` (bigint) | `42`, `.5`, `1.2e3`, `0xFF` | bigint **literals** are not parsed; bigint values can still flow in via `globals` / `data` |
| String literals | `'a'`, `"b"`, `` `c` `` | `'a'`, `"b"`, `` `c` `` | identical, plus the same escape sequences |
| Boolean / null | `true`, `false`, `null` | `true`, `false`, `null` | reserved words, not identifiers |
| Undefined | `undefined` (global, shadowable) | `undefined` (identifier resolved to `undefined`) | safe — sandbox does not expose the JS `undefined` global, but the identifier always evaluates to the value |
| NaN, Infinity | global identifiers | not global; reachable only as the result of an expression | arithmetic operators reject NaN with a runtime error rather than propagating it |
| Numeric addition | `+` | `+` | rejects non-numbers and NaN at runtime |
| String concatenation | `+` | `&` | `+` is **numbers only**; `&` is a separate operator that coerces any value to a string |
| Subtraction / multiplication / division | `-`, `*`, `/` | `-`, `*`, `/` | numbers only; rejects NaN |
| Remainder | `%` | `mod` | `%` is the topic reference inside pipes |
| Exponentiation | `**` | `^` | right-associative in both languages (`2 ^ 3 ^ 2` → `512`) |
| Bitwise operators | `&`, `\|`, `^`, `~`, `<<`, `>>`, `>>>` | **no** | symbols are taken (`&` is concat, `\|` is pipe, `^` is exponent) |
| Logical NOT | `!x`, `!!x` | `not x` | `!` is the **non-null assert** suffix, not a prefix operator. There is no `!!` |
| Logical AND / OR | `&&`, `\|\|` (return operands) | `and` / `&&`, `or` / `\|\|` (return **boolean**) | both word and symbol forms are accepted; both always coerce the result to boolean |
| Equality | `===`, `!==`, `==`, `!=` | `==`, `!=` only | always strict; `==` never coerces. `null == undefined` is `false` |
| Nullish coalescing | `??` | `??` | SimplEx treats **NaN** as nullish in addition to `null` / `undefined` |
| Conditional | `cond ? a : b` | `if cond then a else b` | only the keyword form; ternary `?:` is not a token |
| Comma operator | `(a, b)` returns `b` | **no** | use `let _ = a, b` if you need to sequence two values |

---

## Data access

| Feature | JavaScript | SimplEx | Note |
|---|---|---|---|
| Property access (dot) | `obj.a` | `obj.a` | own properties only — never walks the prototype chain |
| Property access (bracket) | `obj["a"]`, `arr[0]` | `obj["a"]`, `arr[0]` | own properties only |
| Optional chaining | `obj?.a`, `arr?.[0]`, `fn?.()` | **not needed** — `obj.a` is null-safe by default; `null` / `undefined` short-circuit to `undefined` | inverted from JS: SimplEx is null-safe by default, with explicit `!` to opt out |
| Non-null assert (runtime) | — (TS-only `!` is compile-time) | `expr!` — throws `ExpressionError` if the value is `null`/`undefined` | chainable: `a.b!.c.d!` |
| String character access | `"abc"[0]` works; `"abc".length` works | `"abc"[0]` works; `"abc".length` **errors** | strings expose only numeric indexing through `[ ]`; named methods/properties are reached via the `Str` namespace or `::` extensions |
| `in` operator | walks the prototype chain | **own keys only**; works with arrays (integer indices) and `Map` (keys) | `"toString" in {a:1}` is `false`; `2 in [a,b,c]` is `true`; `"k" in someMap` is `true` |
| `delete` | mutates | **no** | nothing is mutable |
| Property assignment | `obj.x = 1` | **no** | build a new object with spread: `{ ...obj, x: 1 }` |

---

## Control flow

| Feature | JavaScript | SimplEx | Note |
|---|---|---|---|
| `if` statement | `if (c) { … } else { … }` | **no statement form** | only the expression `if c then a else b` |
| `if … then` without `else` | — | yes; missing `else` evaluates to `undefined` | |
| `switch` / `case` | yes | **no** | use chained `if … then … else if … then … else …`, or build a lookup table with an object and `obj[key] ?? defaultBranch` |
| Pattern matching | proposal | **no** | same workaround as `switch` |
| `for`, `for…of`, `for…in`, `while`, `do…while` | yes | **no** | use `Arr.map`, `Arr.filter`, `Arr.fold`, `Arr.flatMap`; loops over an unknown number of iterations are intentionally absent |
| `break` / `continue` / `return` | yes | **no** | every expression evaluates to a value; there is no early exit |
| `try` / `catch` / `finally` | yes | **no** | wrap calls in JS, not in the expression. The host catches `ExpressionError` |
| `throw` | yes | not directly | provide a `fail(msg)` global if you need it; or rely on `expr!` for null assertions |
| Labels, goto-ish | yes | **no** | |

---

## Functions

| Feature | JavaScript | SimplEx | Note |
|---|---|---|---|
| Arrow function | `x => x + 1`, `(a, b) => …`, `() => …` | identical | body is **always a single expression** — `x => { … }` is an object literal, not a block |
| `function` declarations / expressions | `function f() {…}` | **no** | use `let f = (…) => …, …` |
| Methods, classes | `class Foo {}` | **no classes** | values are plain data; behavior comes from globals or extension method bags |
| `this` | dynamic | **no `this`** | lambdas are pure closures over their lexical scope |
| Destructuring parameters | `({ a, b }) => …`, `([x, y]) => …` | **no** | destructure inside the body: `pair => let a = pair[0], b = pair[1], …` |
| Default parameter values | `(x = 5) => …` | **no** | `x => let v = x ?? 5, …` |
| Rest parameters | `(...args) => …` | **no** | accept an array: `args => …` |
| Spread in call sites | `f(...arr)` | **no** | the call must list arguments. For variadic stdlib, use the namespace form (`Math.max(a, b, c)`); to apply over an array, fold: `Arr.fold(arr, (a, b) => Math.max(a, b))` |
| Currying placeholder | — | `#` inside call arguments — `add(#, 3)` is `x => add(x, 3)` | `#` only works inside call arguments; it is not a general-purpose hole |
| Named recursion | yes | yes — a `let` binding whose initializer is a lambda can call itself by name; see the [Recursion](../README.md#recursion) section |
| Mutual recursion | yes | **no** — sibling `let` bindings cannot see each other |
| Generators / `yield` | yes | **no** | |
| async / await, Promise | yes | **no** | every expression is synchronous |
| `new`, constructors | yes | **no** | values are produced by literals and by globals you provide |
| `Function.prototype.call/apply/bind` | yes | **no** | call values directly; partial application via `#` |

---

## Collections

| Feature | JavaScript | SimplEx | Note |
|---|---|---|---|
| Array literal | `[1, 2, 3]`, trailing comma OK | identical | sparse arrays `[1, , 3]` evaluate the hole as `null` |
| Object literal | `{ a: 1, "b-c": 2 }`, trailing comma OK | identical | |
| Shorthand property | `{ x }` ≡ `{ x: x }` | identical | |
| Computed key | `{ [expr]: v }` | identical | |
| Array spread in array | `[...a, ...b]` | identical | |
| Array spread in call | `f(...a)` | **no** (see Functions) |
| Object spread | `{ ...o, x: 1 }` | identical — and the **primary form of object composition** | spread an array into an object literal is rejected (`{ ...arr }` errors) |
| Mutation methods (`push`, `pop`, `splice`, `sort`, `reverse`, `fill`, …) | mutate | **no mutation anywhere**; stdlib equivalents return new arrays (`Arr.sort`, `Arr.reverse`, `Arr.fill`) |
| `Array.from` / `Array.of` | yes | `Arr.from(val)`, `Arr.of(...args)` | |
| Map / Set / WeakMap / WeakSet | yes | not constructible from inside the expression; can be passed in via `globals` / `data` and read with `in` (Map only) and extension methods on `Map` if you register them |
| Iterators, `Symbol.iterator` | yes | **no** | |
| Global `map`, `filter`, etc. | nope (they're array methods) | **no** — and there are no bare-name versions; use `Arr.map(a, fn)` or `a::map(fn)` |

---

## Bindings

| Feature | JavaScript | SimplEx | Note |
|---|---|---|---|
| `var`, `let`, `const` (statements) | yes | **no statements** | use the `let` **expression**: `let x = 5, x + 1` |
| Block scope | `{ … }` | **no blocks** | scope is introduced by `let` and lambda parameters only |
| Reassignment | `x = y` | **no** — bindings are immutable | re-bind with a new `let`: `let x = …, let x = newValue, …` |
| Hoisting | yes | **no** — a name is in scope only after its `let` binding is established (the lambda case is the one exception, see below) |
| Self-reference in a binding | `const x = x + 1` is a TDZ error | identical for non-lambdas (`let x = x + 1, x` errors); **works** when the initializer is a lambda — the name is captured by closure and resolved at call time |
| Mutual recursion | yes | **no** — two sibling `let` bindings cannot reference each other |
| TDZ | yes | not a category — there is no hoisting, so the question doesn't arise |

---

## Composition and chaining

| Feature | JavaScript | SimplEx | Note |
|---|---|---|---|
| Pipe | Stage 2 proposal | `x \| % + 1` — `%` is the topic reference holding the value at each stage |
| Optional pipe | — | `x \|? f(%)` — short-circuits to `null` / `undefined` / `NaN` (passes them through unchanged) |
| Forward pipe `\|>` | — | reserved; throws by default; override `pipe` in compile options to give it semantics |
| Method chains | `arr.filter(…).map(…)` | use the `::` extension operator (`arr::filter(…)::map(…)`) or a pipe (`arr \| Arr.filter(%, …) \| Arr.map(%, …)`) |
| Extension method | — | `obj::method(args)` ≡ `methodBag.method(obj, args)`; null-safe (`null::anything()` → `undefined`) |
| Curry placeholder | — | `f(#, 3)` ≡ `x => f(x, 3)` |
| Function composition | — (no built-in) | not built-in; build with lambdas: `x => g(f(x))` |

---

## Templates and tags

| Feature | JavaScript | SimplEx | Note |
|---|---|---|---|
| Template literal | `` `hi ${x}` `` | identical | result is always a string; values inside `${…}` are coerced via `castToString` |
| Multi-line in template | yes | yes | regular `'…'` / `"…"` strings are **single-line only** — multi-line content must use `` `…` `` |
| Tagged template | `` tag`…` `` | identical | tag is any expression; values are passed **uncoerced**; tag may return any type |
| Regex literal | `/re/g` | **no** | regexes are not in the language; pass a precompiled `RegExp` via `globals` if you really need one |

---

## Modules, host, and runtime

| Feature | JavaScript | SimplEx | Note |
|---|---|---|---|
| `import` / `export` | yes | **no** | values come in via `globals` (compile-time) and `data` (per-call) |
| Built-in globals (`Math`, `JSON`, `Date`, …) | yes | **none of them are in scope by default** — pass `createStdlib()` to make `Math.*`, `Json.*`, `Date.*` available |
| `globalThis`, `window`, `process`, `require`, `eval`, `Function` | yes | **all unreachable** — the expression runs in a sandbox with only the identifiers you supplied |
| `JSON.parse` / `JSON.stringify` | global | `Json.parse(s)`, `Json.stringify(v, replacer?, indent?)` (from stdlib) | name lower-cased to fit the stdlib namespace convention |
| `Date` | full constructor and methods | only `Date.now()`, `Date.parse(s)`, `Date.toString(ts)` | for richer date handling, pass a date library (date-fns, dayjs, Temporal) via `globals` |
| Errors | `Error` and subclasses; `try`/`catch` inside expression | only error values **out** (`ExpressionError`, `CompileError`, `UnexpectedTypeError`); the host catches them |
| Comments | `//`, `/* … */`, JSDoc | `//`, `/* … */` (no JSDoc semantics) |

---

## "Looks similar but isn't"

A handful of forms have a JS counterpart but mean something different in SimplEx. These are the ones most likely to bite:

| Form | In JS | In SimplEx |
|---|---|---|
| `&` | bitwise AND | **string concatenation** with coercion |
| `\|` | bitwise OR | **pipe** |
| `%` | remainder | **topic reference** in a pipe (the operator is `mod`) |
| `^` | bitwise XOR | **exponentiation** |
| `expr!` (TS) | non-null assertion at compile time | non-null assertion **at runtime** (throws if null/undefined) |
| `obj.prop` on `null` | TypeError | `undefined` (null-safe) |
| `1 == "1"` | `true` (with coercion) | `false` (always strict) |
| `[1, , 3]` | a truly sparse array (length 3, hole at index 1) | array `[1, null, 3]` (the hole is materialized as `null`) |
| `typeof null` | `"object"` | `"object"` (matches JS — for a richer classification use the stdlib `typeOf(...)`, which returns `"Null"`, `"Array"`, `"NaN"`, etc.) |
| `1 && 2` | `2` (operands returned) | `true` (always boolean) |
| `x => { a: 1 }` | a function with an empty block and an unreachable label | a function returning the object `{ a: 1 }` |

---

## See also

- [README — Language Reference](../README.md#language-reference) — full syntax and semantics
- [docs/stdlib.md](./stdlib.md) — full standard library reference
- [docs/positioning.md](./positioning.md) — why SimplEx is shaped this way
- [docs/alternatives.md](./alternatives.md) — comparison to CEL, QuickJS-WASM, JSONata, expr-lang, and plain JS

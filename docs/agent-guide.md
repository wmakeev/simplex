# SimplEx — Agent Guide

A single self-contained reference for an agent whose job is to **write SimplEx expressions**.
It describes only the language — the syntax and semantics you need to produce correct
expressions. It does not cover how the host embeds or configures the compiler.

---

## 1. What a SimplEx expression is

A SimplEx program is **one expression that computes a value**. There are no statements, no
assignments (except the `let` *expression*), no loops, no early return, no side effects.

- **JS-like but not JS.** Syntax borrows from JavaScript (arrow functions, template literals,
  `??`, spread, dot/bracket access) but semantics differ: strict equality only, boolean-only
  logical operators, null-safe access by default, no mutation.
- **Sandboxed.** An expression sees only the identifiers made available to it: **globals**
  (constants/functions provided at compile time) and **data** (values passed in at each call).
  Nothing else is reachable — no `globalThis`, `window`, `process`, `Math`, `JSON`, `Date`,
  `eval`, etc., unless it was explicitly provided as a global.

You write the string between the delimiters. Everything below is what may appear inside it.

---

## 2. The 12 differences from JavaScript (memorize these)

These are the mistakes you are most likely to make. Every one is a hard rule.

| # | Concept | JavaScript | SimplEx |
|---|---|---|---|
| 1 | String concatenation | `"a" + "b"` | `"a" & "b"` — `+` is **numbers only** |
| 2 | Conditional | `x ? a : b` | `if x then a else b` — no ternary `?:` |
| 3 | Modulo/remainder | `a % b` | `a mod b` — `%` is the pipe topic reference |
| 4 | Exponentiation | `a ** b` | `a ^ b` (right-associative) |
| 5 | Logical NOT | `!x` | `not x` — `!` is the **non-null assert suffix**, not a prefix |
| 6 | Logical AND/OR | `a && b` returns an operand | `a and b` / `a && b` return a **boolean** |
| 7 | Equality | `==` coerces, `===` strict | `==` / `!=` are **always strict**; loose equality does not exist. `null == undefined` is `false` |
| 8 | Optional chaining | `obj?.prop`, `fn?.()` | not needed — access is **null-safe by default**; `null.x` → `undefined`, `null()` → `undefined` |
| 9 | Non-null assert | TS `!` is compile-time only | `expr!` throws at **runtime** if value is null/undefined |
| 10 | Pipe | Stage-2 proposal | built-in: `x \| % + 1`, `%` is the topic reference |
| 11 | Partial application | — | `fn(#, 3)` — `#` placeholder makes a curried function |
| 12 | `let` | statement | an **expression**: `let x = 5, x + 1` → `6` |

Everything else that *looks* like JS works like JS: arrays, objects, spread, arrow functions,
template literals, tagged templates, `typeof`, `??`, `//` and `/* */` comments.

### "Looks similar but isn't" — the traps

| Form | JS meaning | SimplEx meaning |
|---|---|---|
| `&` | bitwise AND | **string concatenation** (coerces both sides) |
| `\|` | bitwise OR | **pipe** |
| `%` | remainder | **topic reference** inside a pipe (operator is `mod`) |
| `^` | bitwise XOR | **exponentiation** |
| `expr!` | TS compile-time non-null | runtime non-null assert (throws) |
| `obj.prop` on `null` | TypeError | `undefined` (null-safe) |
| `1 == "1"` | `true` | `false` (always strict) |
| `1 && 2` | `2` | `true` (always boolean) |
| `[1, , 3]` | sparse hole | hole materialized as `null` → `[1, null, 3]` |
| `x => { a: 1 }` | fn with a block + label | fn **returning the object** `{ a: 1 }` |

---

## 3. What SimplEx does NOT have

Never generate any of these — they are syntax errors or unsupported:

- **No statements / blocks / `;`.** No `var`/`let`/`const` statements, no `{ … }` code
  blocks. `{ … }` after `=>` is an **object literal**, not a function body.
- **No control-flow statements:** no `for`, `for…of`, `for…in`, `while`, `do…while`,
  `switch`, `break`, `continue`, `return`, `throw`, `try`/`catch`, labels, `goto`.
- **No mutation:** no assignment (`x = 1`), no `obj.x = 1`, no `delete`, no `push`/`pop`/
  `splice`/`sort`/`reverse`/`fill` mutators. Build new values with spread instead.
- **No functions/classes/`this`/`new`:** no `function` declarations, no `class`, no `this`,
  no constructors, no `.call`/`.apply`/`.bind`. Use `let f = (…) => …` and closures.
- **No generators, no `async`/`await`/Promise** — everything is synchronous.
- **No `import`/`export`** — names come only from globals and data.
- **No regex literals** (`/re/g`).
- **No bigint literals** (`1n`), though bigint values may flow in via globals/data.
- **No bitwise operators** — the symbols are reused for other purposes (see traps above).
- **No `NaN`/`Infinity` globals** — only reachable as expression results; arithmetic rejects them.
- **No destructuring, default, or rest parameters** in lambdas (workarounds in §8).
- **No bare-name stdlib** (`map`, `filter`, `toUpperCase`) — only namespaced (`Arr.map`) or `::` extensions.
- **No mutual recursion**, no `switch`, no pattern matching.

---

## 4. Literals

| Kind | Examples |
|---|---|
| Number | `42`, `.5`, `1.2e3`, `0xFF` (integer, decimal, scientific, hex) |
| String | `"hello"`, `'world'` — escapes `\n` `\t` `\uXXXX`; **single-line only** |
| Boolean | `true`, `false` |
| Null | `null` |
| Undefined | `undefined` (an identifier that resolves to the value, not a keyword) |

Multi-line text must use template literals (`` `…` ``), not `'…'`/`"…"`.

---

## 5. Operators (by precedence, highest first)

| Prec | Operators | Notes |
|---|---|---|
| 1 | `+x` `-x` `not x` `typeof x` | Unary. `not` returns a boolean |
| 2 | `^` | Exponentiation, **right-associative** (`2 ^ 3 ^ 2` → `512`) |
| 3 | `*` `/` `mod` | Multiplicative |
| 4 | `+` `-` | Additive — **numbers only** |
| 5 | `&` | String concatenation (coerces both operands to string) |
| 6 | `<` `<=` `>` `>=` `in` | Relational |
| 7 | `==` `!=` | Equality — strict `===`/`!==`, no coercion |
| 8 | `and` `&&` | Logical AND, short-circuit, **returns boolean** |
| 9 | `or` `\|\|` | Logical OR, short-circuit, **returns boolean** |
| 10 | `??` | Nullish coalescing — treats `null`, `undefined`, **and `NaN`** as nullish |
| 11 | `\|` `\|?` `\|>` | Pipe operators |

**Runtime type enforcement (an expression can fail at runtime):**

- Arithmetic (`+` `-` `*` `/` `mod` `^`): operands must be finite numbers; `NaN`/`Infinity`/
  non-numbers are rejected.
- Relational (`<` `>` `<=` `>=`): operands must be numbers or strings.
- `&`: coerces anything to string (`"Count: " & 42` → `"Count: 42"`, `"x" & [1,2,3]` → `"x1,2,3"`).
- `==`/`!=`: strict, no coercion.
- Calling a non-function that is not null/undefined fails.

**`in` operator** checks **own keys only** (never the prototype chain): arrays by integer
index (`2 in [a,b,c]` → `true`), objects by own key (`"toString" in {a:1}` → `false`), Maps by key.

---

## 6. Collections, property access, and spread

**Arrays:** `[1, 2, 3]`, trailing comma OK, sparse `[1, , 3]` → `[1, null, 3]`, spread
`[1, ...other, 4]` (arrays only).

**Objects:**

| Form | Meaning |
|---|---|
| `{ a: 1, "b-c": 2 }` | literal, quoted keys allowed |
| `{ [expr]: v }` | computed key |
| `{ x, y }` | shorthand for `{ x: x, y: y }` |
| `{ ...base, extra: true }` | spread — **the primary form of object composition** |
| `{ ...a, ...b }` | merge (later wins) |

Spreading an array into an object (`{ ...arr }`) is rejected. For known field names prefer
spread; use `Obj.assign` only to merge a *dynamic* number of objects
(e.g. `Arr.fold(objs, Obj.assign, {})`).

**Property access:**

| Form | Meaning |
|---|---|
| `obj.name`, `obj["key"]`, `arr[0]` | dot / bracket / index — **own properties only** |
| `obj.nested.deep` | chaining |
| `null.anything` | `undefined` (null-safe, no error) |
| `expr!` | non-null assert — throws if `null`/`undefined`; chainable `a.b!.c.d!`, `foo!(args)`; no whitespace before `!` |

**Strings** expose only numeric index access via `[ ]` (`"abc"[0]` → `"a"`). Named access
like `"abc".length` **errors** — use the `Str` namespace or `::` extensions instead.

---

## 7. Function calls, extensions (`::`), and currying (`#`)

**Calls:** `min(1, 2)`, `obj.method(x)`, `fn()()` (chaining). Calling `null`/`undefined` as a
function → `undefined` (null-safe). Argument spread `f(...arr)` is **not supported** — list
arguments explicitly.

**Extension methods (`::`):** `obj::method(args)` ≡ `Namespace.method(obj, args)` — the
receiver is passed as the **first argument**. Null-safe: `null::anything()` → `undefined`.
Chainable: `a::f()::g()` ≡ `g(f(a))`.

**Currying with `#`:** a `#` placeholder inside **call arguments** produces a partially applied
function (works only in call arguments, not as a general hole):

| Expression | Equivalent |
|---|---|
| `add(#, 3)` | `x => add(x, 3)` |
| `add(1, #)` | `x => add(1, x)` |
| `mul(#, 2, #)` | `(a, b) => mul(a, 2, b)` |
| `[1,2,3] \| map(%, add(#, 10))` | `[11, 12, 13]` |

---

## 8. Lambdas, `let`, conditionals, and recursion

**Lambdas** are closures capturing the enclosing scope; parameters shadow outer names. The
body is **always one expression**:

```
x => x + 1          (a, b) => a + b          () => 42          a => b => a + b
```

`x => { a: 1 }` returns the **object** `{ a: 1 }` (there is no block form). No destructuring,
default, or rest parameters — workarounds:

| Unsupported | Workaround |
|---|---|
| `({a, b}) => …` | `pair => let a = pair[0], b = pair[1], …` |
| `(x = 5) => …` | `x => let v = x ?? 5, …` |
| `(...args) => …` | pass an array: `args => …` |

**Conditionals** — expression form only:

```
if score >= 90 then "A" else "B"
if active then value            // no else → undefined
```

Falsy: `0`, `""`, `false`, `null`, `undefined`, `NaN`. Everything else is truthy. There is no
`switch` — chain `if … then … else if … then … else …`, or use an object lookup
`obj[key] ?? defaultBranch`.

**`let` expressions** — sequential local bindings; the **last** comma-separated part is the body:

```
let x = 5, x + 1                    // 6
let a = 1, b = a + 1, a + b         // 3  (each init sees previous bindings)
```

Duplicate binding names are an error. Bindings are immutable and not hoisted (a name is in
scope only after its `let`, except the lambda self-reference case below).

**Recursion** — named recursion works when the initializer is a lambda (the name is captured by
closure and resolved at call time):

```
let factorial = n => if n <= 1 then 1 else n * factorial(n - 1),
factorial(5)                        // 120
```

Self-reference works **only for lambdas** (`let x = x + 1, x` errors). Mutual recursion between
sibling bindings works — lambda bodies resolve names at call time, so an earlier binding can
call a later one (initializers still see only previous bindings). Multi-branch recursion
(Fibonacci, tree walks) works directly:

```
let fib = n => if n <= 1 then n else fib(n - 1) + fib(n - 2),
fib(10)                             // 55
```

When no name is available, use the `self(self)` trick
(`let fact = self => n => if n <= 1 then 1 else n * self(self)(n - 1), fact(fact)(5)`). Prefer
named recursion for readability.

---

## 9. Pipes and topic reference `%`

Pipes thread a value through stages; `%` holds the current value at each stage:

| Expression | Result |
|---|---|
| `5 \| % + 1` | `6` |
| `5 \| % * 2 \| % + 1` | `11` |
| `1 \| add(%, 2) \| % * 4` | `12` |
| `value \|? toUpper(%)` | `\|?` short-circuits: if `value` is `null`/`undefined`/`NaN`, returns it unchanged |

- `\|` — standard pipe.
- `\|?` — optional pipe; passes `null`/`undefined`/`NaN` through unchanged without running the stage.
- `\|>` — **reserved**; do not use (throws by default).

**Pipe vs `::`** — both compose values. Use `::` when the operation is naturally a method on the
value (`users::filter(…)::map(…)`); use `|` when you need an arbitrary expression with the topic
reference `%` (a non-method call, or a transform where the value isn't the first argument).

---

## 10. Template literals and tagged templates

```
`Hello ${name}, you have ${count} items`      // interpolation; result is always a string
`Price: ${price * (1 + tax)}`                 // any expression inside ${}
`Nested: ${`inner ${x}`}`                     // nesting allowed
```

Interpolated values are coerced to string. Multi-line content is allowed. A lone `$` without
`{` is literal text. Static parts support the same escapes plus `` \` `` and `\$`.

**Tagged templates:** any expression before a template calls it as a tag —
`` sql`SELECT * FROM ${table}` ``, `` obj.escape`… ${v}` ``. The tag receives
`(strings, ...values)`; interpolated values are passed **uncoerced**; the tag may return any type.

---

## 11. Comments, reserved words, and scope

- Comments: `// single-line`, `/* multi-line or inline */`.
- Reserved words (cannot be identifiers): `if`, `then`, `else`, `and`, `or`, `not`, `in`,
  `mod`, `typeof`, `let`, `true`, `false`, `null`.
- **Identifier resolution order:** local scope (lambda params, `let` bindings) → closure →
  globals → data → error. A `let` binding or lambda parameter shadows any global or data field
  of the same name.

---

## 12. Standard library

When the standard library is available, its functions are reached through a **namespace**
(`Str`, `Num`, `Math`, `Arr`, `Obj`, `Json`, `Date`) or as a `::` extension method. There are
**no bare-name globals** (`map`, `filter`, …); the only three top-level utilities are `empty`,
`exists`, `typeOf`.

**Dual access:** every namespaced function that operates on an instance is also an extension —
`Arr.map(items, fn)` ≡ `items::map(fn)`; `obj::method(args)` ≡ `Namespace.method(obj, args)`.
Extension chaining gives fluent pipelines:
`items::filter(x => x.active)::map(x => x.name)::sort()::join(", ")`.

Static/factory functions are **namespace-only** (not extensions): `Arr.from`, `Arr.of`,
`Obj.fromEntries`, `Obj.assign`, `Num.parseInt`, `Num.parseFloat`, and everything in `Date` and
`Json`.

### Key stdlib conventions

1. **NaN → null.** Any function that would return `NaN` returns `null` instead (`Math.sqrt(-1)`
   → `null`, `Num.parseInt("abc")` → `null`, `Date.parse("bad")` → `null`). Provide defaults
   with `??`: `Math.sqrt(x) ?? 0`.
2. **Immutable.** Array ops return new copies (`Arr.sort`/`Arr.reverse`/`Arr.fill` never mutate;
   `Obj.assign` always returns a new object).
3. **Strict guards throw.** `Str.*`, `Arr.*`, and `Num.toFixed`/`Num.toString` fail on the wrong
   input type (e.g. `Str.toUpperCase(42)`).
4. **No RegExp**, **minimal Date**.

### Top-level utilities

| Function | Returns | Description |
|---|---|---|
| `empty(val)` | boolean | `true` for `null`, `undefined`, `NaN`, `""`, `[]`, `{}`. `false` for `0`, `false` |
| `exists(val)` | boolean | `true` unless `null`/`undefined`/`NaN`. `true` for `0`, `""`, `false` |
| `typeOf(val)` | string | Richer than `typeof`: `"Array"`, `"Object"`, `"Null"`, finite → `"number"`, `NaN` → `"NaN"`, `±Infinity` → `"Infinity"`/`"-Infinity"` |

### Str (fails if first arg is not a string)

`Str.toString(val)` (universal, any type) · `Str.length(s)` · `Str.toUpperCase(s)` ·
`Str.toLowerCase(s)` · `Str.trim(s)` · `Str.trimStart(s)` · `Str.trimEnd(s)` ·
`Str.split(s, sep)` · `Str.includes(s, q)` · `Str.startsWith(s, q)` · `Str.endsWith(s, q)` ·
`Str.slice(s, start, end?)` · `Str.replaceAll(s, from, to)` · `Str.indexOf(s, q)` ·
`Str.padStart(s, len, fill?)` · `Str.padEnd(s, len, fill?)` · `Str.repeat(s, count)` ·
`Str.charAt(s, index)`

### Num

`Num.toString(n, radix?)` (fails if not a number) · `Num.parseInt(s, radix?)` → number|null ·
`Num.parseFloat(s)` → number|null · `Num.isFinite(n)` · `Num.isInteger(n)` · `Num.isNaN(n)` ·
`Num.toFixed(n, digits?)` (fails if not a number)

### Math (most return `null` instead of `NaN`)

`Math.abs` · `Math.round` · `Math.floor` · `Math.ceil` · `Math.trunc` · `Math.sign` ·
`Math.sqrt` (negative → null) · `Math.cbrt` · `Math.pow(base, exp)` · `Math.log` (negative →
null) · `Math.log2` · `Math.log10` · `Math.min(...args)` · `Math.max(...args)` (any non-number
arg → null) · `Math.sin` `Math.cos` `Math.tan` `Math.asin` `Math.acos` `Math.atan` ·
`Math.atan2(y, x)` · `Math.random()` · `Math.clamp(n, min, max)` (fails if `min > max`) ·
constants `Math.PI`, `Math.E`

### Arr (fails if first arg is not an array, except `from`/`of`)

`Arr.toString(a)` · `Arr.length(a)` · `Arr.map(a, fn)` (`fn(value, index, array)`) ·
`Arr.filter(a, fn)` · `Arr.find(a, fn)` · `Arr.findIndex(a, fn)` · `Arr.every(a, fn)` ·
`Arr.some(a, fn)` · `Arr.reduce(a, fn)` (no init — first element is the accumulator) ·
`Arr.fold(a, fn, init)` (reduce with explicit init) · `Arr.reduceRight(a, fn)` ·
`Arr.foldRight(a, fn, init)` · `Arr.flat(a, depth?)` (default 1) · `Arr.flatMap(a, fn)` ·
`Arr.includes(a, val)` · `Arr.indexOf(a, val)` · `Arr.lastIndexOf(a, val)` ·
`Arr.slice(a, start?, end?)` · `Arr.join(a, sep?)` (default `","`) · `Arr.sort(a, fn?)`
(immutable) · `Arr.reverse(a)` (immutable) · `Arr.concat(a, ...arrays)` · `Arr.from(val)` ·
`Arr.of(...args)` · `Arr.fill(a, val, start?, end?)` (immutable) · `Arr.at(a, index)`
(negative indices OK)

### Obj (plain objects)

`Obj.toString(o)` · `Obj.keys(o)` · `Obj.values(o)` · `Obj.entries(o)` ·
`Obj.fromEntries(entries)` · `Obj.assign(...objs)` (immutable — new object) · `Obj.has(o, key)`

### Json

`Json.parse(s)` (throws on invalid JSON) · `Json.stringify(val, replacer?, indent?)` (replacer:
function `(key, value) => …` or an array of key strings)

### Date (minimal)

`Date.now()` (ms timestamp) · `Date.parse(s)` → number|null · `Date.toString(ts)` → ISO string | null

---

## 13. Canonical example

A mid-sized expression showing the common idioms — `let`, lambdas, `::`, pipe with `%`, spread,
and stdlib in both styles. Given data `users` (an array of `{ firstName, lastName, enabled }`):

```
let visible = users::filter(u => u.enabled),
    formatted = visible::map(u => {
      ...u,
      fullName: u.firstName & " " & u.lastName
    }),
formatted
  | Arr.map(%, u => u.fullName)
  | Arr.join(%, ", ")
```

For the three users Ada Lovelace (enabled), Alan Turing (disabled), Bob Smith (enabled) this
yields `"Ada Lovelace, Bob Smith"`.

Notes: `let` introduces bindings and the **last** part is the body; `users::filter(...)` ≡
`Arr.filter(users, ...)`; `u => { ...u, fullName: ... }` returns an **object literal**; `|`
threads the value with `%` at each stage; `&` concatenates strings while `+` is numeric only.

---

## 14. Checklist before emitting a SimplEx expression

- [ ] Concatenating strings? Use `&`, never `+`.
- [ ] Conditional? Use `if … then … else …`, never `? :`.
- [ ] Remainder? Use `mod`. Power? Use `^`. NOT? Use `not`.
- [ ] Comparing values? Only `==`/`!=` (strict) exist — no coercion.
- [ ] Need a loop? There are none — use `Arr.map`/`filter`/`fold`/`flatMap` or recursion.
- [ ] Mutating? Impossible — build new values with spread `{ ...o, x: 1 }` / `[...a, x]`.
- [ ] Calling stdlib? Use the namespace (`Arr.map`) or `::` — never a bare `map`.
- [ ] Lambda body with `{}`? That is an object literal, and the body is one expression.
- [ ] Property on maybe-null? It is already null-safe; add `!` only to *assert* non-null.
- [ ] `%` only means the pipe topic; you never write `a % b`.
```

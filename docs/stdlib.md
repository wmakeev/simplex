# SimplEx Standard Library

The standard library provides a curated set of safe, sandboxed functions for use in SimplEx expressions. Import it from `simplex-lang/stdlib`:

```typescript
import { createStdlib } from 'simplex-lang/stdlib'

const { globals, extensions } = createStdlib()

// Namespace style
compile('Math.abs(x)', { globals })({ x: -5 })  // 5

// Extension style
compile('x::abs()', { globals, extensions })({ x: -5 })  // 5

// Merge with custom globals
compile('double(Math.abs(x))', {
  globals: { ...globals, double: (n: number) => n * 2 }
})({ x: -5 })  // 10
```

> **Every stdlib function is accessed via its namespace** (`Str`, `Num`, `Math`, `Arr`, `Obj`, `Json`, `Date`) or via an extension method (`x::toUpperCase()`). There are **no** bare-name globals like `map`, `filter`, `toUpperCase`. The three exceptions — `empty`, `exists`, `typeOf` — are explicitly documented as top-level utilities.

## Key Differences from JavaScript

### 1. NaN never exists in stdlib output

All stdlib functions that would produce `NaN` in JavaScript return `null` instead.

| Example | JS result | SimplEx result |
|---|---|---|
| `Math.sqrt(-1)` | `NaN` | `null` |
| `Num.parseInt("abc")` | `NaN` | `null` |
| `Date.parse("bad")` | `NaN` | `null` |

SimplEx already has null-safe infrastructure (`??`, `|?`, null-safe property access), so `null` is the natural "no meaningful value" representation. Use `??` to provide defaults:

```
Math.sqrt(x) ?? 0
Num.parseInt(s) ?? -1
```

> **Note:** SimplEx arithmetic operators (`+`, `-`, `*`, `/`) independently reject NaN via `ensureNumber`. The NaN→null convention applies to **stdlib function output** specifically.

### 2. All operations are immutable

Array functions that mutate in JavaScript return new copies in SimplEx:

| SimplEx | JavaScript equivalent | JS behavior |
|---|---|---|
| `Arr.sort(a)` | `a.toSorted()` | `a.sort()` mutates `a` |
| `Arr.reverse(a)` | `a.toReversed()` | `a.reverse()` mutates `a` |
| `Arr.fill(a, v)` | `[...a].fill(v)` | `a.fill(v)` mutates `a` |
| `Obj.assign(a, b)` | `Object.assign({}, a, b)` | `Object.assign(a, b)` mutates `a` |

The original data is never modified.

### 3. Type guards throw on wrong input type

Functions that would produce a `TypeError` from JavaScript (calling a string method on a number, etc.) throw `UnexpectedTypeError` with a clear message instead:

| Lang | Expression | Error message |
|---|---|---|
| JS | `(42).toUpperCase()` | `TypeError: n.toUpperCase is not a function` |
| SimplEx | `Str.toUpperCase(42)` | `UnexpectedTypeError: Expected string, but got number instead` |

This applies to all `Str.*` functions (guard: must be string), all `Arr.*` functions (guard: must be Array), and `Num.toFixed` (guard: must be number).

### 4. Functions are standalone, not methods

All functions take the subject as the first argument instead of being called as methods:

| JS style | SimplEx namespace style | SimplEx extension style |
|---|---|---|
| `"hello".toUpperCase()` | `Str.toUpperCase("hello")` | `"hello"::toUpperCase()` |
| `[3,1,2].sort()` | `Arr.sort([3, 1, 2])` | `[3, 1, 2]::sort()` |
| `JSON.parse(s)` | `Json.parse(s)` | — |

### 5. No RegExp

RegExp is excluded from stdlib due to ReDoS risk and runtime string compilation concerns. Users can pass pre-compiled RegExp objects via custom globals if needed.

### 6. Minimal Date

Only `Date.now()` and `Date.parse(s)` are provided. For extended date handling, pass a date library (date-fns, dayjs, Temporal) via custom globals.

## Dual Access: Namespaces and Extensions

Every namespaced function is available in two equivalent styles:

| Namespace style (explicit) | Extension style (chainable) |
|---|---|
| `Arr.map(items, x => x.name)` | `items::map(x => x.name)` |
| `Str.includes(title, "hello")` | `title::includes("hello")` |
| `Obj.keys(config)` | `config::keys()` |

Extension chaining enables fluent pipelines:

```
items::filter(x => x.active)::map(x => x.name)::sort()::join(", ")
```

Both styles call the same underlying function. The extension `obj::method(args)` is equivalent to `Namespace.method(obj, args)`.

### Extension type mapping

| Namespace | Extension type key | Applies to |
|---|---|---|
| `Str` | `"string"` | String values (all methods) |
| `Num` | `"number"` | Number values (`toString`, `isFinite`, `isInteger`, `isNaN`, `toFixed`) |
| `Arr` | `Array` | Array instances (all except `from`, `of`) |
| `Obj` | `Object` | Plain objects (`keys`, `values`, `entries`, `has`) |

Static/factory functions like `Arr.from`, `Arr.of`, `Obj.fromEntries`, `Obj.assign`, `Num.parseInt`, `Num.parseFloat` are only available via namespace style — they don't operate on an existing instance and are not registered as extensions. The same applies to `Date` and `Json` namespaces which are namespace-only (no extensions).

## Namespaces

### Top-Level Utilities

Not namespaced — available directly in expressions.

| Function | Returns | Description |
|---|---|---|
| `empty(val)` | `boolean` | `true` for `null`, `undefined`, `NaN`, `""`, `[]`, `{}` (own enumerable keys). `false` for `0`, `false`. |
| `exists(val)` | `boolean` | `true` if not `null`, `undefined`, or `NaN`. `true` for `0`, `""`, `false`. |
| `typeOf(val)` | `string` | Uses `typeof` for primitives, `Object.prototype.toString` for objects (e.g. `"Array"`, `"Object"`, `"Null"`). Numbers are split: finite → `"number"`, `NaN` → `"NaN"`, `±Infinity` → `"Infinity"` / `"-Infinity"`. |

> **`empty` vs JS truthiness:** `empty(0)` is `false` (0 is not empty, it's a value). `empty("")` is `true` (empty string). This differs from JS where both `!0` and `!""` are `true`.

### Str

String functions. All throw `UnexpectedTypeError` if the first argument is not a string.

| Function | JS Equivalent |
|---|---|
| `Str.toString(val)` | `String(val)` — universal converter, accepts any type |
| `Str.length(s)` | `s.length` |
| `Str.toUpperCase(s)` | `s.toUpperCase()` |
| `Str.toLowerCase(s)` | `s.toLowerCase()` |
| `Str.trim(s)` | `s.trim()` |
| `Str.trimStart(s)` | `s.trimStart()` |
| `Str.trimEnd(s)` | `s.trimEnd()` |
| `Str.split(s, sep)` | `s.split(sep)` |
| `Str.includes(s, query)` | `s.includes(query)` |
| `Str.startsWith(s, query)` | `s.startsWith(query)` |
| `Str.endsWith(s, query)` | `s.endsWith(query)` |
| `Str.slice(s, start, end?)` | `s.slice(start, end)` |
| `Str.replaceAll(s, from, to)` | `s.replaceAll(from, to)` |
| `Str.indexOf(s, query)` | `s.indexOf(query)` |
| `Str.padStart(s, len, fill?)` | `s.padStart(len, fill)` |
| `Str.padEnd(s, len, fill?)` | `s.padEnd(len, fill)` |
| `Str.repeat(s, count)` | `s.repeat(count)` |
| `Str.charAt(s, index)` | `s[index]` |

### Num

Number functions.

| Function | Returns | Notes |
|---|---|---|
| `Num.toString(n, radix?)` | `string` | `n.toString(radix)`. Throws `UnexpectedTypeError` if not a number |
| `Num.parseInt(s, radix?)` | `number \| null` | |
| `Num.parseFloat(s)` | `number \| null` | |
| `Num.isFinite(n)` | `boolean` | Same as `Number.isFinite` |
| `Num.isInteger(n)` | `boolean` | Same as `Number.isInteger` |
| `Num.isNaN(n)` | `boolean` | Same as `Number.isNaN` |
| `Num.toFixed(n, digits?)` | `string` | Throws `UnexpectedTypeError` if `n` is not a number |

### Math

Mathematical functions and constants. Most return `null` instead of `NaN` for invalid input.

| Function | Returns | Notes |
|---|---|---|
| `Math.abs(n)` | `number \| null` | |
| `Math.round(n)` | `number \| null` | |
| `Math.floor(n)` | `number \| null` | |
| `Math.ceil(n)` | `number \| null` | |
| `Math.trunc(n)` | `number \| null` | |
| `Math.sign(n)` | `number \| null` | |
| `Math.sqrt(n)` | `number \| null` | Negative input returns `null` |
| `Math.cbrt(n)` | `number \| null` | |
| `Math.pow(base, exp)` | `number \| null` | |
| `Math.log(n)` | `number \| null` | Negative input returns `null` |
| `Math.log2(n)` | `number \| null` | |
| `Math.log10(n)` | `number \| null` | |
| `Math.min(...args)` | `number \| null` | Any non-number arg returns `null` |
| `Math.max(...args)` | `number \| null` | Any non-number arg returns `null` |
| `Math.sin(n)` | `number \| null` | |
| `Math.cos(n)` | `number \| null` | |
| `Math.tan(n)` | `number \| null` | |
| `Math.asin(n)` | `number \| null` | |
| `Math.acos(n)` | `number \| null` | |
| `Math.atan(n)` | `number \| null` | |
| `Math.atan2(y, x)` | `number \| null` | |
| `Math.random()` | `number` | Same as `Math.random()` |
| `Math.clamp(n, min, max)` | `number` | No JS equivalent. Throws `ExpressionError` if `min > max` |
| `Math.PI` | `3.14159...` | Constant |
| `Math.E` | `2.71828...` | Constant |

### Arr

Array functions. All throw `UnexpectedTypeError` if the first argument is not an array (except `from` and `of`).

| Function | Returns | Notes |
|---|---|---|
| `Arr.toString(a)` | `string` | Comma-separated: `[1,2,3]` → `"1,2,3"` |
| `Arr.length(a)` | `number` | |
| `Arr.map(a, fn)` | `Array` | `fn(value, index, array)` |
| `Arr.filter(a, fn)` | `Array` | |
| `Arr.find(a, fn)` | `any` | |
| `Arr.findIndex(a, fn)` | `number` | |
| `Arr.every(a, fn)` | `boolean` | |
| `Arr.some(a, fn)` | `boolean` | |
| `Arr.reduce(a, fn)` | `any` | No init — uses first element as accumulator |
| `Arr.fold(a, fn, init)` | `any` | Like `reduce` but with explicit init value |
| `Arr.reduceRight(a, fn)` | `any` | Right-to-left `reduce` |
| `Arr.foldRight(a, fn, init)` | `any` | Right-to-left `fold` |
| `Arr.flat(a, depth?)` | `Array` | Default depth: 1 |
| `Arr.flatMap(a, fn)` | `Array` | |
| `Arr.includes(a, val)` | `boolean` | |
| `Arr.indexOf(a, val)` | `number` | |
| `Arr.lastIndexOf(a, val)` | `number` | |
| `Arr.slice(a, start?, end?)` | `Array` | |
| `Arr.join(a, sep?)` | `string` | Default sep: `","` |
| `Arr.sort(a, fn?)` | `Array` | **Immutable** — uses `toSorted()`, original unchanged |
| `Arr.reverse(a)` | `Array` | **Immutable** — uses `toReversed()`, original unchanged |
| `Arr.concat(a, ...arrays)` | `Array` | |
| `Arr.from(val)` | `Array` | `Array.from(val)` — no array guard |
| `Arr.of(...args)` | `Array` | `Array.of(...args)` — no array guard |
| `Arr.fill(a, val, start?, end?)` | `Array` | **Immutable** — returns new array, original unchanged |
| `Arr.at(a, index)` | `any` | Supports negative indices |

### Obj

Object functions for plain objects.

| Function | Returns | Notes |
|---|---|---|
| `Obj.toString(o)` | `string` | `JSON.stringify(o)` |
| `Obj.keys(o)` | `string[]` | Same as `Object.keys(o)` |
| `Obj.values(o)` | `Array` | Same as `Object.values(o)` |
| `Obj.entries(o)` | `[string, any][]` | Same as `Object.entries(o)` |
| `Obj.fromEntries(entries)` | `Object` | Same as `Object.fromEntries(entries)` |
| `Obj.assign(...objs)` | `Object` | **Immutable** — always returns new object: `Object.assign({}, ...objs)` |
| `Obj.has(o, key)` | `boolean` | Same as `Object.hasOwn(o, key)` |

> **`Obj.assign` vs JS:** In JS, `Object.assign(target, source)` mutates `target`. In SimplEx, `Obj.assign(a, b)` always returns a new object — `a` is never modified.

> **Prefer spread for static field shapes.** `{ ...a, ...b }` is shorter and reads better than `Obj.assign(a, b)`. Use `Obj.assign` only when merging a dynamic number of objects (e.g., `Arr.fold(objs, Obj.assign, {})`) where spread can't generalize.

### Json

JSON serialization.

| Function | Returns | Notes |
|---|---|---|
| `Json.parse(s)` | `any` | Same as `JSON.parse(s)`. Throws on invalid JSON. |
| `Json.stringify(val, replacer?, indent?)` | `string` | `JSON.stringify(val, replacer, indent)`. Replacer can be a function `(key, value) => ...` or an array of key strings. |

### Date (Minimal)

Only two functions. For extended date handling, pass a date library via custom globals.

| Function | Returns | Notes |
|---|---|---|
| `Date.toString(ts)` | `string \| null` | `new Date(ts).toISOString()`. Returns `null` for invalid input |
| `Date.now()` | `number` | Unix timestamp in ms. Same as `Date.now()` |
| `Date.parse(s)` | `number \| null` | Returns `null` for unparseable date strings |

## Validation Tiers

The stdlib uses three validation strategies depending on the risk profile of each function:

| Tier | Strategy | When | Example |
|---|---|---|---|
| **1** — NaN wrapper | Check result for NaN, return `null` | Wrong type silently produces NaN | `Math.abs("x")` → `null` |
| **2** — Semantic wrapper | Return new copy instead of mutating | Mutation risk or API adaptation | `Arr.sort(a)` → new sorted array |
| **3** — Input guard | `typeof` check, throw `UnexpectedTypeError` | Wrong type would throw TypeError | `Str.split(42, ",")` → throws |

Tier 1 functions are lenient — they accept any input and return `null` for nonsensical values. Tier 3 functions are strict — they fail fast with a clear error message. This distinction is intentional: math functions commonly receive external data that may be missing (null-safe via `??`), while string/array methods called on the wrong type indicate a bug.

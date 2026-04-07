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
| `toString(val)` | `String(val)` — universal converter, accepts any type |
| `length(s)` | `s.length` |
| `toUpperCase(s)` | `s.toUpperCase()` |
| `toLowerCase(s)` | `s.toLowerCase()` |
| `trim(s)` | `s.trim()` |
| `trimStart(s)` | `s.trimStart()` |
| `trimEnd(s)` | `s.trimEnd()` |
| `split(s, sep)` | `s.split(sep)` |
| `includes(s, query)` | `s.includes(query)` |
| `startsWith(s, query)` | `s.startsWith(query)` |
| `endsWith(s, query)` | `s.endsWith(query)` |
| `slice(s, start, end?)` | `s.slice(start, end)` |
| `replaceAll(s, from, to)` | `s.replaceAll(from, to)` |
| `indexOf(s, query)` | `s.indexOf(query)` |
| `padStart(s, len, fill?)` | `s.padStart(len, fill)` |
| `padEnd(s, len, fill?)` | `s.padEnd(len, fill)` |
| `repeat(s, count)` | `s.repeat(count)` |
| `charAt(s, index)` | `s[index]` |

### Num

Number functions.

| Function | Returns | Notes |
|---|---|---|
| `toString(n, radix?)` | `string` | `n.toString(radix)`. Throws `UnexpectedTypeError` if not a number |
| `parseInt(s, radix?)` | `number \| null` | |
| `parseFloat(s)` | `number \| null` | |
| `isFinite(n)` | `boolean` | Same as `Number.isFinite` |
| `isInteger(n)` | `boolean` | Same as `Number.isInteger` |
| `isNaN(n)` | `boolean` | Same as `Number.isNaN` |
| `toFixed(n, digits?)` | `string` | Throws `UnexpectedTypeError` if `n` is not a number |

### Math

Mathematical functions and constants. Most return `null` instead of `NaN` for invalid input.

| Function | Returns | Notes |
|---|---|---|
| `abs(n)` | `number \| null` | |
| `round(n)` | `number \| null` | |
| `floor(n)` | `number \| null` | |
| `ceil(n)` | `number \| null` | |
| `trunc(n)` | `number \| null` | |
| `sign(n)` | `number \| null` | |
| `sqrt(n)` | `number \| null` | Negative input returns `null` |
| `cbrt(n)` | `number \| null` | |
| `pow(base, exp)` | `number \| null` | |
| `log(n)` | `number \| null` | Negative input returns `null` |
| `log2(n)` | `number \| null` | |
| `log10(n)` | `number \| null` | |
| `min(...args)` | `number \| null` | Any non-number arg returns `null` |
| `max(...args)` | `number \| null` | Any non-number arg returns `null` |
| `sin(n)` | `number \| null` | |
| `cos(n)` | `number \| null` | |
| `tan(n)` | `number \| null` | |
| `asin(n)` | `number \| null` | |
| `acos(n)` | `number \| null` | |
| `atan(n)` | `number \| null` | |
| `atan2(y, x)` | `number \| null` | |
| `random()` | `number` | Same as `Math.random()` |
| `clamp(n, min, max)` | `number` | No JS equivalent. Throws `ExpressionError` if `min > max` |
| `PI` | `3.14159...` | Constant |
| `E` | `2.71828...` | Constant |

### Arr

Array functions. All throw `UnexpectedTypeError` if the first argument is not an array (except `from` and `of`).

| Function | Returns | Notes |
|---|---|---|
| `toString(a)` | `string` | Comma-separated: `[1,2,3]` → `"1,2,3"` |
| `length(a)` | `number` | |
| `map(a, fn)` | `Array` | `fn(value, index, array)` |
| `filter(a, fn)` | `Array` | |
| `find(a, fn)` | `any` | |
| `findIndex(a, fn)` | `number` | |
| `every(a, fn)` | `boolean` | |
| `some(a, fn)` | `boolean` | |
| `reduce(a, fn)` | `any` | No init — uses first element as accumulator |
| `fold(a, fn, init)` | `any` | Like `reduce` but with explicit init value |
| `reduceRight(a, fn)` | `any` | Right-to-left `reduce` |
| `foldRight(a, fn, init)` | `any` | Right-to-left `fold` |
| `flat(a, depth?)` | `Array` | Default depth: 1 |
| `flatMap(a, fn)` | `Array` | |
| `includes(a, val)` | `boolean` | |
| `indexOf(a, val)` | `number` | |
| `lastIndexOf(a, val)` | `number` | |
| `slice(a, start?, end?)` | `Array` | |
| `join(a, sep?)` | `string` | Default sep: `","` |
| `sort(a, fn?)` | `Array` | **Immutable** — uses `toSorted()`, original unchanged |
| `reverse(a)` | `Array` | **Immutable** — uses `toReversed()`, original unchanged |
| `concat(a, ...arrays)` | `Array` | |
| `from(val)` | `Array` | `Array.from(val)` — no array guard |
| `of(...args)` | `Array` | `Array.of(...args)` — no array guard |
| `fill(a, val, start?, end?)` | `Array` | **Immutable** — returns new array, original unchanged |
| `at(a, index)` | `any` | Supports negative indices |

### Obj

Object functions for plain objects.

| Function | Returns | Notes |
|---|---|---|
| `toString(o)` | `string` | `JSON.stringify(o)` |
| `keys(o)` | `string[]` | Same as `Object.keys(o)` |
| `values(o)` | `Array` | Same as `Object.values(o)` |
| `entries(o)` | `[string, any][]` | Same as `Object.entries(o)` |
| `fromEntries(entries)` | `Object` | Same as `Object.fromEntries(entries)` |
| `assign(...objs)` | `Object` | **Immutable** — always returns new object: `Object.assign({}, ...objs)` |
| `has(o, key)` | `boolean` | Same as `Object.hasOwn(o, key)` |

> **`Obj.assign` vs JS:** In JS, `Object.assign(target, source)` mutates `target`. In SimplEx, `Obj.assign(a, b)` always returns a new object — `a` is never modified.

### Json

JSON serialization.

| Function | Returns | Notes |
|---|---|---|
| `parse(s)` | `any` | Same as `JSON.parse(s)`. Throws on invalid JSON. |
| `stringify(val, replacer?, indent?)` | `string` | `JSON.stringify(val, replacer, indent)`. Replacer can be a function `(key, value) => ...` or an array of key strings. |

### Date (Minimal)

Only two functions. For extended date handling, pass a date library via custom globals.

| Function | Returns | Notes |
|---|---|---|
| `toString(ts)` | `string \| null` | `new Date(ts).toISOString()`. Returns `null` for invalid input |
| `now()` | `number` | Unix timestamp in ms. Same as `Date.now()` |
| `parse(s)` | `number \| null` | Returns `null` for unparseable date strings |

## Validation Tiers

The stdlib uses three validation strategies depending on the risk profile of each function:

| Tier | Strategy | When | Example |
|---|---|---|---|
| **1** — NaN wrapper | Check result for NaN, return `null` | Wrong type silently produces NaN | `Math.abs("x")` → `null` |
| **2** — Semantic wrapper | Return new copy instead of mutating | Mutation risk or API adaptation | `Arr.sort(a)` → new sorted array |
| **3** — Input guard | `typeof` check, throw `UnexpectedTypeError` | Wrong type would throw TypeError | `Str.split(42, ",")` → throws |

Tier 1 functions are lenient — they accept any input and return `null` for nonsensical values. Tier 3 functions are strict — they fail fast with a clear error message. This distinction is intentional: math functions commonly receive external data that may be missing (null-safe via `??`), while string/array methods called on the wrong type indicate a bug.

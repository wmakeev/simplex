# SimplEx Recipes

Common patterns expressed in the language. Each recipe includes a runnable expression, an example input, and a short note explaining why the form is the way it is — usually because SimplEx has no loops, no mutation, and no method-on-prototype machinery, so the JS reflex doesn't translate directly.

All recipes assume the standard library is loaded:

```ts
import { compile } from 'simplex-lang'
import { createStdlib } from 'simplex-lang/stdlib'

const { globals, extensions } = createStdlib()

compile(expr, { globals, extensions })(data)
```

---

## Trees

### Collect every node value (depth-first)

```
let collect = node =>
  [node.value, ...Arr.flatMap(node.children ?? [], collect)],
collect(root)
```

Input: `{ root: { value: 1, children: [{ value: 2, children: [{ value: 4 }] }, { value: 3 }] } }`
Output: `[1, 2, 4, 3]`

**Why this shape.** Named recursion: a `let` binding whose initializer is a lambda can call itself by name. `Arr.flatMap` does the depth-first concat. The `?? []` guards against missing/null `children`.

### Map every node (return a new tree)

```
let mapTree = node => {
  ...node,
  value: node.value * 10,
  children: Arr.map(node.children ?? [], mapTree)
},
mapTree(root)
```

**Why.** `{ ...node, value: …, children: … }` rebuilds the node with two fields overridden — everything else (id, metadata, etc.) is preserved. Spread is the SimplEx form of "structural update".

### Find the first node matching a predicate

```
let find = (node, pred) =>
  if pred(node) then node
  else node.children
    | Arr.fold(%, (acc, c) => acc ?? find(c, pred), null),
find(root, n => n.id == "x")
```

**Why.** Without `break` / `return`, "first match" is encoded as a fold that **carries the result forward** once found: `acc ?? find(c, pred)` short-circuits via `??` as soon as `acc` is non-null. NaN is also nullish in SimplEx, so this works for numeric IDs too if the predicate fails to find anything (the accumulator stays `null`).

### Sum / aggregate over a tree

```
let sumTree = node =>
  node.value + Arr.fold(
    Arr.map(node.children ?? [], sumTree),
    (a, b) => a + b,
    0
  ),
sumTree(root)
```

**Why.** Two recursive calls in one expression are not a problem, but if the recursive case **branches** (Fibonacci-style), bind each call with `let` first to keep the structure flat (see [Multi-branch recursion](../README.md#recursion) in the README).

---

## Hierarchies / BOM unfolding

### Flat list with `parent` references → tree

```
let buildChildren = parentId =>
  items
    | Arr.filter(%, n => n.parent == parentId)
    | Arr.map(%, n => { ...n, children: buildChildren(n.id) }),
buildChildren(null)
```

Input:
```
items = [
  { id: 1, parent: null, name: "root" },
  { id: 2, parent: 1,    name: "a"    },
  { id: 3, parent: 2,    name: "a1"   },
  { id: 4, parent: 1,    name: "b"    }
]
```

Output: a `[ { id: 1, name: "root", children: [ { id: 2, …, children: [ { id: 4, …, children: [] } ] }, … ] } ]` tree.

**Why.** O(n²) — for each node it filters the full list. For small BOM-style data (hundreds of rows) this is fine. For larger sets, build an index in a host helper and pass it via `globals`.

### Tree → flat list (depth-first)

```
let flatten = node =>
  [node, ...Arr.flatMap(node.children ?? [], flatten)],
flatten(root)
```

**Why.** Same as "collect every value", but it returns whole nodes (still with `children` attached). If you don't want the `children` field on each, strip it: `n => let { children, ...rest } = …` — except SimplEx doesn't have destructuring; use `n => Obj.fromEntries(Obj.entries(n)::filter(e => e[0] != "children"))` or pre-shape upstream.

---

## Grouping and aggregation

### `groupBy`

```
Arr.fold(items, (acc, item) =>
  let k = item.kind,
      existing = acc[k] ?? [],
  { ...acc, [k]: [...existing, item] }
, {})
```

Input: `{ items: [{ kind: "a", v: 1 }, { kind: "b", v: 2 }, { kind: "a", v: 3 }] }`
Output: `{ a: [{ kind: "a", v: 1 }, { kind: "a", v: 3 }], b: [{ kind: "b", v: 2 }] }`

**Why.** `Arr.fold` carries the accumulator through; `[...existing, item]` appends without mutation; `{ …acc, [k]: … }` updates one field. Computed keys (`[k]`) make the destination dynamic.

### `countBy`

```
Arr.fold(items, (acc, x) =>
  let k = x.tag,
  { ...acc, [k]: (acc[k] ?? 0) + 1 }
, {})
```

**Why.** Same shape as `groupBy`; the difference is that `acc[k]` is a number, not an array, so the accumulator update is `+ 1` instead of `[...existing, item]`.

### `indexBy` (`Map`-like keyed lookup)

```
Arr.fold(items, (acc, x) => { ...acc, [x.id]: x }, {})
```

**Why.** Build an object keyed by `id`. If two items share an `id`, the later one wins — which is the same behavior as JS spread.

### `unique` / `dedup`

```
Arr.fold(items, (acc, x) =>
  if Arr.includes(acc, x) then acc else [...acc, x]
, [])
```

**Why.** `Arr.includes` does a strict equality check. For object-by-key dedup, fold into an object first (`indexBy`), then take `Obj.values(...)`.

### `partition` into two arrays

```
Arr.fold(items, (acc, x) =>
  if pred(x)
    then { yes: [...acc.yes, x], no: acc.no }
    else { yes: acc.yes, no: [...acc.no, x] }
, { yes: [], no: [] })
```

**Why.** No `for` / `push`, so partition is a fold returning an object with two slots.

---

## Object composition

### Conditional patch

```
{ ...base, ...(if hasBonus then { quota: base.quota + 50 } else {}) }
```

**Why.** Spread `{}` is a no-op, so spreading a conditionally-empty object is the cleanest way to express "maybe add a field". This avoids special-casing the surrounding expression.

### Merge a dynamic number of patches

```
let final = Arr.fold(patches, (acc, p) => { ...acc, ...p }, {}),
{ ...base, ...final }
```

**Why.** Spread can't generalize over an array of unknown length, so a fold is the right tool. Use `Arr.fold(patches, Obj.assign, {})` only if you know nothing else will sneak into the call signature — `Arr.fold` calls its reducer with `(acc, item, index, array)`, and `Obj.assign` happily merges those extras too, producing junk keys. Wrap in a 2-arg lambda to be safe.

### Build an object from an array of `[key, value]` pairs

```
Obj.fromEntries(pairs)
```

Equivalent fold form (when you also need to transform):

```
Arr.fold(pairs, (acc, kv) => { ...acc, [kv[0]]: kv[1] }, {})
```

---

## Safe navigation

### Dotted access through possibly-missing fields

```
user.address.city ?? "unknown"
```

**Why.** `.` is null-safe by default — `null.anything` evaluates to `undefined`. `??` then supplies the fallback.

### Optional pipe — abort the chain on null

```
user.address |? %.city ?? "unknown"
```

**Why.** `|?` short-circuits when the left side is `null` / `undefined` / `NaN`. The chain after it is skipped entirely; the result of `|?` is then the (`null`/`undefined`/`NaN`) value, which `??` falls back to `"unknown"`.

Use `|?` instead of `|` when an intermediate stage might be missing **and** the next stage would error on `null` (e.g., a stdlib call with a strict type guard).

### Deep optional access with `!` for the parts that **must** exist

```
user.profile!.preferences.theme ?? "light"
```

**Why.** `!` is a runtime non-null assert: if `user.profile` is `null`, evaluation throws an `ExpressionError`. Use it where missing data is a bug, not a normal case. Everything else stays null-safe.

---

## Numeric and string utilities

### Sum / min / max

```
Arr.fold(numbers, (a, b) => a + b, 0)              // sum
Arr.reduce(numbers, (a, b) => if a < b then a else b)   // min (no init)
Arr.reduce(numbers, (a, b) => if a > b then a else b)   // max
```

`Math.min(a, b, c)` and `Math.max(...)` only accept fixed arguments — they don't take an array. To take the min of an array, fold.

### Range `[0, 1, …, n - 1]`

```
Arr.from({ length: n })::map((_, i) => i)
```

**Why.** `Arr.from({ length: n })` produces `[null, null, …]` (length `n`); the `::map` then replaces each element with its index. SimplEx's `Arr.from` does **not** accept the optional `mapFn` argument that `Array.from` has, so the map step is separate.

Recursive form (no stdlib trick):

```
let range = (n, acc) =>
  if n == 0 then acc
  else range(n - 1, [n - 1, ...acc]),
range(n, [])
```

### Format a list

```
items
  | Arr.map(%, x => x.name)
  | Arr.join(%, ", ")
```

Equivalent with `::`:

```
items::map(x => x.name)::join(", ")
```

**Why.** Both are correct; pick by chain length and how many stages need `%` — see the [style guide](./style-guide.md) for the full rule.

---

## Lookups

### Object as a switch / lookup table

```
({
  open:    "🟢",
  pending: "🟡",
  closed:  "🔴"
})[status] ?? "❔"
```

**Why.** Build a literal object, index it with the dynamic key, and `??` for the default. This replaces a chain of `if … then … else if`.

### Lookup with fallback into a derived field

```
{ ...base, region: regions[base.regionCode] ?? "unknown" }
```

**Why.** A normal object construction, but the value of `region` comes from a runtime lookup. `regions` here is an object passed via `data` or `globals`.

---

## See also

- [README — Language Reference](../README.md#language-reference)
- [docs/style-guide.md](./style-guide.md) — formatting and idiom choice
- [docs/stdlib.md](./stdlib.md) — full standard library reference
- [docs/js-comparison.md](./js-comparison.md) — what JS has that SimplEx doesn't

# SimplEx Style Guide

A short set of conventions for writing readable SimplEx expressions. None of them are enforced by the compiler — they exist because expressions are typically stored as **strings** (in JSON config, in databases, in UI fields) and are read by humans, agents, and diff tools that all benefit from a single agreed shape.

The [Typical Expression](../README.md#typical-expression) example in the README is written in this style and is the canonical reference. When this guide and the example disagree, the example wins and this guide should be updated.

---

## 1. Indentation and line breaks

**Use 2 spaces for indentation.** Match the surrounding host code (TypeScript / JavaScript) so the expression doesn't visually clash with the file it lives in.

**One `let` binding per line for multi-line expressions.** Bindings are sequential — putting them on separate lines makes the order clear and keeps line-level diffs precise.

```
// preferred
let total    = price * quantity,
    withTax  = total * (1 + tax),
    rounded  = Math.round(withTax),
rounded
```

Wait — that's the next anti-pattern. Drop the column alignment:

```
// preferred
let total = price * quantity,
    withTax = total * (1 + tax),
    rounded = Math.round(withTax),
rounded
```

The extra indent on continuation lines (`let` aligned with the first binding column) is fine and improves readability. What you should **not** do is pad the right-hand side with spaces to make the `=` signs line up.

**Single-line `let`s are fine when there's one or two short bindings:**

```
let n = items::length(), n > 0
let factor = 1 - discount, price * factor
```

---

## 2. No alignment by spaces

Do **not** pad spaces to align `=`, `|`, `:`, or anything else into columns:

```
// avoid
let total       = price * quantity,
    withTax     = total * (1 + tax),
    description = "order"
total
```

Reasons:

1. **Expressions are stored as strings.** Padding bloats the serialized form in configs, JSON files, and database rows for no semantic gain.
2. **Edits cascade.** Renaming `total` to `subtotal` forces re-alignment of every neighboring line, producing diff noise out of proportion to the actual change.
3. **It's an ML / functional-language idiom**, not a SimplEx one. SimplEx expressions live next to TypeScript code; they should look like data, not like Haskell.

A single space on each side of `=` is enough.

---

## 3. Pipe chains

For multi-step pipelines, break **before** each `|` and put the pipe at the start of the continuation line. The shape mirrors method chaining in JS / TS / C#:

```
// preferred
users
  | Arr.filter(%, u => u.enabled)
  | Arr.map(%, u => u.name)
  | Arr.join(%, ", ")
```

Single-line pipes are still fine when they are short:

```
items | Arr.map(%, x => x * 2) | Arr.sum(%)
```

The `%` topic reference should be the **first** non-whitespace character after `(` whenever the function takes the value as its leading argument — that placement reads consistently.

---

## 4. `::` vs `|` vs `Namespace.fn`

The three forms compose values in different ways. Pick by intent, not by minimum character count.

| Use this | When |
|---|---|
| `value::method(args)` | The operation is naturally **a method on the value** — `users::filter(...)`, `name::toUpperCase()`. The receiver is implicit, no `%` is needed. Reads like JS chaining. |
| `value \| f(%)` | You need the topic reference `%` for **anything other than first-argument-passing** — a transform that wraps the value in something else, a non-method call, or two uses of the value in one stage (`x \| Math.max(%, 0)`). |
| `Namespace.fn(value, args)` | The function is **static / factory** (no receiver) — `Json.parse(s)`, `Arr.from(x)`, `Obj.fromEntries(pairs)`. Or when you're inside a larger expression where adding a method-style chain would obscure the structure. |

The same chain rendered three ways:

```
// :: — most idiomatic when each stage is a method on the previous value
users::filter(u => u.enabled)::map(u => u.name)::join(", ")

// pipe — most idiomatic when at least one stage needs %
users
  | Arr.filter(%, u => u.enabled)
  | Arr.map(%, u => u.name)
  | Arr.join(%, ", ")

// namespace nesting — usually only inside a small sub-expression
Arr.join(Arr.map(Arr.filter(users, u => u.enabled), u => u.name), ", ")
```

The third form is rarely the best choice for a top-level pipeline; it reads inside-out. Use it where the entire computation fits on one short line.

---

## 5. Spread vs `Obj.assign`

For known field shapes, **always prefer spread**:

```
// preferred
{ ...base, status: "active" }
{ ...a, ...b, ...c, updatedAt: now }
```

Use `Obj.assign(...)` only when the **number of objects is dynamic** — typically as the reducer in a fold:

```
Arr.fold(objs, Obj.assign, {})
```

Spread is shorter, removes one stdlib lookup, and reads like its JS counterpart. `Obj.assign` is the fallback when spread genuinely cannot generalize.

Do **not** spread an array into an object (`{ ...arr }`) — it errors. Object spread requires an object.

---

## 6. Lambdas

**Inline a lambda when its body fits on one or two lines** and is the natural argument shape:

```
users::filter(u => u.enabled)
items | Arr.map(%, x => x * 2 + 1)
pairs | Arr.map(%, p => let k = p[0], v = p[1], k & "=" & v)
```

**Pull a lambda out into a `let` binding** when it is reused, or when its body is long enough that inlining hurts the surrounding chain:

```
let toLabel = u =>
  let name = u.firstName & " " & u.lastName,
      role = u.role ?? "guest",
  name & " (" & role & ")",
users::map(toLabel)::join(", ")
```

Pulled-out lambdas also benefit from naming: `toLabel` documents the purpose where an inline lambda would not.

A lambda's body is **always one expression**. Don't try `=> { … }` as a block — it parses as an object literal. Use `let` for sequencing:

```
// not a block — this returns the object {result: x + 1}
arg => { result: arg + 1 }

// sequence with let
arg => let result = arg + 1, result
```

---

## 7. Object and array literals

Trailing commas are allowed and recommended for multi-line literals — they keep diffs minimal when fields are appended:

```
{
  name: user.name,
  age:  user.age,        // <- avoid this kind of column-padding
  role: user.role ?? "guest",
}
```

Same as §2: don't pad with spaces to align colons. Single space after the colon is enough.

```
// preferred
{
  name: user.name,
  age: user.age,
  role: user.role ?? "guest",
}
```

For small literals on one line, no special rules: `{ x, y }`, `[1, 2, 3]`.

---

## 8. Comments

`//` and `/* … */` are both supported. Use them sparingly — expressions are usually short enough that comments are noise. The good cases:

- A non-obvious unit on a number: `// minutes`, `// USD cents`.
- A non-obvious branch in a long `if … then … else`.
- A reminder that an identifier comes from `globals` rather than `data`.

Avoid commenting *what* the expression does — well-named `let` bindings already do that. Save commentary for surprises.

---

## 9. Booleans, equality, falsy values

- `not x` is preferred over `!x` (the `!` postfix is the **non-null assert**, not negation; the prefix `!` is not even a token).
- `&&` and `||` exist but always return `boolean` — there is no idiomatic `x || default`. Use `??` for fallbacks.
- `==` / `!=` are always strict. Don't bother with `===` (it doesn't exist as a separate operator).
- For "is this set" checks, prefer `exists(x)` (from stdlib) over `x != null && x != undefined && not Num.isNaN(x)`.
- For "is this missing or empty" checks, prefer `empty(x)` (from stdlib).

---

## 10. Length and decomposition

There is no hard line-length rule, but a useful heuristic:

- **A one-line expression** should fit comfortably in your editor and your config storage.
- **More than ~5 lines** is a signal to introduce one or two `let` bindings to name the intermediate steps.
- **More than ~15 lines** is a signal that the expression is doing too much — consider whether one of the steps belongs in a host-side helper passed via `globals`.

The "Typical Expression" in the [README](../README.md#typical-expression) is roughly at the upper limit of what should live as a single string.

---

## See also

- [README](../README.md) — language reference
- [docs/recipes.md](./recipes.md) — common patterns (tree traversal, group-by, safe navigation)
- [docs/js-comparison.md](./js-comparison.md) — feature-by-feature JS comparison

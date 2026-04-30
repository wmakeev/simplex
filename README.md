# SimplEx <!-- omit in toc -->

[![npm](https://img.shields.io/npm/v/simplex-lang.svg?cacheSeconds=1800&style=flat-square)](https://www.npmjs.com/package/simplex-lang)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/wmakeev/simplex/main.yml?style=flat-square)](https://github.com/wmakeev/simplex/actions/workflows/main.yml)
![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/wmakeev/simplex/main/badges/coverage.json)
![no dependencies](https://img.shields.io/badge/dependencies-no-green?style=flat-square)
[![parser](https://img.shields.io/badge/parser-peggy-pink?style=flat-square)](https://peggyjs.org/)
[![playground](https://img.shields.io/badge/playground-online-blue?style=flat-square)](https://wmakeev.github.io/simplex/)
![VS Code](https://img.shields.io/badge/VS_Code-extension-grey?style=flat-square)

> **SimplEx** — a zero-dependency TypeScript compiler that turns expression strings into safe, sandboxed JavaScript functions.

## Table of contents <!-- omit in toc -->

- [Why SimplEx?](#why-simplex)
- [Quick Start](#quick-start)
- [Typical Expression](#typical-expression)
- [Playground](#playground)
- [Like JS, but…](#like-js-but)
- [Language Reference](#language-reference)
  - [Literals](#literals)
  - [Operators](#operators)
  - [String Concatenation](#string-concatenation)
  - [Collections](#collections)
  - [Property Access](#property-access)
  - [Extension Methods (`::`)](#extension-methods-)
  - [Function Calls](#function-calls)
  - [Currying with `#`](#currying-with-)
  - [Conditionals](#conditionals)
  - [Pipe Operators](#pipe-operators)
  - [Lambda Expressions](#lambda-expressions)
  - [Let Expressions](#let-expressions)
  - [Recursion](#recursion)
  - [Template Literals](#template-literals)
  - [Comments](#comments)
  - [Reserved Words](#reserved-words)
- [Data and Scope](#data-and-scope)
- [API Reference](#api-reference)
  - [compile()](#compile)
  - [CompileOptions](#compileoptions)
  - [Errors](#errors)
- [Customization](#customization)
- [Standard Library](#standard-library)
- [Using External Functions](#using-external-functions)
- [AI / LLM Integration](#ai--llm-integration)
- [License](#license)

## Why SimplEx?

SimplEx evaluates user-provided expressions safely — for ETL pipelines, business rules, templates, and spreadsheet-like UIs. Expressions run in a fully sandboxed environment with no access to globals, prototype chains, or host APIs; users only see data and functions you explicitly provide.

Every expression computes a value — no statements, no assignments, no loops — so expressions are easy to reason about and safe to store in configs or databases. Familiar JS-like syntax, runtime type safety, full customizability, zero dependencies.

## Quick Start

```bash
npm install simplex-lang
```

```ts
import { compile } from 'simplex-lang'

compile('a + b')({ a: 2, b: 3 }) // 5
```

```ts
// Pass custom functions via globals, data at runtime
const fn = compile('clamp(score, 0, 100) * weight', {
  globals: { clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) }
})

fn({ score: 150, weight: 0.5 }) // 50
```

```ts
// Pure data expression — no globals needed
const expr = compile('price * quantity * (1 - discount)')

expr({ price: 100, quantity: 5, discount: 0.1 }) // 450
```

## Typical Expression

A canonical mid-sized example showing the common idioms — `let`-bindings, lambdas, the `::` extension operator, pipe with topic reference `%`, spread, and stdlib calls in both namespace and extension styles:

```ts
import { compile } from 'simplex-lang'
import { createStdlib } from 'simplex-lang/stdlib'

const { globals, extensions } = createStdlib()

const fn = compile(
  `
  let visible = users::filter(u => u.enabled),
      formatted = visible::map(u => {
        ...u,
        fullName: u.firstName & " " & u.lastName
      }),
  formatted
    | Arr.map(%, u => u.fullName)
    | Arr.join(%, ", ")
  `,
  { globals, extensions }
)

fn({
  users: [
    { firstName: 'Ada',  lastName: 'Lovelace', enabled: true },
    { firstName: 'Alan', lastName: 'Turing',   enabled: false },
    { firstName: 'Bob',  lastName: 'Smith',    enabled: true }
  ]
}) // "Ada Lovelace, Bob Smith"
```

A few things to notice:

- `let` introduces local bindings; the **last** comma-separated expression is the body.
- `users::filter(...)` is the same as `Arr.filter(users, ...)` — both styles are equivalent.
- `u => { ...u, fullName: ... }` returns an object literal (no block syntax in SimplEx).
- `|` chains the value through stages with `%` referring to the value at each step.
- `&` is string concatenation; `+` is numeric addition only.

## Playground

Try SimplEx in the browser — edit expressions, inspect the AST, and see results instantly:

**[SimplEx Playground](https://wmakeev.github.io/simplex/)**

## Like JS, but…

SimplEx syntax is intentionally close to JavaScript. If you know JS, you can start writing SimplEx immediately. Here are the key differences:

| Concept | JavaScript | SimplEx | Why |
|---|---|---|---|
| String concatenation | `"a" + "b"` | `"a" & "b"` | `+` is reserved for numeric addition only |
| Conditional | `x ? a : b` | `if x then a else b` | Readable keyword syntax |
| Modulo | `a % b` | `a mod b` | `%` is the topic reference in pipes |
| Exponentiation | `a ** b` | `a ^ b` | Shorter syntax |
| Logical NOT | `!x` | `not x` | Word operator |
| Logical AND/OR | `a && b` returns `a` or `b` | `a and b` returns `boolean` | `&&`/`\|\|` also available, but return booleans too |
| Equality | `===` / `!==` | `==` / `!=` | Always strict — no loose equality exists |
| Optional chaining | `obj?.prop` | `obj.prop` | Null-safe by default — `null.x` returns `undefined` |
| Optional call | `fn?.()` | `fn()` | Calling `null`/`undefined` returns `undefined` |
| Pipe | Stage 2 proposal | `x \| % + 1` | Built-in with `%` as topic reference |
| Partial application | — | `fn(#, 3)` | `#` creates a curried function |
| `let` | Statement | `let x = 5, x + 1` | Expression that returns a value |
| `in` operator | Checks prototype chain | Checks own keys only | Works with objects, arrays, and Maps |

**Everything else works as you'd expect from JavaScript:** arrow functions (`x => x + 1`), template literals (`` `hello ${name}` ``), tagged templates, arrays, objects, spread operators, dot/bracket property access, nullish coalescing (`??`), `typeof`, and comments (`//`, `/* */`).

## Language Reference

### Literals

| Expression | Description |
| --- | --- |
| `42`, `.5`, `1.2e3`, `0xFF` | Numbers (integer, decimal, scientific, hex) |
| `"hello"`, `'world'` | Strings (supports `\n`, `\t`, `\uXXXX` escapes) |
| `true`, `false` | Booleans |
| `null` | Null |
| `undefined` | Undefined (identifier, not a keyword) |

### Operators

Operators listed by precedence (highest first):

| Precedence | Operators | Description |
|---|---|---|
| 1 | `+x` `-x` `not x` `typeof x` | Unary |
| 2 | `^` | Exponentiation (right-associative) |
| 3 | `*` `/` `mod` | Multiplicative |
| 4 | `+` `-` | Additive (numbers only) |
| 5 | `&` | String concatenation (coerces to string) |
| 6 | `<` `<=` `>` `>=` `in` | Relational |
| 7 | `==` `!=` | Equality (strict) |
| 8 | `and` `&&` | Logical AND (short-circuit, returns boolean) |
| 9 | `or` `\|\|` | Logical OR (short-circuit, returns boolean) |
| 10 | `??` | Nullish coalescing |
| 11 | `\|` `\|?` `\|>` | Pipe operators |

**Runtime type enforcement:**

- Arithmetic (`+`, `-`, `*`, `/`, `mod`, `^`) — operands must be finite numbers or bigints
- Relational (`<`, `>`, `<=`, `>=`) — operands must be numbers or strings
- `&` — coerces any value to string
- `==`/`!=` — strict comparison, no coercion

### String Concatenation

The `+` operator only works with numbers. Use `&` to concatenate strings:

| Expression | Result |
| --- | --- |
| `"Hello" & " " & "world"` | `"Hello world"` |
| `"Count: " & 42` | `"Count: 42"` (coerces to string) |
| `"Values: " & [1, 2, 3]` | `"Values: 1,2,3"` |

### Collections

**Arrays:**

| Expression | Description |
| --- | --- |
| `[1, 2, 3]` | Array literal |
| `[1, , 3]` | Sparse array |
| `[1, ...other, 4]` | Spread (arrays only) |

**Objects:**

| Expression | Description |
| --- | --- |
| `{ a: 1, b: 2 }` | Object literal |
| `{ "special-key": 1 }` | Quoted key |
| `{ [dynamic]: value }` | Computed key |
| `{ x, y }` | Shorthand property (`{ x: x, y: y }`) |
| `{ ...base, extra: true }` | Spread |

**Spread is the primary form of object composition.** Use it whenever the field shape is known statically:

| Expression | Description |
| --- | --- |
| `{ ...base, extra: true }` | Add or override one field |
| `{ ...a, ...b }` | Merge two objects (later wins) |
| `{ ...base, name: name & " (renamed)" }` | Compose a derived field |
| `{ ...obj, [key]: value }` | Set a computed key |

The standard library's `Obj.assign(...)` is for cases where spread can't generalize — e.g., merging a dynamic number of objects via `Arr.fold(objs, Obj.assign, {})`. For known field names, prefer spread.

### Property Access

| Expression | Description |
| --- | --- |
| `obj.name` | Dot access (own properties only) |
| `obj["key"]` | Bracket access (own properties only) |
| `arr[0]` | Index access |
| `obj.nested.deep` | Chaining |
| `null.anything` | `undefined` (null-safe, no error) |
| `expr!` | Non-null assert — throws if `null`/`undefined` |
| `a.b!.c.d!` | Chainable non-null assertions |
| `foo!(args)` | Assert non-null, then call |

> **Note:** Unlike JavaScript (which has optional chaining `?.` and no runtime `!`), SimplEx has null-safe member access by default but explicit non-null assertion via `!`. This is inverted from JS — more practical for an expression language working with optional data structures.

### Extension Methods (`::`)

The `::` operator calls extension methods registered via the `extensions` compile option. `obj::method(args)` is equivalent to `methodBag.method(obj, args)` — the receiver is passed as the first argument to the resolved function.

| Expression | Equivalent |
|---|---|
| `obj::method(x)` | `methodBag.method(obj, x)` |
| `null::anything()` | `undefined` (null-safe) |
| `a::f()::g()` | `g(f(a))` (chaining) |

Extensions are matched by `typeof` for primitives or by constructor for objects. With the standard library, every `Str.*` / `Num.*` / `Arr.*` / `Obj.*` function is also available as an extension:

```ts
import { createStdlib } from 'simplex-lang/stdlib'

const { globals, extensions } = createStdlib()

compile('"hello"::toUpperCase()', { globals, extensions })()  // "HELLO"
compile('[3, 1, 2]::sort()', { globals, extensions })()        // [1, 2, 3]
compile(
  'users::filter(u => u.active)::map(u => u.name)',
  { globals, extensions }
)({ users: [{ name: 'A', active: true }, { name: 'B', active: false }] })
// ["A"]
```

Custom extensions:

```ts
const extensions = new Map([
  ['string', {
    capitalize: (s: string) => s[0].toUpperCase() + s.slice(1),
    truncate: (s: string, len: number) =>
      s.length > len ? s.slice(0, len) + '...' : s
  }]
])

compile('"hello"::capitalize()', { extensions })()        // "Hello"
compile('"long text here"::truncate(8)', { extensions })() // "long tex..."
```

**Pipe vs `::`** — both compose values; choose by intent:

```
users | Arr.filter(%, u => u.age >= 18) | Arr.map(%, u => u.name)
users::filter(u => u.age >= 18)::map(u => u.name)
```

Use `::` when the operation is naturally a method on the value; use `|` when you need an arbitrary expression with the topic reference `%` (e.g., a non-method call, a transform that doesn't take the value as the first argument, or a side-by-side use of the value).

Throws `ExpressionError` if no extensions are configured for the type or the method is not found.

### Function Calls

| Expression | Description |
| --- | --- |
| `min(1, 2)` | Global function |
| `obj.method(x)` | Method call |
| `fn()()` | Chaining |
| `null()` | `undefined` (null-safe) |

### Currying with `#`

The `#` placeholder in function arguments creates a partially applied function:

| Expression | Equivalent |
| --- | --- |
| `add(#, 3)` | `x => add(x, 3)` |
| `add(1, #)` | `x => add(1, x)` |
| `mul(#, 2, #)` | `(a, b) => mul(a, 2, b)` |
| `[1, 2, 3] \| map(%, add(#, 10))` | `[11, 12, 13]` |

### Conditionals

| Expression | Description |
| --- | --- |
| `if score >= 90 then "A" else "B"` | Conditional with else |
| `if active then value` | Else is optional (defaults to `undefined`) |

Falsy values: `0`, `""`, `false`, `null`, `undefined`, `NaN`. Everything else is truthy.

### Pipe Operators

Pipes chain a value through a series of expressions. The `%` topic reference holds the current value:

| Expression | Result |
| --- | --- |
| `5 \| % + 1` | `6` |
| `5 \| % * 2 \| % + 1` | `11` |
| `1 \| add(%, 2) \| % * 4` | `12` |
| `value \|? toUpper(%)` | If `value` is `null`, returns `null` (`\|?` short-circuits) |

**`|>` (forward pipe)** — reserved (not available by default). Override `pipe` in compile options to implement custom semantics.

### Lambda Expressions

| Expression | Description |
| --- | --- |
| `x => x + 1` | Single parameter |
| `(a, b) => a + b` | Multiple parameters |
| `() => 42` | No parameters |
| `a => b => a + b` | Curried (nested) |

Lambdas are closures — they capture the enclosing scope. Parameters shadow outer variables. The body is always a single expression (SimplEx has no block syntax — `{ ... }` after `=>` is an object literal, not a block).

**Not supported:**

| Form | Workaround |
| --- | --- |
| Destructuring: `({a, b}) => ...`, `([x, y]) => ...` | Destructure in the body: `pair => let a = pair[0], b = pair[1], ...` |
| Default parameters: `(x = 5) => ...` | Use `??` in the body: `x => let v = x ?? 5, ...` |
| Rest parameters: `(...args) => ...` | Pass an array: `args => ...` |
| Named function declarations | Use `let f = (...) => ..., ...` (see [Recursion](#recursion) for self-reference) |

### Let Expressions

`let` creates local bindings and evaluates a body expression:

| Expression | Result |
| --- | --- |
| `let x = 5, x + 1` | `6` |
| `let a = 1, b = a + 1, a + b` | `3` |
| `let tax = price * 0.2, price + tax` | Sequential binding |

Bindings are sequential — each initializer can reference previous bindings. The last comma-separated expression is the body. Duplicate names cause a `CompileError`.

### Recursion

Named recursion is supported through `let`-bindings when the initializer is a lambda. The binding's name is captured in the lambda's closure and resolved at call time, by which point the binding is established in the scope chain:

```
let factorial = n => if n <= 1 then 1 else n * factorial(n - 1),
factorial(5)   // 120

let countdown = n => if n <= 0 then [] else [n, ...countdown(n - 1)],
countdown(3)   // [3, 2, 1]
```

**Self-reference works only for lambdas.** Plain expressions need their right-hand side evaluated immediately:

```
let x = x + 1, x   // Error: x is not defined
```

**No mutual recursion.** Two sibling `let` bindings cannot see each other — each `let` opens a new scope, and the name becomes visible only for bindings that follow it. Combine both functions into one with a selector parameter, or use the `self(self)` trick below.

**Multi-branch recursion (Fibonacci, tree traversal).** When the recursive case combines two or more recursive calls in a single expression, bind each call with `let` first:

```
let fib = n =>
  if n <= 1 then n
  else
    let a = fib(n - 1),
        b = fib(n - 2),
    a + b,
fib(10)   // 55
```

**Anonymous recursion** — for cases where a name isn't available (e.g., inside a pipe stage):

```
// self(self) trick
let fact = self => n => if n <= 1 then 1 else n * self(self)(n - 1),
fact(fact)(5)   // 120

// Y combinator — cleaner body, more setup
let Y = f => (x => f(y => x(x)(y)))(x => f(y => x(x)(y))),
Y(self => n => if n <= 1 then n else self(n - 1) + self(n - 2))(10)   // 55
```

Prefer named recursion for readability; the anonymous forms are useful when a name isn't available.

### Template Literals

| Expression | Description |
| --- | --- |
| `` `Hello ${name}, you have ${count} items` `` | String interpolation |
| `` `Price: ${price * (1 + tax)}` `` | Any expression inside `${}` |
| `` `Nested: ${`inner ${x}`}` `` | Nested template literals |
| Multiline content | Allowed (unlike regular strings) |

**Tagged template literals** — any expression before a template literal calls it as a tag function:

| Expression | Description |
| --- | --- |
| `` sql`SELECT * FROM ${table}` `` | Tag receives `(strings, ...values)` |
| `` obj.escape`user input: ${value}` `` | Member expression as tag |

The tag function receives an array of static string parts and the interpolated values (not coerced to strings). It can return any type.

### Comments

| Syntax | Description |
| --- | --- |
| `// comment` | Single-line comment |
| `/* comment */` | Multi-line / inline comment |

### Reserved Words

`if`, `then`, `else`, `and`, `or`, `not`, `in`, `mod`, `typeof`, `let`, `true`, `false`, `null` — cannot be used as identifiers.

## Data and Scope

Identifiers are resolved in this order: **local scope** (lambda params, let bindings) -> **closure** -> **globals** -> **data** -> **error**.

```ts
// Globals — compile-time constants, always take priority
const fn = compile('x + y', { globals: { x: 10 } })
fn({ x: 999, y: 20 }) // 30 (x=10 from globals, y=20 from data)

// Data — runtime values passed when calling the compiled function
const expr = compile('firstName & " " & lastName')
expr({ firstName: 'John', lastName: 'Doe' }) // "John Doe"
```

Globals take priority over data. This lets you provide trusted constants and functions that user expressions cannot override.

## API Reference

### compile()

```ts
import { compile } from 'simplex-lang'

function compile<
  Data = Record<string, unknown>,
  Globals = Record<string, unknown>
>(
  expression: string,
  options?: CompileOptions<Data, Globals>
): (data?: Data) => unknown
```

Compiles a SimplEx expression string into a reusable function. The returned function accepts an optional `data` argument and returns the result of evaluating the expression.

### CompileOptions

```ts
type CompileOptions<Data, Globals> = Partial<
  ContextHelpers<Data, Globals> &
    ExpressionOperators & {
      globals: Globals
      extensions: Map<string | object | Function, Record<string, Function>>
      errorMapper: ErrorMapper | null
    }
>
```

All fields are optional. You can override any combination of:

| Option | Type | Description |
|---|---|---|
| `globals` | `Globals` | Compile-time constants and functions available to the expression |
| `extensions` | `Map<string \| object \| Function, Record<string, Function>>` | Extension methods for `::` operator. Keys: `typeof` string or class/constructor. Values: method bags |
| `errorMapper` | `ErrorMapper \| null` | Error mapping strategy. Default: auto-detected (V8). `null` disables mapping |
| `getIdentifierValue` | `(name, globals, data) => unknown` | Custom identifier resolution |
| `getProperty` | `(obj, key, extension) => unknown` | Custom property access. `extension` is `true` for `::` access |
| `callFunction` | `(fn, args) => unknown` | Custom function call behavior |
| `pipe` | `(head, tail) => unknown` | Custom pipe operator behavior |
| `nonNullAssert` | `(val) => unknown` | Custom non-null assertion for `!` operator |
| `castToBoolean` | `(val) => boolean` | Custom truthiness rules (affects `if`, `and`, `or`, `not`) |
| `castToString` | `(val) => string` | Custom string coercion (affects `&` and template literals) |
| `ensureFunction` | `(val) => Function` | Custom function validation |
| `ensureObject` | `(val) => object` | Custom object validation (for spread) |
| `ensureArray` | `(val) => unknown[]` | Custom array validation (for spread) |
| `unaryOperators` | `Record<op, (val) => unknown>` | Override unary operators |
| `binaryOperators` | `Record<op, (left, right) => unknown>` | Override binary operators |
| `logicalOperators` | `Record<op, (left, right) => unknown>` | Override logical operators (args are thunks) |

### Errors

All SimplEx errors include the original expression and source location for precise error reporting.

**`ExpressionError`** — runtime evaluation error (unknown identifier, type mismatch, invalid operation):

```ts
import { ExpressionError } from 'simplex-lang'

try {
  compile('x + 1')({}) // x is not defined
} catch (err) {
  if (err instanceof ExpressionError) {
    err.message    // "Unknown identifier - x"
    err.expression // "x + 1"
    err.location   // { start: { offset, line, column }, end: { ... } }
  }
}
```

**`CompileError`** — compilation error (e.g., duplicate `let` bindings):

```ts
import { CompileError } from 'simplex-lang'

compile('let a = 1, a = 2, a') // throws CompileError
```

**`UnexpectedTypeError`** — runtime type validation error:

```ts
import { UnexpectedTypeError } from 'simplex-lang'

compile('"hello" + 1')() // throws UnexpectedTypeError: expected number
```

## Customization

Every aspect of SimplEx evaluation can be customized through compile options.

**Custom operators** — override or extend any operator:

```ts
import {
  compile,
  defaultBinaryOperators,
  defaultUnaryOperators
} from 'simplex-lang'

const fn = compile('not -a + b', {
  unaryOperators: {
    ...defaultUnaryOperators,
    not: val => Number(val) + 1 // redefine "not"
  },
  binaryOperators: {
    ...defaultBinaryOperators,
    '+': (a, b) => Number(a) * Number(b) // make "+" multiply
  }
})
```

**Custom identifier resolution** — control how variables are looked up:

```ts
// Use a Map instead of a plain object for globals
const fn = compile('foo', {
  globals: new Map([['foo', 'bar']]),
  getIdentifierValue(name, globals, data) {
    if (globals.has(name)) return globals.get(name)
    return data[name]
  }
})
```

**Custom property access** — intercept or transform property lookups:

```ts
const fn = compile('a.b', {
  getProperty: (obj, key, extension) => `custom:${String(key)}`
})

fn({ a: { b: 'real' } }) // "custom:b"
```

**Custom function calls** — wrap or intercept function invocations:

```ts
const fn = compile('f(1, 2)', {
  globals: { f: (a, b) => a + b },
  callFunction: (fn, args) => {
    if (args === null) return fn()
    return `intercepted:${fn(...args)}`
  }
})

fn() // "intercepted:3"
```

**Custom pipe** — implement your own pipe semantics:

```ts
const fn = compile('1 | % + 1', {
  pipe: (head, tail) => {
    let result = head
    for (const t of tail) {
      result = `piped:${t.next(result)}`
    }
    return result
  }
})

fn() // "piped:2"
```

**Custom boolean coercion** — change what counts as truthy/falsy (affects `if`, `and`, `or`, `not`):

```ts
const fn = compile('if a then "yes" else "no"', {
  castToBoolean: val => val === 'truthy'
})

fn({ a: 'truthy' }) // "yes"
fn({ a: true })     // "no" — only the string "truthy" is truthy now
```

## Standard Library

SimplEx includes a built-in standard library with namespaced functions and extension methods:

```ts
import { compile } from 'simplex-lang'
import { createStdlib } from 'simplex-lang/stdlib'

const { globals, extensions } = createStdlib()

compile('Math.abs(x) + Str.upper(name)', { globals, extensions })({
  x: -5,
  name: 'hello'
}) // 5 + "HELLO" → uses Math and Str namespaces
```

**Namespaces:** `Str`, `Num`, `Math`, `Arr`, `Obj`, `Json`, `Date` + top-level utilities (`empty`, `exists`, `typeOf`).

**Extension methods** let you use method-call syntax: `x::abs()`, `items::map(fn)`, `name::upper()`.

**Key conventions:**

- **NaN → null** — functions that would return `NaN` in JS return `null` instead. Use `??` to provide defaults: `Math.sqrt(x) ?? 0`
- **Immutable** — array operations return new copies (no mutation)

See [Standard Library Reference](docs/stdlib.md) for the full API.

## Using External Functions

Beyond the [Standard Library](#standard-library), you can provide any custom functions via `globals`. This is useful for domain-specific logic. To combine stdlib with your own functions, spread them together:

```ts
import { createStdlib } from 'simplex-lang/stdlib'

const { globals, extensions } = createStdlib()

const fn = compile(
  `price * quantity * (1 - discount)
    | Math.round(%)
    | formatPrice(%)`,
  {
    globals: {
      ...globals,
      formatPrice: (val) => `$${val.toFixed(2)}`
    },
    extensions
  }
)

fn({ price: 19.99, quantity: 3, discount: 0.15 }) // "$51.00"
```

**Domain-specific helpers:**

```ts
const fn = compile(
  `
  if classify(score) == "A" then
    bonus(salary)
  else
    salary
  `,
  {
    globals: {
      classify: (score) => (score >= 90 ? 'A' : score >= 70 ? 'B' : 'C'),
      bonus: (salary) => salary * 1.2
    }
  }
)

fn({ score: 95, salary: 50000 }) // 60000
```

**Combining with currying:**

```ts
const fn = compile('items | map(%, mul(#, factor))', {
  globals: {
    map: (arr, fn) => arr.map(fn),
    mul: (a, b) => a * b
  }
})

fn({ items: [1, 2, 3], factor: 10 }) // [10, 20, 30]
```

## AI / LLM Integration

SimplEx is a good target for AI-generated expressions: safe by design (no globals, filesystem, or network), deterministic, simple grammar, and compilation catches errors before runtime.

```ts
const fn = compile(aiResponse.expression) // e.g., "price * quantity * (1 - discount)"
fn(data) // safe execution
```

> Expressions are compiled once to native JS functions via `new Function()` — subsequent calls have near-native performance.

## License

[MIT](LICENSE)

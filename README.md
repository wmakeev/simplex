# SimplEx <!-- omit in toc -->

[![npm](https://img.shields.io/npm/v/simplex-lang.svg?cacheSeconds=1800&style=flat-square)](https://www.npmjs.com/package/simplex-lang)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/wmakeev/simplex/main.yml?style=flat-square)](https://github.com/wmakeev/simplex/actions/workflows/main.yml)
![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/wmakeev/simplex/main/badges/coverage.json)
![no dependencies](https://img.shields.io/badge/dependencies-no-green?style=flat-square)
[![parser](https://img.shields.io/badge/parser-peggy-pink?style=flat-square)](https://peggyjs.org/)

> **SimplEx** — a zero-dependency TypeScript compiler that turns expression strings into safe, sandboxed JavaScript functions.

## Table of contents <!-- omit in toc -->

- [Why SimplEx?](#why-simplex)
- [Quick Start](#quick-start)
- [Playground](#playground)
- [Like JS, but...](#like-js-but)
- [Language Reference](#language-reference)
  - [Literals](#literals)
  - [Operators](#operators)
  - [String Concatenation](#string-concatenation)
  - [Collections](#collections)
  - [Property Access](#property-access)
  - [Function Calls](#function-calls)
  - [Currying with #](#currying-with-)
  - [Conditionals](#conditionals)
  - [Pipe Operators](#pipe-operators)
  - [Lambda Expressions](#lambda-expressions)
  - [Let Expressions](#let-expressions)
  - [Template Literals](#template-literals)
  - [Comments](#comments)
  - [Reserved Words](#reserved-words)
- [Data and Scope](#data-and-scope)
- [API Reference](#api-reference)
  - [compile()](#compile)
  - [CompileOptions](#compileoptions)
  - [Errors](#errors)
- [Customization](#customization)
- [Using External Functions](#using-external-functions)
- [License](#license)

## Why SimplEx?

SimplEx is designed for scenarios where you need to evaluate user-provided expressions safely:

- **ETL/ELT pipelines** — calculated fields, data transformations, filtering rules
- **Business rules engines** — config-driven formulas and conditions
- **Template engines** — dynamic value computation
- **Spreadsheet-like UIs** — user-defined formulas

**Why not just `eval()`?** SimplEx expressions run in a fully sandboxed environment with no access to the global scope, prototype chains, or Node.js/browser APIs. Users can only work with data and functions you explicitly provide.

**Why not a full language?** SimplEx is expression-only — no statements, no assignments, no loops, no side effects. Every expression deterministically computes a single value. This makes expressions easy to reason about and safe to store in configs and databases.

**What you get:**

- Familiar JS-like syntax — if you know JavaScript, you already know most of SimplEx
- Runtime type safety — arithmetic rejects `NaN`/`Infinity`, clear errors with source locations
- Fully customizable — override any operator, identifier resolution, property access, or pipe behavior
- Zero dependencies, ESM-only, TypeScript-first

## Quick Start

```bash
npm install simplex-lang
```

```ts
import { compile } from 'simplex-lang'

// Pass functions via globals, data at runtime
const fn = compile('(a + b) * min(a, b) + 10', {
  globals: { min: Math.min }
})

fn({ a: 2, b: 3 }) // 20
```

```ts
// Pure data expression — no globals needed
const expr = compile('price * quantity * (1 - discount)')

expr({ price: 100, quantity: 5, discount: 0.1 }) // 450
```

## Playground

Try SimplEx in the browser — edit expressions, inspect the AST, and see results instantly:

**[SimplEx Playground](https://wmakeev.github.io/simplex/)**

## Like JS, but...

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
| `{ ...base, extra: true }` | Spread (objects only) |

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

**Extension operator** (`::`) is reserved for custom semantics. By default it throws an error — override `getProperty` to implement your own behavior.

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

**`|>` (forward pipe)** — reserved. Override `pipe` in compile options to implement custom semantics.

### Lambda Expressions

| Expression | Description |
| --- | --- |
| `x => x + 1` | Single parameter |
| `(a, b) => a + b` | Multiple parameters |
| `() => 42` | No parameters |
| `a => b => a + b` | Curried (nested) |

Lambdas are closures — they capture the enclosing scope. Parameters shadow outer variables.

### Let Expressions

`let` creates local bindings and evaluates a body expression:

| Expression | Result |
| --- | --- |
| `let x = 5, x + 1` | `6` |
| `let a = 1, b = a + 1, a + b` | `3` |
| `let tax = price * 0.2, price + tax` | Sequential binding |

Bindings are sequential — each initializer can reference previous bindings. The last comma-separated expression is the body. Duplicate names cause a `CompileError`.

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
  ContextHelpers<Data, Globals> & ExpressionOperators & { globals: Globals }
>
```

All fields are optional. You can override any combination of:

| Option | Type | Description |
|---|---|---|
| `globals` | `Globals` | Compile-time constants and functions available to the expression |
| `getIdentifierValue` | `(name, globals, data) => unknown` | Custom identifier resolution |
| `getProperty` | `(obj, key, extension) => unknown` | Custom property access (including `::`) |
| `callFunction` | `(fn, args) => unknown` | Custom function call behavior |
| `pipe` | `(head, tail) => unknown` | Custom pipe operator behavior |
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
  getProperty: (obj, key) => `custom:${String(key)}`
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

## Using External Functions

SimplEx expressions can call any function you provide via `globals`. This is the primary way to extend the language.

**Basic usage — math and utilities:**

```ts
const fn = compile('round(price * quantity * (1 - discount), 2)', {
  globals: {
    round: (val, decimals) => {
      const factor = 10 ** decimals
      return Math.round(val * factor) / factor
    }
  }
})

fn({ price: 19.99, quantity: 3, discount: 0.15 }) // 50.97
```

**Function library — provide a set of utilities:**

```ts
const stdlib = {
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  lower: s => s.toLowerCase(),
  upper: s => s.toUpperCase(),
  trim: s => s.trim(),
  len: s => s.length,
  includes: (arr, val) => arr.includes(val),
  map: (arr, fn) => arr.map(fn),
  filter: (arr, fn) => arr.filter(fn),
  reduce: (arr, fn, init) => arr.reduce(fn, init),
  keys: obj => Object.keys(obj),
  values: obj => Object.values(obj)
}

const fn = compile('items | filter(%, x => x.active) | map(%, x => x.name) | len(%)', {
  globals: stdlib
})

fn({
  items: [
    { name: 'A', active: true },
    { name: 'B', active: false },
    { name: 'C', active: true }
  ]
}) // 2
```

**Combining lambdas with currying:**

```ts
const fn = compile('items | map(%, add(#, 10)) | filter(%, gt(#, 15))', {
  globals: {
    map: (arr, fn) => arr.map(fn),
    filter: (arr, fn) => arr.filter(fn),
    add: (a, b) => a + b,
    gt: (a, b) => a > b
  }
})

fn({ items: [1, 5, 8, 12] }) // [15, 18, 22]
```

## License

[MIT](LICENSE)

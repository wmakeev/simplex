# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SimplEx (`simplex-lang`) is a TypeScript compiler for a simple expression language that compiles expression strings into executable JavaScript functions. Zero dependencies.

**Pipeline:** Expression string → Peggy parser → AST → `traverse()` code generation → `new Function()` → callable `(data?) => unknown`

## Build & Test Commands

```bash
npm run build          # Full: build:parser → lint → compile → copy-parser
npm run build:dev      # Dev: lint → compile (skips parser rebuild and clean)
npm run build:parser   # Regenerate parser from src/simplex.peggy
npm run compile        # TypeScript compilation only (clean build)
npm run compile:dev    # TypeScript compilation only (incremental)
npm run lint           # ESLint with --fix
npm test               # Full: build + coverage + report
npm run coverage       # Run tests with c8 coverage (no build)
```

To run a single test file:

```bash
npm run compile:dev && node --test build/test/parser.test.js
```

## Architecture

- **`src/simplex.peggy`** — PEG grammar defining the expression language (Peggy format). Generates `parser/index.js`.
- **`src/simplex-tree.ts`** — AST node type definitions (Literal, Identifier, BinaryExpression, CallExpression, PipeSequence, LambdaExpression, LetExpression, TemplateLiteralExpression, etc.)
- **`src/visitors.ts`** — AST visitors: `visitors` object maps AST node types to JS code strings; `traverse()` walks the AST and produces generated code with source location offsets.
- **`src/compiler.ts`** — Core compiler: `compile()` orchestrates parse → codegen → Function creation. Includes default operators, context helpers, bootstrap code generation, and runtime error mapping.
- **`src/errors.ts`** — Error classes: `ExpressionError`, `CompileError`, `UnexpectedTypeError`
- **`src/tools/`** — Runtime utilities: type guards (`guards.ts`), casting (`cast.ts`), type checking (`index.ts`), validation (`ensure.ts`)
- **`src/index.ts`** — Public API re-exports
- **`parser/`** — Auto-generated parser output (do not edit manually)
- **`build/`** — Compiled JS output

## SimplEx Language Reference

SimplEx is a safe, sandboxed expression language for evaluating user-provided formulas against data. No statements, no assignments (except `let`), no side effects — only expressions that compute a value.

### Literals

- **Numbers:** `42`, `.5`, `1.2e3`, `0xFF`
- **Strings:** `"hello"`, `'world'` (with `\n`, `\t`, `\uXXXX` escapes)
- **Booleans:** `true`, `false`
- **Null:** `null`
- **Undefined:** `undefined` (identifier, not keyword)

### Operators (by precedence, highest first)

| Precedence | Operators | Notes |
|---|---|---|
| 1 | `+x` `-x` `not x` `typeof x` | Unary. `not` returns boolean |
| 2 | `^` | Exponentiation, **right-associative** |
| 3 | `*` `/` `mod` | Multiplicative |
| 4 | `+` `-` | Additive (numbers only) |
| 5 | `&` | String concatenation (coerces to string) |
| 6 | `<` `<=` `>` `>=` `in` | Relational. `in` checks key membership |
| 7 | `==` `!=` | Equality (strict `===`/`!==`) |
| 8 | `and` `&&` | Logical AND (short-circuit, returns boolean) |
| 9 | `or` `\|\|` | Logical OR (short-circuit, returns boolean) |
| 10 | `??` | Nullish coalescing (null/undefined only) |
| 11 | `\|` `\|?` `\|>` | Pipe operators |

`in` operator: arrays — checks index (`2 in [a, b, c]`); objects — checks key (`"k" in {k: 1}`); Maps — checks key.

### Collections

- **Arrays:** `[1, 2, 3]`, `[1, , 3]` (sparse), trailing comma OK. Spread: `[1, ...arr, 4]`
- **Objects:** `{a: 1, "b-c": 2}`, trailing comma OK. Computed keys: `{["a" & "b"]: 42}`. Spread: `{...obj, a: 1}`

### Property Access

- **Dot:** `obj.prop`, `obj.nested.deep`
- **Computed:** `obj["key"]`, `arr[0]`, `str[0]`
- **Extension:** `obj::method(args)` — calls an extension method. Requires `extensions` option in `CompileOptions`. The extension method receives `obj` as first argument: `obj::map(fn)` → `extensionMap.map(obj, fn)`. Throws `ExpressionError` if no extensions configured, type not found, or method not found. Null-safe: `null::method()` → `undefined`.
- **Non-null assert:** `expr!` — runtime assert that value is not `null`/`undefined`. Throws `ExpressionError` if it is. No whitespace before `!`. Chainable: `a.b!.c.d!`, `foo!(args)`. Unlike JavaScript (which has optional chaining `?.` and no `!`), SimplEx has null-safe member access by default but explicit non-null assertion via `!` — inverted from JS, which is more practical for an expression language working with optional data structures.
- Null-safe: `null.prop` → `undefined` (no error)
- Strings: only numeric index access; `"str".foo` → error

### Function Calls

- `func()`, `func(a, b)`, `obj.method(x)`
- Null-safe: calling `null`/`undefined` as function → `undefined`
- Chaining: `a.b()()`, `thunk()(arg)`

### Currying (`#` placeholder)

`#` in call arguments creates a partially applied function:
- `add(#, 3)` → `x => add(x, 3)`
- `add(1, #)` → `x => add(1, x)`
- `fn(#, y, #)` → `(a, b) => fn(a, y, b)`

### Conditional

```
if condition then consequent else alternate
if condition then consequent              // else → undefined
```

Boolean coercion: falsy = `0`, `""`, `false`, `null`, `undefined`, `NaN`. Everything else is truthy.

### Pipe Operators

`expr | next | another` — chain values through expressions. `%` (topic reference) holds the piped value.

- `|` — standard pipe: `5 | % + 1` → `6`
- `|?` — optional pipe: short-circuits on `null`/`undefined` (returns them as-is)
- `|>` — **reserved**, throws `ExpressionError` by default. Override `pipe` in `CompileOptions` to implement custom semantics.

Example: `1 | add(%, 2) | % * 4` → `12`

### Lambda Expressions

```
x => x + 1                    // single param
(a, b) => a + b               // multiple params
() => 42                      // no params
a => b => a + b               // curried (nested)
```

Lambdas are closures — they capture the enclosing scope. Parameters shadow outer variables.

### Let Expressions

```
let x = 5, x + 1                      // → 6
let a = 1, b = a + 1, a + b           // → 3 (sequential binding)
```

Syntax: `let name1 = init1, name2 = init2, bodyExpr`

- Bindings are sequential: each init sees previous bindings
- Duplicate names → `CompileError`
- The **last comma-separated expression** is the body (not a binding)

### Template Literals

`` `Hello ${name}, you have ${count} items` ``

- Backtick-delimited strings with `${expression}` interpolations
- Expressions inside `${}` can be any SimplEx expression (including nested template literals)
- Static parts support same escape sequences as regular strings, plus `` \` `` and `\$`
- Result is always a string (interpolated values are coerced via `castToString`)
- Multiline content is allowed (unlike regular strings)
- A lone `$` without `{` is treated as literal text

### Tagged Template Literals

`` tag`Hello ${name}` `` — any expression before a template literal calls it as a tag function.

- Tag function receives `(strings, ...values)` — array of static parts and interpolated values
- Interpolated values are NOT coerced to string — passed as-is
- Tag function can return any type (not limited to strings)
- Tag can be any expression: identifier (`tag`...``), member expression (`obj.tag`...``), or call result (`fn()`...``)
- Null/undefined tag returns `undefined` (same as calling null as function)
- Example: `` $`column ${name}` `` where `$` is a global tag function

### Comments

- Single-line: `// comment`
- Multi-line: `/* comment */`

### Reserved Words

`if`, `then`, `else`, `and`, `or`, `not`, `in`, `mod`, `typeof`, `let`, `true`, `false`, `null` — cannot be used as identifiers.

### Data & Scope Resolution

Identifier lookup order: local scope (lambda params, let bindings) → closure → globals → data → error.

```typescript
// Globals (compile-time constants)
compile('a + b', { globals: { a: 10, b: 20 } })()  // 30

// Data (runtime parameter)
compile('a + b')({ a: 10, b: 20 })                 // 30

// Globals override data
compile('x', { globals: { x: 1 } })({ x: 2 })      // 1
```

### Runtime Type Safety

- Arithmetic (`+`, `-`, `*`, `/`, `mod`, `^`): operands must be `number`/`bigint` (rejects NaN, Infinity)
- Relational (`<`, `>`, `<=`, `>=`): operands must be `number` or `string`
- `&`: coerces anything to string
- `==`/`!=`: strict comparison, no coercion
- Calling non-function (except null/undefined): `UnexpectedTypeError`
- Accessing undefined variable: `ExpressionError` with source location

### Compile Options

```typescript
compile<Data, Globals>(expression: string, options?: {
  globals?: Record<string, unknown>
  extensions?: Map<string | object | Function, Record<string, Function>>
  getIdentifierValue?: (name: string, globals: Globals, data: Data) => unknown
  unaryOperators?: Record<string, (val: unknown) => unknown>
  binaryOperators?: Record<string, (left: unknown, right: unknown) => unknown>
  logicalOperators?: Record<string, (left: () => unknown, right: () => unknown) => unknown>
})
```

All operators and context helpers can be overridden at compile time.

`extensions` maps types to method bags for `::` syntax. Keys: `string` (`"string"`, `"number"`) for `typeof` matching, or class/constructor (`Array`, `Map`) for `instanceof` matching. Values: objects mapping method names to functions where the first argument is always the receiver object.

## Code Generation Strategy

The compiler generates JS code referencing runtime helpers: `get(scope, name)` for identifier lookup, `bop["+"]()` for binary operators, `uop["-"]()` for unary, etc. Scope is a nested array structure `[paramNames, paramValues, parentScope]` for lexical scoping in lambdas/let expressions.

## Code Style

- Prettier: no semicolons, single quotes, no trailing commas, avoid parens on single arrow params
- TypeScript: extends `@tsconfig/node22` + `@tsconfig/strictest`
- Node.js built-in test runner (`node:test`) with `assert`
- Tests run from compiled JS in `build/` (compile first, then run)
- All documentation and project `.md` files must be written in English
- Task lists in `.md` files must use `[ ]` / `[x]` checkbox format for easy tracking

## Project Files

- **`TODO.md`** — Feature backlog. Consult when adding new language features.
- **`playground/`** — Interactive web playground (Preact + CodeMirror + Vite). Separate app with own `package.json`. See `playground/PLAYGROUND.md` for architecture, decisions, and testing plan.

## Workflow

- After implementing a task from TODO.md, mark it as done before committing.
- After completing and testing a plan implementation, always offer to commit the changes.
- After a commit is made, always offer to push to the remote.
- After a push, always check CI status (`gh run list`).
- **`git stash` is unsafe** in this project: ESLint runs with `--fix` (via `npm run lint` / `npm run build`), so it auto-modifies files. If you stash changes, run lint, and then `stash pop`, the linter-modified files will conflict with stashed changes — potentially losing all unstaged work.

## Maintenance

After any changes that affect architecture, file structure, build commands, language syntax/semantics, or conventions — update this file to reflect the new state. This includes adding/removing/renaming source files, changing the build pipeline, modifying code style rules, or changing the expression language (operators, grammar, runtime behavior).

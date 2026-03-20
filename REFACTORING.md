# Refactoring Opportunities

Categorized list of refactoring opportunities for the simplex-lang codebase.

## HIGH

- [x] **1. Extract comma-separated list builder (`visitors.ts`)**

  Extracted a shared helper that builds comma-separated output segments, replacing repeated `flatMap` + trailing comma pop patterns in ObjectExpression, ArrayExpression, CallExpression, and PipeSequence.

- [x] **2. Extract magic strings to constants (`compiler.ts`, `visitors.ts`)**

  Centralized bootstrap variable names and the topic token into a shared constants module.

## MEDIUM

- [x] **3. Simplify operator definitions (`compiler.ts`)**

  Reduced duplication in binary operator definitions with a factory function. Eliminated duplicate `'and'`/`'&&'` and `'or'`/`'||'` entries.

- [x] **4. Consolidate small utility files (`src/tools/`)**

  Merged `guards.ts`, `cast.ts`, `ensure.ts` into `index.ts` — single file organized by sections (guards, cast, ensure).

- [x] **5. Extract operator call wrappers (`visitors.ts`)**

  Repeated patterns for wrapping visitor output in `uop[]()`, `bop[]()`, `lop[]()`, and `call()` calls. Could be extracted into visitor builder utilities.

- [x] **6. Reduce error class boilerplate (`errors.ts`)**

  `ExpressionError` and `CompileError` have nearly identical constructors (name assignment, message formatting, location handling). Extract a shared base class or factory.

- [x] **7. Simplify error mapping (`compiler.ts`)**

  Extracted `mapRuntimeError()` function with early returns, replaced `assert` calls with graceful bail-outs, simplified the catch block to a single line.

- [x] **8. Extract context helpers (`compiler.ts`)**

  Extracted `defaultGetIdentifierValue`, `defaultGetProperty`, `defaultCallFunction`, and `defaultPipe` as standalone functions. The `defaultContextHelpers` object is now a clean mapping.

## LOW

- [x] **9. Test style consistency**

  All test files now use `suite`/`test` and import from the public API (`src/index.js`).

- [ ] **10. Address existing TODOs**

  10 TODO comments across `compiler.ts`, `visitors.ts`, and `tools/index.ts` covering parse-time validation, computed properties, and performance improvements.

- [x] **11. Test coverage balance**

  Added dedicated tests for visitor edge cases (parameterless lambdas, string object keys, unknown node types, duplicate let names) and compiler customization points (custom logical operators, getProperty, callFunction, pipe, castToBoolean, mapRuntimeError edge cases).

- [x] **12. Reserve `::` extension syntax and `|>` pipe operator**

  Both `::` and `|>` now throw `ExpressionError` at runtime by default. The `extension` flag is passed through codegen to `getProperty`, and a `fwd` flag is passed to `pipe` for `|>` steps. Users can override `getProperty` and `pipe` via `CompileOptions` to implement custom semantics.

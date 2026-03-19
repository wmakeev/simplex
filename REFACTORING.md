# Refactoring Opportunities

Categorized list of refactoring opportunities for the simplex-lang codebase.

## HIGH

- [x] **1. Extract comma-separated list builder (`visitors.ts`)**

  **Lines 110-276.** ObjectExpression, ArrayExpression, CallExpression, and PipeSequence all repeat a pattern of `flatMap` over children followed by popping the trailing comma. Extract a shared helper that builds comma-separated output segments.

- [x] **2. Extract magic strings to constants (`compiler.ts`, `visitors.ts`)**

  Bootstrap variable names (`"bool"`, `"bop"`, `"lop"`, `"uop"`, `"get"`, `"call"`, `"pipe"`), scope index patterns (`_scope[0]`, `_scope[1]`, `_scope[2]`), and the topic token `"%"` are hardcoded across `compiler.ts` (lines 278-307) and `visitors.ts` (lines 9, 253, 279). Centralize into a shared constants module.

## MEDIUM

- [x] **3. Simplify operator definitions (`compiler.ts` lines 131-228)**

  16 binary operators repeat `ensureNumber()` guards and identical `// eslint-disable` / `@ts-expect-error` comments. A factory function would cut the duplication significantly. Additionally, `'and'`/`'&&'` and `'or'`/`'||'` are exact duplicates (lines 240-252).

- [x] **4. Consolidate small utility files (`src/tools/`)**

  Merged `guards.ts`, `cast.ts`, `ensure.ts` into `index.ts` — single file organized by sections (guards, cast, ensure).

- [x] **5. Extract operator call wrappers (`visitors.ts`)**

  Repeated patterns for wrapping visitor output in `uop[]()`, `bop[]()`, `lop[]()`, and `call()` calls. Could be extracted into visitor builder utilities.

- [x] **6. Reduce error class boilerplate (`errors.ts` lines 4-47)**

  `ExpressionError` and `CompileError` have nearly identical constructors (name assignment, message formatting, location handling). Extract a shared base class or factory.

- [ ] **7. Simplify error mapping (`compiler.ts` lines 334-376)**

  ~40-line try/catch with 5 nested ifs, regex-based stack parsing, and a fragile `assert.equal(rowOffset, 3)`. Extract into a dedicated utility function and reduce nesting.

- [ ] **8. Extract context helpers (`compiler.ts` lines 58-149)**

  The large `defaultContextHelpers` object mixes type checking, error throwing, and complex logic. Extract individual helper functions to improve readability and testability.

## LOW

- [x] **9. Test style consistency**

  All test files now use `suite`/`test` and import from the public API (`src/index.js`).

- [ ] **10. Address existing TODOs**

  10 TODO comments across `compiler.ts`, `visitors.ts`, and `tools/index.ts` covering parse-time validation, computed properties, and performance improvements.

- [ ] **11. Test coverage balance**

  `parser.test.ts` is 2457 lines (~55% of all test code). Visitor and compiler behavior could use expanded dedicated tests.

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
node --import tsx --test test/parser.test.ts
```

## Architecture

- **`src/simplex.peggy`** — PEG grammar defining the expression language (Peggy format). Generates `parser/index.js`.
- **`src/simplex-tree.ts`** — AST node type definitions (Literal, Identifier, BinaryExpression, CallExpression, PipeSequence, LambdaExpression, LetExpression, etc.)
- **`src/compiler.ts`** — Core compiler: `visitors` object maps AST node types to JS code strings; `traverse()` walks AST; `compile()` orchestrates parse → codegen → Function creation. Includes default operators and context helpers.
- **`src/errors.ts`** — Error classes: `ExpressionError`, `CompileError`, `UnexpectedTypeError`
- **`src/tools/`** — Runtime utilities: type guards (`guards.ts`), casting (`cast.ts`), type checking (`index.ts`), validation (`ensure.ts`)
- **`src/index.ts`** — Public API re-exports
- **`parser/`** — Auto-generated parser output (do not edit manually)
- **`build/`** — Compiled JS output

## Code Generation Strategy

The compiler generates JS code referencing runtime helpers: `get(scope, name)` for identifier lookup, `bop["+"]()` for binary operators, `uop["-"]()` for unary, etc. Scope is a nested array structure `[paramNames, paramValues, parentScope]` for lexical scoping in lambdas/let expressions.

## Code Style

- Prettier: no semicolons, single quotes, no trailing commas, avoid parens on single arrow params
- TypeScript: extends `@tsconfig/node22` + `@tsconfig/strictest`
- Node.js built-in test runner (`node:test`) with `assert`
- Tests use `tsx` for TypeScript execution

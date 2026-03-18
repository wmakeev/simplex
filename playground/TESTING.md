# Playground Testing Plan

## Approach

Unit-tests of the **logical layer** using **Vitest**. UI/component/E2E tests are intentionally excluded — they are fragile, expensive to maintain, and provide low value for a playground app.

### Why Vitest

- Native Vite integration — picks up aliases (`simplex-lang`, `node:assert`)
- Fast, no build step needed
- ESM-compatible (`"type": "module"`)
- Minimal setup: 1 dependency, 1 config file

## What is tested

| Area                   | File                        | What                                                          |
| ---------------------- | --------------------------- | ------------------------------------------------------------- |
| Examples compilation | `compiler-bridge.test.ts` | Every example from `examples/index.ts` compiles without errors |
| Compiler bridge errors | `compiler-bridge.test.ts` | Empty input, syntax errors, JSON errors, runtime errors |
| URL state | `state.test.ts` | encode/decode roundtrip, invalid input handling |
| Example helpers | `examples/index.test.ts` | `getExampleById()`, `getCategories()` |
| Output helpers | `components/helpers.test.ts` | `formatResult()`, `getResultType()`, AST helpers |

## Running tests

```bash
cd playground && npm test        # single run
cd playground && npm run test:watch  # watch mode
```

From the repo root:

```bash
npm run test:playground
```

# Plan: Compile-time validation of `%` outside pipe context

## Context

Currently `%` (topic reference) outside a pipe expression is only detected at **runtime** — when the compiled function is called, `defaultGetIdentifierValue` (compiler.ts:63) throws a plain `Error`. The TODO asks to move this check to compile time so the error is thrown by `compile()` itself, with source location info via `CompileError`.

## Approach

Add an AST validation walk **before** code generation that checks every `TopicReference` node is reachable from a `PipeSequence` tail. A boolean `insidePipeTail` flag is threaded through recursion.

### Semantics

- `PipeSequence.head` — does NOT bind `%` (flag stays unchanged)
- `PipeSequence.tail[].expression` — DOES bind `%` (flag set to `true`)
- Lambda/Let/other nodes — transparent (inherit flag from parent, since runtime scope chain finds `%`)
- `TopicReference` with `insidePipeTail === false` → `CompileError` with location

## Steps

### 1. Add `validateTopicReferences()` in `src/visitors.ts`

After `traverse()`, add:

```typescript
function checkTopicRef(node: Expression, insidePipeTail: boolean): void {
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
      break
    case 'TopicReference':
      if (!insidePipeTail) {
        throw new CompileError(
          `Topic reference "${TOPIC_TOKEN}" is unbound; it must be inside a pipe body.`,
          '',
          node.location
        )
      }
      break
    case 'PipeSequence':
      checkTopicRef(node.head, insidePipeTail)
      for (const t of node.tail) checkTopicRef(t.expression, true)
      break
    case 'UnaryExpression':
      checkTopicRef(node.argument, insidePipeTail)
      break
    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'NullishCoalescingExpression':
      checkTopicRef(node.left, insidePipeTail)
      checkTopicRef(node.right, insidePipeTail)
      break
    case 'ConditionalExpression':
      checkTopicRef(node.test, insidePipeTail)
      checkTopicRef(node.consequent, insidePipeTail)
      if (node.alternate) checkTopicRef(node.alternate, insidePipeTail)
      break
    case 'CallExpression':
      checkTopicRef(node.callee, insidePipeTail)
      for (const arg of node.arguments)
        if (arg.type !== 'CurryPlaceholder') checkTopicRef(arg, insidePipeTail)
      break
    case 'MemberExpression':
      checkTopicRef(node.object, insidePipeTail)
      if (node.computed) checkTopicRef(node.property, insidePipeTail)
      break
    case 'ArrayExpression':
      for (const el of node.elements)
        if (el !== null) checkTopicRef(el, insidePipeTail)
      break
    case 'ObjectExpression':
      for (const p of node.properties) checkTopicRef(p.value, insidePipeTail)
      break
    case 'LambdaExpression':
      checkTopicRef(node.expression, insidePipeTail)
      break
    case 'LetExpression':
      for (const d of node.declarations) checkTopicRef(d.init, insidePipeTail)
      checkTopicRef(node.expression, insidePipeTail)
      break
  }
}

export function validateTopicReferences(tree: ExpressionStatement): void {
  checkTopicRef(tree.expression, false)
}
```

### 2. Call validation in `src/compiler.ts`

- Import `validateTopicReferences` from `./visitors.js` (add to existing import)
- Call it inside the existing try-catch block before `traverse()`:

```typescript
try {
  validateTopicReferences(tree)
  traverseResult = traverse(tree)
} catch (err) { ... }
```

- Remove the TODO comment at line 62, keep the runtime check as safety net

### 3. Update tests in `test/operators.test.ts`

Change existing test:
```typescript
// Before: compile('%')()  — error at runtime
// After:  compile('%')    — error at compile time
assert.throws(() => {
  compile('%')
}, { name: 'CompileError', message: /is unbound/ })
```

Add edge case tests:
- `compile('1 + %')` → CompileError
- `compile('% | 1')` → CompileError (head, not tail)
- `compile('x => %')` → CompileError (lambda outside pipe)
- `compile('1 | % + 1')` → no error (valid)
- `compile('1 | (x => %)(2)')` → no error (lambda inside pipe tail)

### 4. Housekeeping

- `REFACTORING.md`: mark task 2 as done
- `compiler.ts:62`: remove `// TODO Should test on parse time?` comment

## Files to modify

| File | Change |
|---|---|
| `src/visitors.ts` | Add `checkTopicRef` + `validateTopicReferences` (~50 lines) |
| `src/compiler.ts` | Import + call validation, remove TODO comment |
| `test/operators.test.ts` | Update existing test + add edge cases |
| `REFACTORING.md` | Mark task 2 done |

## Verification

```bash
npm run compile:dev && node --test build/test/operators.test.js
npm run coverage  # full test suite
```

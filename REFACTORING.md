# Analysis of TODO comments in the codebase

## Clear TODOs (detailed reformulation)

### [x] 1. Validate object key type at parse time

Resolved: The grammar already restricts keys to `IdentifierName`, `StringLiteral`, and `NumericLiteral`, so the `else` branch is unreachable in normal use. Replaced `TypeError` with `CompileError` including source location as a defensive measure.

---

### [x] 2. Detect `%` usage outside pipe at compile time

Resolved: `TraverseContext.insidePipe` flag is set in the `PipeSequence` visitor (tail only). The `TopicReference` visitor throws `CompileError` with source location when `insidePipe` is false. The runtime check in `defaultGetIdentifierValue` was removed.

---

### [x] 3. `castToBoolean` in logical operators ignores compile options

```js
export const defaultLogicalOperators = {
  // TODO Use castToBoolean from compile options?
  'and': (a, b) => castToBoolean(a()) && castToBoolean(b()),
  ...
}
```

**Problem:** In `if` expressions, `castToBoolean` is taken from context (`ctx.castToBoolean`) and can be overridden via compile options. But `defaultLogicalOperators` (`and`, `or`, `&&`, `||`) use a hardcoded import of `castToBoolean` — overriding via options has no effect on them. This is inconsistent.

**What to do:** Make default logical operators use `castToBoolean` from compile options. Likely needs a factory: pass the actual `castToBoolean` function from context when creating default logical operators. Alternatively, generate code that calls `ctx.castToBoolean` directly (as done for `if`).

---

### [x] 4. Pass `expression` to CompileError via context object instead of catch+assign

Resolved: `TraverseContext` interface threads the expression string through `traverse()` → `visit()` → visitors. Visitors now set `expression` directly in `CompileError`. The try/catch workaround in `compile()` was removed.

---

### [x] 5. Remove `unbox()` from all internal calls

Resolved: `unbox()` function deleted entirely. Boxed primitives (`new String`, `new Number`, `new Boolean`) cannot originate from SimplEx expressions, so the overhead was unnecessary. All internal callers (`isSimpleValue`, `castToBoolean`, `castToString`, `ensureNumber`, `ensureRelationalComparable`) no longer handle boxed primitives.

---

## Ambiguous / needs clarification TODOs

### [x] 6. `visitors.ts:142` — "look for ECMA spec" for object key serialization

Resolved: `JSON.stringify` is correct for string keys (adds quotes, escapes) and finite numeric keys. The only edge case is `Infinity` (from e.g. `1e999`), where `JSON.stringify(Infinity)` returns `"null"`. Now the `ObjectExpression` visitor throws `CompileError` with source location for non-finite numeric keys.

## In mind

Ideas without a clear use case yet. Revisit when a concrete need arises.

### `visitors.ts:172` — Pass `computed` to `getProperty`

```js
// TODO Pass computed to prop?
const propertyPart = computed
  ? visit(property)           // obj[expr] — property = computed expression
  : [codePart(JSON.stringify(property.name), property)]  // obj.name — property = string
```

Current signature: `getProperty(obj, key, extension)`. The key is already computed in both cases. A `computed` flag could let custom `getProperty` implementations distinguish `obj.foo` (name lookup) from `obj[foo]` (value lookup), but no concrete use case exists yet.

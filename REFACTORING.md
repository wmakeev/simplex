# Analysis of TODO comments in the codebase

## Clear TODOs (detailed reformulation)

### [ ] 1. `visitors.ts:145-146` — Validate object key type at parse time

```js
} else {
  // TODO Restrict on parse step
  // TODO Error with locations
  throw new TypeError(`Incorrect object key type ${p.key.type}`)
}
```

**Problem:** If an ObjectExpression AST node receives a key whose type is neither `Identifier` nor `Literal`, the error is thrown during code generation (in visitors) as a plain `TypeError` without source location info.

**What to do:**
- Move this check to the PEG grammar or a post-parse validation step so invalid keys are rejected earlier.
- The error should be a `CompileError` with `location` (line/column in the source expression), not a bare `TypeError`.

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

### [ ] 6. `visitors.ts:142` — "look for ECMA spec" for object key serialization

```js
} else if (p.key.type === 'Literal') {
  // TODO look for ECMA spec
  key = codePart(JSON.stringify(p.key.value), p)
}
```

**Unclear:** What exactly needs to be checked in the specification?

Possible interpretations:
- **(a)** Verify whether `JSON.stringify` correctly handles all valid literal key values (numbers, strings) — there may be edge cases where `JSON.stringify` produces an invalid JS property key (e.g., `NaN`, `Infinity`, `-0`).
- **(b)** Check which literal types are valid as object keys per the ECMA-262 specification to constrain the grammar.
- **(c)** Confirm that the generated JS (`{42: val}` vs `{"42": val}`) is behaviorally equivalent.

**Question to author:** Which aspect of the ECMA spec was intended? The `JSON.stringify` edge-case issue, valid key types, or correctness of generated code?

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

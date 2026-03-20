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

---

### [ ] 7. `visitors.ts:172` — Pass `computed` to `getProperty`

```js
// TODO Pass computed to prop?
const propertyPart = computed
  ? visit(property)           // obj[expr] — property = computed expression
  : [codePart(JSON.stringify(property.name), property)]  // obj.name — property = string
```

**Unclear:** Why would `getProperty` need a `computed` flag?

Current signature: `getProperty(obj, key, extension)`. An already-computed key is passed — for `.prop` it's the string `"prop"`, for `[expr]` it's the result of `expr`. In both cases `getProperty` receives a ready-made key value.

Possible interpretations:
- **(a)** `computed` is needed to distinguish semantics: `obj.foo` (name lookup) vs `obj[foo]` (value lookup) — could be useful for custom `getProperty` implementations (e.g., to differentiate property access from index access).
- **(b)** `computed` is needed for optimization: if not computed, the key is guaranteed to be a string — type checks can be skipped.
- **(c)** This is a leftover note and the distinction is not needed in practice (the key is already computed).

**Question to author:** Is there a concrete use case where a custom `getProperty` should distinguish dot-access from bracket-access? Or is this a "food for thought" note?

---

### [ ] 8. `visitors.ts:297` — `...args` vs named parameters in lambdas

```js
// TODO Is "...args" more performant?
// (params => function (p0, p1) {
//   var scope = [params, [p0, p1], scope]
//   return {{code}}
// })(["a", "b"])
```

**Unclear:** What exactly is being compared and in which direction is the change intended?

Current code generates `function(p0, p1)` with explicit names. Alternative:

```js
function(...args) { var scope = [params, args, scope]; return ... }
```

Pros of `...args`: one pattern for any number of parameters, less generated code.
Cons of `...args`: rest parameters are traditionally slower in V8 (though the gap is shrinking); function `.length` is lost; no named parameters for debugging.

**Question to author:** Was the intent "benchmark which is faster in V8" or "switch to `...args` to simplify code generation"? Priority — performance or simplicity of generated code?

---

### [ ] 9. Specialized `isSimpleValue` variants for different cases

**Unclear:** Which specific "different cases" are meant?

Currently `isSimpleValue` is used in only one place — `defaultGetProperty` for key validation. Possible variants:
- **(a)** A version with a different set of types — e.g., including `symbol` (for Map keys) or excluding `bigint`.
- **(b)** A version that additionally checks `NaN`, `Infinity`, `-0` and other edge-case numbers.

**Question to author:** Were there specific situations where the current `isSimpleValue` implementation was insufficient? Or is this a "just in case" note without a concrete case?

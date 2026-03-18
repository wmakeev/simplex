# SimplEx Playground

Interactive web playground for the SimplEx expression language.

## Status

- [x] Phase 1: Core (Vite + Preact/HTM + CodeMirror + compiler integration)
- [x] Phase 2: Examples, URL state, share links
- [x] Phase 3: GitHub Actions deployment workflow
- [x] Phase 4a: Syntax highlighting, error highlighting
- [x] Phase 4b: Documentation tab, AST tree view (PWA deferred)

## Testing

See [TESTING.md](./TESTING.md) for the testing plan and rationale.

## Development

```bash
cd playground
npm install
npm run dev       # http://localhost:5173/simplex/
npm run build     # Production build → dist/
npm run preview   # Preview production build
```

## Architecture

- **Preact + HTM** — lightweight UI (~4KB), no JSX transform needed
- **CodeMirror 6** — code editors for expression, globals JSON, data JSON; syntax highlighting and lint diagnostics
- **@preact/signals** — reactive state management
- **Vite aliases** — imports `simplex-lang` source directly, shims `node:assert`

### Vite aliases (vite.config.ts)

```text
'simplex-lang' → '../src/index.ts'   // library compiled by Vite on the fly
'node:assert'  → 'src/shims/assert.ts' // browser shim (ok, equal)
```

### Parser import

`parse` is not exported from the public API (`src/index.ts`). In `compiler-bridge.ts` it is imported directly:

```ts
import { parse } from '../../parser/index.js'   // 217KB, ES module
import { traverse, compile } from 'simplex-lang' // via alias
```

`traverse` and `compile` are re-exported through `src/index.ts → compiler.ts`.

### assert shim

`compiler.ts` uses `node:assert` in two places (lines 381, 385) — checks during error mapping. The shim in `shims/assert.ts` implements only `ok()` and `equal()`.

## Deployment

Automatically deployed to GitHub Pages on push to `main` when `playground/`, `src/`, or `parser/` files change.

URL: `https://wmakeev.github.io/simplex/`

## Decisions and pitfalls

### @preact/preset-vite is not needed

`@preact/preset-vite` provides JSX transformation and Prefresh (HMR). But we use **HTM** (tagged template literals), so JSX transformation is unnecessary. Additionally, preset@2.10.4 crashes with Vite 6.4+ due to a bug with `this.meta` in the `config()` hook. **Solution:** removed the preset, kept plain Vite. HTM works without transformation.

### Example globals — JSON-serializable values only

The globals/data fields in examples are JSON strings, parsed via `JSON.parse()`. Functions (e.g. `Math.abs`) cannot be passed. Examples with functions in globals must either be removed or require special handling (eval globals as JS, not JSON) — but that is unsafe. Worked around by changing examples.

### CodeMirror is recreated on theme change

Switching dark/light theme recreates CodeMirror instances (dependency in `useEffect` on `darkMode.value`). Content is restored via the `value` prop, but cursor position is lost. To improve this, `EditorView.reconfigure()` can be used for dynamic theme switching without recreation.

### Bundle size

~514KB / ~168KB gzip. Main components: CodeMirror (~150KB + language/lint), parser (~217KB source, smaller after minification), Preact+signals (~4KB). For optimization, `manualChunks` can be added to Vite config to split parser and CodeMirror.

## Syntax Highlighting (Phase 4a)

### SimplEx Language Mode

File: `playground/src/simplex-language.ts`

Implemented via `StreamLanguage` from `@codemirror/language` — a stream-based tokenizer that processes text character by character. Does not use a Lezer grammar (overkill for an expression language).

Token to `@lezer/highlight` tag mapping:

| Token                  | Examples                                                                                   | Tag                              |
| ---------------------- | ------------------------------------------------------------------------------------------ | -------------------------------- |
| `keyword`              | `if`, `then`, `else`, `and`, `or`, `not`, `in`, `mod`, `typeof`, `let`                     | `tags.keyword`                   |
| `atom`                 | `true`, `false`, `null`, `undefined`, `#`                                                  | `tags.atom`                      |
| `number`               | `42`, `.5`, `1.2e3`, `0xFF`                                                                | `tags.number`                    |
| `string`               | `"hello"`, `'world'` (with escape sequences)                                               | `tags.string`                    |
| `comment`              | `// ...`, `/* ... */`                                                                      | `tags.comment`                   |
| `operator`             | `+`, `-`, `*`, `/`, `^`, `&`, `==`, `!=`, `<=`, `>=`, `\|`, `\|?`, `\|>`, `??`, `=>`, `::` | `tags.operator`                  |
| `variableName.special` | `%` (topic reference)                                                                      | `tags.special(tags.variableName)` |
| `variableName`         | identifiers                                                                                | `tags.variableName`              |

Implementation details:

- `tokenTable` maps string token names to `@lezer/highlight` tags — without it, standard themes (oneDark etc.) do not colorize tokens
- Multi-line comments `/* */` do **not** support spanning across lines (limitation of the stream-based approach: `token()` is called per line). Full support requires `state` in `StreamLanguage.define()`. Current implementation `startState: () => null` is stateless
- `#` (curry placeholder) — `atom`, `%` (topic reference) — `variableName.special`
- `undefined` is treated as `atom` (not a keyword, since in SimplEx it is an identifier, not a reserved word)

### Error Highlighting

Error diagnostics via `@codemirror/lint`:

- `codemirror-editor.ts` — accepts `diagnostics?: { from: number; to: number; message: string }[]` prop
- Uses `setDiagnostics()` for display and `lintGutter()` for gutter markers
- CSS class `.cm-error-highlight` in `main.css` sets the style (red wavy underline + semi-transparent background)

`expression-editor.ts` — computes diagnostics from `compileResult.value.error?.location`:

- `location.offset` — error position in the source string
- Highlights 1 character starting at offset; if the error is at the end of the string (offset === length), highlights the last character
- Diagnostics are recomputed on each render (depends on `compileResult` signal)

### Dependencies (Phase 4a)

- `@codemirror/language` — `StreamLanguage`, `StringStream` for custom language mode
- `@codemirror/lint` — `setDiagnostics()`, `lintGutter()` for inline errors

## Phase 4b — Documentation Tab & AST Tree View

- **Docs tab** (`docs-view.ts`): static HTML rendering of the SimplEx Language Reference (Literals, Operators, Collections, Property Access, Functions, Currying, Conditionals, Pipes, Lambdas, Let, Comments, Scope)
- **AST tree view** (`ast-tree-view.ts`): interactive collapsible tree replacing raw JSON in the AST tab
  - Recursive `TreeNode` with expand/collapse per node (root expanded by default)
  - Inline summaries: Literal→value, Identifier→name, BinaryExpression/LogicalExpression/UnaryExpression→operator
  - Handles PipeSequence.tail (non-standard AST structure), sparse arrays (null elements)
  - `ScalarNode` for primitive values, `ArrayNode` for arrays with count labels
- PWA deferred to future phase

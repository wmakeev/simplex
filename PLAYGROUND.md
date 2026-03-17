# SimplEx Playground

Interactive web playground for the SimplEx expression language.

## Status

- [x] Phase 1: Core (Vite + Preact/HTM + CodeMirror + compiler integration)
- [x] Phase 2: Examples, URL state, share links
- [x] Phase 3: GitHub Actions deployment workflow
- [x] Phase 4a: Syntax highlighting, error highlighting
- [x] Phase 4b: Documentation tab, AST tree view (PWA deferred)

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
- **CodeMirror 6** — code editors for expression, globals JSON, data JSON; syntax highlighting и lint-диагностика
- **@preact/signals** — reactive state management
- **Vite aliases** — imports `simplex-lang` source directly, shims `node:assert`

### Vite aliases (vite.config.ts)

```
'simplex-lang' → '../src/index.ts'   // библиотека компилируется Vite на лету
'node:assert'  → 'src/shims/assert.ts' // браузерная заглушка (ok, equal)
```

### Импорт парсера

`parse` не экспортируется из публичного API (`src/index.ts`). В `compiler-bridge.ts` он импортируется напрямую:
```ts
import { parse } from '../../parser/index.js'   // 217KB, ES module
import { traverse, compile } from 'simplex-lang' // через alias
```

`traverse` и `compile` — реэкспортируются через `src/index.ts → compiler.ts`.

### assert shim

`compiler.ts` использует `node:assert` в двух местах (строки 381, 385) — проверки при маппинге ошибок. Шим в `shims/assert.ts` реализует только `ok()` и `equal()`.

## Deployment

Automatically deployed to GitHub Pages on push to `main` when `playground/`, `src/`, or `parser/` files change.

URL: `https://wmakeev.github.io/simplex/`

## Решения и грабли

### @preact/preset-vite не нужен

`@preact/preset-vite` даёт JSX-трансформацию и Prefresh (HMR). Но мы используем **HTM** (tagged template literals), поэтому JSX-трансформация не нужна. Кроме того, preset@2.10.4 падает с Vite 6.4+ из-за бага с `this.meta` в хуке `config()`. **Решение:** убрали preset, оставили чистый Vite. HTM работает без трансформации.

### Globals в примерах — только JSON-сериализуемые значения

Поля globals/data в примерах — JSON-строки, парсятся через `JSON.parse()`. Нельзя передать функции (например `Math.abs`). Примеры с функциями в globals нужно либо убирать, либо реализовывать спец. обработку (eval globals как JS, не JSON) — но это небезопасно. Пока обошли изменением примеров.

### CodeMirror пересоздаётся при смене темы

Переключение dark/light темы пересоздаёт экземпляры CodeMirror (зависимость в `useEffect` от `darkMode.value`). Контент восстанавливается через `value` prop, но позиция курсора теряется. Для улучшения можно использовать `EditorView.reconfigure()` для динамической смены темы без пересоздания.

### Размер бандла

~514KB / ~168KB gzip. Основные составляющие: CodeMirror (~150KB + language/lint), parser (~217KB source, меньше после минификации), Preact+signals (~4KB). Для оптимизации можно добавить `manualChunks` в Vite config для разделения парсера и CodeMirror.

## Syntax Highlighting (Phase 4a)

### SimplEx Language Mode

Файл: `playground/src/simplex-language.ts`

Реализован через `StreamLanguage` из `@codemirror/language` — stream-based токенизатор, обрабатывающий текст посимвольно. Не использует Lezer-грамматику (избыточно для подсветки expression language).

Маппинг токенов на теги `@lezer/highlight`:

| Токен | Примеры | Тег |
|---|---|---|
| `keyword` | `if`, `then`, `else`, `and`, `or`, `not`, `in`, `mod`, `typeof`, `let` | `tags.keyword` |
| `atom` | `true`, `false`, `null`, `undefined`, `#` | `tags.atom` |
| `number` | `42`, `.5`, `1.2e3`, `0xFF` | `tags.number` |
| `string` | `"hello"`, `'world'` (с escape-последовательностями) | `tags.string` |
| `comment` | `// ...`, `/* ... */` | `tags.comment` |
| `operator` | `+`, `-`, `*`, `/`, `^`, `&`, `==`, `!=`, `<=`, `>=`, `\|`, `\|?`, `\|>`, `??`, `=>`, `::` | `tags.operator` |
| `variableName.special` | `%` (topic reference) | `tags.special(tags.variableName)` |
| `variableName` | идентификаторы | `tags.variableName` |

Особенности реализации:
- `tokenTable` связывает строковые имена токенов с тегами `@lezer/highlight` — без него стандартные темы (oneDark и др.) не окрашивают токены
- Многострочные комментарии `/* */` **не** поддерживают перенос между строками (ограничение stream-based подхода: `token()` вызывается построчно). Для полной поддержки нужен `state` в `StreamLanguage.define()`. Текущая реализация `startState: () => null` — stateless
- `#` (curry placeholder) — `atom`, `%` (topic reference) — `variableName.special`
- `undefined` обрабатывается как `atom` (не keyword, т.к. в SimplEx это идентификатор, а не зарезервированное слово)

### Error Highlighting

Диагностика ошибок через `@codemirror/lint`:

- `codemirror-editor.ts` — принимает `diagnostics?: { from: number; to: number; message: string }[]` prop
- Использует `setDiagnostics()` для отображения и `lintGutter()` для маркеров в гаттере
- CSS-класс `.cm-error-highlight` в `main.css` задаёт стиль (красный wavy underline + полупрозрачный фон)

`expression-editor.ts` — вычисляет диагностику из `compileResult.value.error?.location`:
- `location.offset` — позиция ошибки в исходной строке
- Подсвечивается 1 символ начиная с offset; если ошибка в конце строки (offset === длина), подсвечивается последний символ
- Диагностика пересчитывается при каждом рендере (зависит от `compileResult` signal)

### Зависимости (Phase 4a)

- `@codemirror/language` — `StreamLanguage`, `StringStream` для кастомного language mode
- `@codemirror/lint` — `setDiagnostics()`, `lintGutter()` для inline-ошибок

## Phase 4b — Documentation Tab & AST Tree View

- **Docs tab** (`docs-view.ts`): static HTML rendering of the SimplEx Language Reference (Literals, Operators, Collections, Property Access, Functions, Currying, Conditionals, Pipes, Lambdas, Let, Comments, Scope)
- **AST tree view** (`ast-tree-view.ts`): interactive collapsible tree replacing raw JSON in the AST tab
  - Recursive `TreeNode` with expand/collapse per node (root expanded by default)
  - Inline summaries: Literal→value, Identifier→name, BinaryExpression/LogicalExpression/UnaryExpression→operator
  - Handles PipeSequence.tail (non-standard AST structure), sparse arrays (null elements)
  - `ScalarNode` for primitive values, `ArrayNode` for arrays with count labels
- PWA deferred to future phase

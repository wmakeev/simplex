# SimplEx Playground

Interactive web playground for the SimplEx expression language.

## Status

- [x] Phase 1: Core (Vite + Preact/HTM + CodeMirror + compiler integration)
- [x] Phase 2: Examples, URL state, share links
- [x] Phase 3: GitHub Actions deployment workflow
- [ ] Phase 4: Documentation tab, custom syntax highlighting, AST tree view

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
- **CodeMirror 6** — code editors for expression, globals JSON, data JSON
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

~502KB / ~164KB gzip. Основные составляющие: CodeMirror (~150KB), parser (~217KB source, меньше после минификации), Preact+signals (~4KB). Для оптимизации можно добавить `manualChunks` в Vite config для разделения парсера и CodeMirror.

## Phase 4 — что планируется

- Таб с документацией языка (контент из CLAUDE.md Language Reference)
- Кастомный CodeMirror language mode для SimplEx (подсветка ключевых слов: `if`, `then`, `else`, `and`, `or`, `not`, `in`, `mod`, `typeof`, `let`, `true`, `false`, `null`)
- Визуализация AST как интерактивное дерево (не только JSON)
- PWA для оффлайн-работы
- Подсветка ошибок прямо в редакторе через CodeMirror decorations (позиция из `error.location`)

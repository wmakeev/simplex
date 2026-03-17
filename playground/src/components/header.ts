import { html } from 'htm/preact'
import { darkMode } from '../state'

export function Header() {
  const toggleTheme = () => {
    darkMode.value = !darkMode.value
  }

  return html`
    <header class="header">
      <div class="header-left">
        <div class="header-title">Simpl<span>Ex</span> Playground</div>
      </div>
      <div class="header-right">
        <a class="header-link" href="https://github.com/wmakeev/simplex" target="_blank" rel="noopener">GitHub</a>
        <button class="theme-toggle" onClick=${toggleTheme} title="Toggle theme">
          ${darkMode.value ? '\u2600\uFE0F' : '\uD83C\uDF19'}
        </button>
      </div>
    </header>
  `
}

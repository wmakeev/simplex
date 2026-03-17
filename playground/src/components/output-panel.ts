import { html } from 'htm/preact'
import { activeTab, compileResult, updateUrlHash } from '../state'
import type { OutputTab, CompileResult } from '../state'
import { DocsView } from './docs-view'
import { AstTreeView } from './ast-tree-view'

function formatResult(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'function') return '[Function]'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getResultType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function ResultView({ result }: { result: CompileResult }) {
  if (result.error) {
    return html`
      <div class="error-display">
        <div class="error-type">${result.error.type}</div>
        <div>${result.error.message}</div>
        ${result.error.location ? html`
          <div class="error-location">
            Line ${result.error.location.line}, Column ${result.error.location.column}
          </div>
        ` : null}
      </div>
    `
  }

  if (result.result === undefined && !result.generatedCode && !result.ast) {
    return html`<div class="output-content" style="color: var(--text-secondary)">Enter an expression to see the result</div>`
  }

  return html`
    <div class="output-content">
      <div class="output-result-type">${getResultType(result.result)}</div>
      <div class="output-result">${formatResult(result.result)}</div>
    </div>
  `
}

function GeneratedView({ result }: { result: CompileResult }) {
  if (!result.generatedCode) {
    return html`<div class="output-content" style="color: var(--text-secondary)">No generated code</div>`
  }
  return html`<div class="output-content">${result.generatedCode}</div>`
}

function AstView({ result }: { result: CompileResult }) {
  return html`<${AstTreeView} ast=${result.ast} />`
}

const tabs: { id: OutputTab; label: string }[] = [
  { id: 'result', label: 'Result' },
  { id: 'generated', label: 'Generated JS' },
  { id: 'ast', label: 'AST' },
  { id: 'docs', label: 'Docs' }
]

export function OutputPanel() {
  const result = compileResult.value
  const tab = activeTab.value

  const handleTabClick = (id: OutputTab) => {
    activeTab.value = id
  }

  const handleShare = () => {
    updateUrlHash()
    navigator.clipboard?.writeText(location.href)
  }

  return html`
    <div class="panel" style="display: flex; flex-direction: column">
      <div style="display: flex; align-items: center; justify-content: space-between">
        <div class="tabs">
          ${tabs.map(t => html`
            <button
              class=${'tab' + (tab === t.id ? ' active' : '')}
              onClick=${() => handleTabClick(t.id)}
            >${t.label}</button>
          `)}
        </div>
        <button class="theme-toggle" style="margin-right: 8px; font-size: 12px" onClick=${handleShare} title="Copy share link">
          Share
        </button>
      </div>
      ${tab === 'result' && html`<${ResultView} result=${result} />`}
      ${tab === 'generated' && html`<${GeneratedView} result=${result} />`}
      ${tab === 'ast' && html`<${AstView} result=${result} />`}
      ${tab === 'docs' && html`<${DocsView} />`}
    </div>
  `
}

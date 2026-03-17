import { html } from 'htm/preact'
import { CodeMirrorEditor } from './codemirror-editor'
import { expression, scheduleCompile, runCompile } from '../state'
import { examples, getCategories, getExampleById } from '../examples'
import type { Example } from '../examples'

export function ExpressionEditor({ onLoadExample }: { onLoadExample: (ex: Example) => void }) {
  const categories = getCategories()

  const handleExpressionChange = (val: string) => {
    expression.value = val
    scheduleCompile()
  }

  const handleExampleSelect = (e: Event) => {
    const id = (e.target as HTMLSelectElement).value
    if (!id) return
    const ex = getExampleById(id)
    if (ex) {
      onLoadExample(ex)
    }
    ;(e.target as HTMLSelectElement).value = ''
  }

  return html`
    <div class="panel-section" style="flex: 2">
      <div class="panel-label">
        <span>Expression</span>
        <div class="panel-label-right">
          <select class="examples-select" onChange=${handleExampleSelect}>
            <option value="">Load example...</option>
            ${categories.map(cat => html`
              <optgroup label=${cat}>
                ${examples.filter(e => e.category === cat).map(e => html`
                  <option value=${e.id}>${e.name}</option>
                `)}
              </optgroup>
            `)}
          </select>
          <span class="shortcut-hint">Ctrl+Enter</span>
        </div>
      </div>
      <${CodeMirrorEditor}
        value=${expression.value}
        onChange=${handleExpressionChange}
        language="expression"
        onCtrlEnter=${runCompile}
      />
    </div>
  `
}

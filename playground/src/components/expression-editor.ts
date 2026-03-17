import { html } from 'htm/preact'
import { CodeMirrorEditor } from './codemirror-editor'
import type { Diagnostic } from './codemirror-editor'
import { expression, compileResult, scheduleCompile, runCompile } from '../state'
import { examples, getCategories, getExampleById } from '../examples'
import type { Example } from '../examples'

function computeDiagnostics(expr: string): Diagnostic[] | undefined {
  const error = compileResult.value.error
  if (!error?.location) return undefined

  const { offset } = error.location
  // Highlight from error offset to end of current token or at least 1 char
  const from = Math.min(offset, expr.length)
  const to = Math.min(offset + 1, expr.length)
  // If from === to (error at end of input), widen to show at least the last char
  const adjustedFrom = from === to && from > 0 ? from - 1 : from

  return [{ from: adjustedFrom, to: Math.max(to, adjustedFrom + 1), message: error.message }]
}

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

  const diagnostics = computeDiagnostics(expression.value)

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
        diagnostics=${diagnostics}
      />
    </div>
  `
}

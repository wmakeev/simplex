import { html } from 'htm/preact'
import { Header } from './components/header'
import { ExpressionEditor } from './components/expression-editor'
import { JsonEditors } from './components/json-editors'
import { OutputPanel } from './components/output-panel'
import { expression, globalsJson, dataJson, useStdlib, scheduleCompile, loadFromUrl } from './state'
import { getExampleById } from './examples'
import type { Example } from './examples'
import { useEffect } from 'preact/hooks'

export function App() {
  useEffect(() => {
    // Try loading from URL hash
    const hash = location.hash.slice(1)
    if (hash.startsWith('example=')) {
      const id = hash.slice('example='.length)
      const ex = getExampleById(id)
      if (ex) {
        loadExample(ex)
        return
      }
    }
    if (!loadFromUrl()) {
      // Use default expression, run initial compile
      scheduleCompile()
    } else {
      scheduleCompile()
    }
  }, [])

  const loadExample = (ex: Example) => {
    expression.value = ex.expression
    globalsJson.value = ex.globals ?? '{}'
    dataJson.value = ex.data ?? '{}'
    if (ex.useStdlib) useStdlib.value = true
    scheduleCompile()
  }

  return html`
    <${Header} />
    <div class="main-layout">
      <div class="panel">
        <${ExpressionEditor} onLoadExample=${loadExample} />
        <${JsonEditors} />
      </div>
      <${OutputPanel} />
    </div>
  `
}

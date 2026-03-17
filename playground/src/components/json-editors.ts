import { html } from 'htm/preact'
import { CodeMirrorEditor } from './codemirror-editor'
import { globalsJson, dataJson, scheduleCompile } from '../state'

export function JsonEditors() {
  const handleGlobalsChange = (val: string) => {
    globalsJson.value = val
    scheduleCompile()
  }

  const handleDataChange = (val: string) => {
    dataJson.value = val
    scheduleCompile()
  }

  return html`
    <div class="panel-section" style="flex: 1">
      <div class="json-editors">
        <div class="json-editor-section">
          <div class="panel-label">Globals</div>
          <${CodeMirrorEditor}
            value=${globalsJson.value}
            onChange=${handleGlobalsChange}
            language="json"
          />
        </div>
        <div class="json-editor-section">
          <div class="panel-label">Data</div>
          <${CodeMirrorEditor}
            value=${dataJson.value}
            onChange=${handleDataChange}
            language="json"
          />
        </div>
      </div>
    </div>
  `
}

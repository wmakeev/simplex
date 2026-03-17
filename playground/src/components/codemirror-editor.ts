import { useEffect, useRef } from 'preact/hooks'
import { html } from 'htm/preact'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import { darkMode } from '../state'
import { simplexLanguage } from '../simplex-language'

const lightTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--bg-editor)' },
  '.cm-gutters': { backgroundColor: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }
})

export interface Diagnostic {
  from: number
  to: number
  message: string
}

interface EditorProps {
  value: string
  onChange: (value: string) => void
  language?: 'json' | 'expression'
  onCtrlEnter?: () => void
  diagnostics?: Diagnostic[]
}

export function CodeMirrorEditor({ value, onChange, language, onCtrlEnter, diagnostics }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return

    const extensions = [
      basicSetup,
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString())
        }
      }),
      EditorState.tabSize.of(2),
      lintGutter()
    ]

    if (language === 'json') {
      extensions.push(json())
    } else if (language === 'expression') {
      extensions.push(simplexLanguage())
    }

    if (onCtrlEnter) {
      extensions.push(
        keymap.of([{
          key: 'Mod-Enter',
          run: () => { onCtrlEnter(); return true }
        }])
      )
    }

    extensions.push(darkMode.value ? oneDark : lightTheme)

    const state = EditorState.create({
      doc: value,
      extensions
    })

    const view = new EditorView({
      state,
      parent: containerRef.current
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [darkMode.value])

  // Update content when value changes externally
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value }
      })
    }
  }, [value])

  // Update diagnostics
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    if (!diagnostics || diagnostics.length === 0) {
      view.dispatch(setDiagnostics(view.state, []))
      return
    }

    const cmDiagnostics = diagnostics.map(d => ({
      from: d.from,
      to: d.to,
      severity: 'error' as const,
      message: d.message
    }))

    view.dispatch(setDiagnostics(view.state, cmDiagnostics))
  }, [diagnostics])

  return html`<div class="editor-wrapper" ref=${containerRef}></div>`
}

import { useEffect, useRef } from 'preact/hooks'
import { html } from 'htm/preact'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { darkMode } from '../state'

const lightTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--bg-editor)' },
  '.cm-gutters': { backgroundColor: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }
})

interface EditorProps {
  value: string
  onChange: (value: string) => void
  language?: 'json' | 'expression'
  onCtrlEnter?: () => void
}

export function CodeMirrorEditor({ value, onChange, language, onCtrlEnter }: EditorProps) {
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
      EditorState.tabSize.of(2)
    ]

    if (language === 'json') {
      extensions.push(json())
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

  return html`<div class="editor-wrapper" ref=${containerRef}></div>`
}

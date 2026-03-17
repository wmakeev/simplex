import { signal, computed, effect } from '@preact/signals'
import { compileExpression } from './compiler-bridge'

export type OutputTab = 'result' | 'generated' | 'ast'

export const expression = signal('1 + 2')
export const globalsJson = signal('{}')
export const dataJson = signal('{}')
export const activeTab = signal<OutputTab>('result')
export const darkMode = signal(
  window.matchMedia('(prefers-color-scheme: dark)').matches
)

export interface CompileResult {
  result?: unknown
  generatedCode?: string
  ast?: unknown
  error?: { type: string; message: string; location?: { line: number; column: number; offset: number } }
}

export const compileResult = signal<CompileResult>({})

let debounceTimer: ReturnType<typeof setTimeout>

export function scheduleCompile() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runCompile, 300)
}

export function runCompile() {
  compileResult.value = compileExpression(
    expression.value,
    globalsJson.value,
    dataJson.value
  )
}

effect(() => {
  document.documentElement.dataset['theme'] = darkMode.value ? 'dark' : 'light'
})

// URL state encoding/decoding
export function encodeState(): string {
  const state = {
    e: expression.value,
    g: globalsJson.value,
    d: dataJson.value
  }
  return btoa(encodeURIComponent(JSON.stringify(state)))
}

export function decodeState(hash: string): { expression: string; globals: string; data: string } | null {
  try {
    const json = decodeURIComponent(atob(hash))
    const state = JSON.parse(json) as { e: string; g: string; d: string }
    return { expression: state.e, globals: state.g, data: state.d }
  } catch {
    return null
  }
}

export function updateUrlHash() {
  const hash = encodeState()
  history.replaceState(null, '', '#' + hash)
}

export function loadFromUrl(): boolean {
  const hash = location.hash.slice(1)
  if (!hash) return false

  // Check for named example
  if (hash.startsWith('example=')) {
    return false // handled by examples panel
  }

  const state = decodeState(hash)
  if (state) {
    expression.value = state.expression
    globalsJson.value = state.globals
    dataJson.value = state.data
    return true
  }
  return false
}

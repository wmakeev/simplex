import { render } from 'preact'
import { html } from 'htm/preact'
import { App } from './app'

render(html`<${App} />`, document.getElementById('app')!)

import { html } from 'htm/preact'
import { useState } from 'preact/hooks'

export function isAstNode(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).type === 'string'
  )
}

export function getSummary(node: Record<string, unknown>): string | null {
  switch (node.type) {
    case 'Literal':
      return JSON.stringify(node.value)
    case 'Identifier':
      return node.name as string
    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'NullishCoalescingExpression':
    case 'UnaryExpression':
      return node.operator as string
    case 'TopicReference':
      return '%'
    case 'CurryPlaceholder':
      return '#'
    default:
      return null
  }
}

const summaryKeys: Record<string, Set<string>> = {
  Literal: new Set(['value']),
  Identifier: new Set(['name']),
  BinaryExpression: new Set(['operator']),
  LogicalExpression: new Set(['operator']),
  NullishCoalescingExpression: new Set(['operator']),
  UnaryExpression: new Set(['operator', 'prefix']),
  MemberExpression: new Set(['computed', 'extension']),
}

const skipKeys = new Set(['type', 'location'])

export function getChildEntries(
  node: Record<string, unknown>
): [string, unknown][] {
  const skipped = summaryKeys[node.type as string] ?? new Set()
  return Object.entries(node).filter(
    ([key]) => !skipKeys.has(key) && !skipped.has(key)
  )
}

function ScalarNode({
  name,
  value,
}: {
  name: string
  value: unknown
}) {
  const display =
    typeof value === 'string' ? `"${value}"` : String(value)
  return html`
    <div class="ast-scalar">
      <span class="ast-prop-name">${name}: </span>${display}
    </div>
  `
}

function ArrayNode({
  name,
  items,
  defaultExpanded,
}: {
  name: string
  items: unknown[]
  defaultExpanded: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const toggle = () => setExpanded(!expanded)

  return html`
    <div>
      <div class="ast-node-header" onClick=${toggle}>
        <span class="ast-toggle">${expanded ? '▾' : '▸'}</span>
        <span class="ast-prop-name">${name}</span>
        <span class="ast-array-label">[${items.length}]</span>
      </div>
      ${expanded &&
      html`
        <div class="ast-node-children">
          ${items.map((item, i) => {
            if (item === null) {
              return html`<${ScalarNode} name=${String(i)} value=${null} />`
            }
            if (isAstNode(item)) {
              return html`<${TreeNode}
                node=${item}
                name=${String(i)}
                defaultExpanded=${false}
              />`
            }
            if (
              typeof item === 'object' &&
              item !== null &&
              !Array.isArray(item)
            ) {
              // Handle PipeSequence tail items: {operator, expression}
              return html`<${PipeTailNode}
                name=${String(i)}
                item=${item as Record<string, unknown>}
              />`
            }
            return html`<${ScalarNode} name=${String(i)} value=${item} />`
          })}
        </div>
      `}
    </div>
  `
}

function PipeTailNode({
  name,
  item,
}: {
  name: string
  item: Record<string, unknown>
}) {
  const [expanded, setExpanded] = useState(false)
  const toggle = () => setExpanded(!expanded)
  const op = item.operator as string

  return html`
    <div>
      <div class="ast-node-header" onClick=${toggle}>
        <span class="ast-toggle">${expanded ? '▾' : '▸'}</span>
        <span class="ast-prop-name">${name}</span>
        <span class="ast-node-summary">${op}</span>
      </div>
      ${expanded &&
      html`
        <div class="ast-node-children">
          <${ScalarNode} name="operator" value=${op} />
          ${isAstNode(item.expression) &&
          html`<${TreeNode}
            node=${item.expression as Record<string, unknown>}
            name="expression"
            defaultExpanded=${false}
          />`}
        </div>
      `}
    </div>
  `
}

function TreeNode({
  node,
  name,
  defaultExpanded,
}: {
  node: Record<string, unknown>
  name?: string
  defaultExpanded: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const toggle = () => setExpanded(!expanded)
  const summary = getSummary(node)
  const children = getChildEntries(node)

  return html`
    <div>
      <div class="ast-node-header" onClick=${toggle}>
        <span class="ast-toggle">${expanded ? '▾' : '▸'}</span>
        ${name != null &&
        html`<span class="ast-prop-name">${name}: </span>`}
        <span class="ast-node-type">${node.type}</span>
        ${summary != null &&
        html`<span class="ast-node-summary">${summary}</span>`}
      </div>
      ${expanded &&
      html`
        <div class="ast-node-children">
          ${children.map(([key, value]) => {
            if (isAstNode(value)) {
              return html`<${TreeNode}
                node=${value}
                name=${key}
                defaultExpanded=${false}
              />`
            }
            if (Array.isArray(value)) {
              return html`<${ArrayNode}
                name=${key}
                items=${value}
                defaultExpanded=${false}
              />`
            }
            return html`<${ScalarNode} name=${key} value=${value} />`
          })}
        </div>
      `}
    </div>
  `
}

export function AstTreeView({ ast }: { ast: unknown }) {
  if (!ast) {
    return html`<div class="output-content" style="color: var(--text-secondary)">
      No AST
    </div>`
  }

  // The AST may be wrapped in ExpressionStatement
  const root = isAstNode(ast) ? ast : null
  if (!root) {
    return html`<div class="output-content">
      <pre>${JSON.stringify(ast, null, 2)}</pre>
    </div>`
  }

  return html`
    <div class="ast-tree">
      <${TreeNode} node=${root} defaultExpanded=${true} />
    </div>
  `
}

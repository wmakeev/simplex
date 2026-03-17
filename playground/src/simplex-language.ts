import { StreamLanguage, StringStream } from '@codemirror/language'
import { tags } from '@lezer/highlight'

const keywords = new Set([
  'if', 'then', 'else', 'and', 'or', 'not', 'in', 'mod', 'typeof', 'let'
])
const atoms = new Set(['true', 'false', 'null'])

function tokenize(stream: StringStream): string | null {
  // Whitespace
  if (stream.eatSpace()) return null

  // Single-line comment
  if (stream.match('//')) {
    stream.skipToEnd()
    return 'comment'
  }

  // Multi-line comment
  if (stream.match('/*')) {
    while (!stream.eol()) {
      if (stream.match('*/')) return 'comment'
      stream.next()
    }
    return 'comment'
  }

  // Strings
  const quote = stream.peek()
  if (quote === '"' || quote === "'") {
    stream.next()
    while (!stream.eol()) {
      const ch = stream.next()
      if (ch === '\\') { stream.next(); continue }
      if (ch === quote) return 'string'
    }
    return 'string'
  }

  // Numbers: hex, decimal, scientific
  if (stream.match(/^0[xX][0-9a-fA-F]+/) ||
      stream.match(/^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/)) {
    return 'number'
  }

  // Multi-char operators
  if (stream.match('|>') || stream.match('|?') ||
      stream.match('??') || stream.match('=>') ||
      stream.match('==') || stream.match('!=') ||
      stream.match('<=') || stream.match('>=') ||
      stream.match('&&') || stream.match('||') ||
      stream.match('::')) {
    return 'operator'
  }

  // Single-char operators
  if (stream.match(/^[+\-*/^&|<>=!]/)) {
    return 'operator'
  }

  // Special: curry placeholder and topic reference
  if (stream.eat('#')) return 'atom'
  if (stream.eat('%')) return 'variableName.special'

  // Punctuation
  if (stream.match(/^[()[\]{},.:?]/)) return 'punctuation'

  // Identifiers and keywords
  if (stream.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/)) {
    const word = stream.current()
    if (keywords.has(word)) return 'keyword'
    if (atoms.has(word)) return 'atom'
    if (word === 'undefined') return 'atom'
    return 'variableName'
  }

  // Fallback
  stream.next()
  return null
}

export function simplexLanguage() {
  return StreamLanguage.define<null>({
    startState: () => null,
    token: tokenize,
    tokenTable: {
      keyword: tags.keyword,
      atom: tags.atom,
      number: tags.number,
      string: tags.string,
      comment: tags.comment,
      operator: tags.operator,
      punctuation: tags.punctuation,
      variableName: tags.variableName,
      'variableName.special': tags.special(tags.variableName)
    }
  })
}

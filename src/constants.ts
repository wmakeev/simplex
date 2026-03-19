// Topic reference token used in pipe expressions
export const TOPIC_TOKEN = '%'

// Generated variable names used in bootstrap code and visitors
export const GEN = {
  bool: 'bool',
  bop: 'bop',
  lop: 'lop',
  uop: 'uop',
  call: 'call',
  getIdentifierValue: 'getIdentifierValue',
  prop: 'prop',
  pipe: 'pipe',
  globals: 'globals',
  get: 'get',
  scope: 'scope',
  _get: '_get',
  _scope: '_scope',
  _varNames: '_varNames',
  _varValues: '_varValues',
} as const

// Semantic indices into the scope array [names, values, parent]
export const SCOPE_NAMES = 0
export const SCOPE_VALUES = 1
export const SCOPE_PARENT = 2

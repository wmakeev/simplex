// eslint-disable-next-line n/no-missing-import
import { parse } from '../parser/index.js'
import assert from 'node:assert/strict'
import { suite, test } from 'node:test'
import {
  ExpressionStatement,
  Location,
  traverse,
  VisitResult
} from '../src/index.js'

const getCode = (expression: string) => {
  const tree = parse(expression) as ExpressionStatement
  const { code } = traverse(tree)
  return code
}

suite('traverse code', () => {
  test('tokens', () => {
    assert.equal(getCode('1'), '1')
    assert.equal(getCode('"foo"'), '"foo"')
    assert.equal(getCode("'b😝r'"), '"b😝r"')
    assert.equal(getCode('null'), 'null')
    assert.equal(getCode('true'), 'true')
    assert.equal(getCode('false'), 'false')
  })

  test('operators', () => {
    assert.equal(getCode('+1'), 'uop["+"](1)')
    assert.equal(getCode('-1'), 'uop["-"](1)')
    assert.equal(getCode('-1 + 2'), 'bop["+"](uop["-"](1),2)')
    assert.equal(getCode('1 + 2 * -6'), 'bop["+"](1,bop["*"](2,uop["-"](6)))')
    assert.equal(getCode('(1 + 2) * 6'), 'bop["*"](bop["+"](1,2),6)')
  })

  test('property access', () => {
    assert.equal(getCode('a'), 'get("a")')
    assert.equal(getCode('a.b'), 'prop(get("a"),"b")')
    assert.equal(getCode('a.b["c"]'), 'prop(prop(get("a"),"b"),"c")')
    assert.equal(getCode('a["c"]'), 'prop(get("a"),"c")')
  })

  test('object', () => {
    assert.equal(getCode('{}'), '{}')
    assert.equal(getCode('{ a: 1, c: 1 + x }'), '{a:1,c:bop["+"](1,get("x"))}')
  })

  test('array', () => {
    assert.equal(getCode('[]'), '[]')
    assert.equal(getCode('[1, 2, , { a: 1 }, x]'), '[1,2,,{a:1},get("x")]')
  })

  test('conditional', () => {
    assert.equal(
      getCode('if a > 2 then "foo"'),
      '(bool(bop[">"](get("a"),2))?"foo":undefined)'
    )
    assert.equal(
      getCode(`if a > 2 then "foo" else 'bar'`),
      '(bool(bop[">"](get("a"),2))?"foo":"bar")'
    )
  })

  test('call', () => {
    assert.equal(getCode('a()'), 'call(get("a"),null)')

    assert.equal(getCode('a.b()'), 'call(prop(get("a"),"b"),null)')

    assert.equal(getCode('a.b()()'), 'call(call(prop(get("a"),"b"),null),null)')

    assert.equal(getCode('a.b().c'), 'prop(call(prop(get("a"),"b"),null),"c")')

    assert.equal(getCode('a.b()[1]'), 'prop(call(prop(get("a"),"b"),null),1)')

    assert.equal(
      getCode('a.b()[1].c'),
      'prop(prop(call(prop(get("a"),"b"),null),1),"c")'
    )

    assert.equal(
      getCode('a.b()["foo"]'),
      'prop(call(prop(get("a"),"b"),null),"foo")'
    )

    assert.equal(getCode('a(1, x, "foo")'), 'call(get("a"),[1,get("x"),"foo"])')
  })

  test('pipe', () => {
    assert.equal(
      getCode('1 | a'),
      'pipe(1,[{opt:false,next:function(_){return get("a")}}])'
    )

    assert.equal(
      getCode('1 |? a(_)'),
      'pipe(1,[{opt:true,next:function(_){return call(get("a"),[_])}}])'
    )

    assert.equal(
      getCode('1 + a | b(_)'),
      'pipe(bop["+"](1,get("a")),[{opt:false,next:function(_){return call(get("b"),[_])}}])'
    )

    assert.equal(
      getCode('1 | a(_) | b(2, _)'),
      'pipe(1,[{opt:false,next:function(_){return call(get("a"),[_])}},{opt:false,next:function(_){return call(get("b"),[2,_])}}])'
    )

    assert.equal(
      getCode('null |? add2(_) | a * _'),
      'pipe(null,[{opt:true,next:function(_){return call(get("add2"),[_])}},{opt:false,next:function(_){return bop["*"](get("a"),_)}}])'
    )
  })

  test('nullish coalescing', () => {
    assert.equal(getCode('a ?? b'), '(get("a")??get("b"))')
  })
})

const getTraverse = (expression: string) => {
  const tree = parse(expression) as ExpressionStatement
  return traverse(tree)
}

const mapCode = (expression: string, traverseResult: VisitResult) => {
  const { code, offsets } = traverseResult
  const codeMap: [codePart: string, expressionPart: string][] = []

  let codeHead = code

  const getExpressionPart = (location: Location) => {
    return expression.substring(location.start.offset, location.end.offset)
  }

  for (const { len, location } of offsets) {
    if (codeHead.length <= len) {
      codeMap.push([codeHead, getExpressionPart(location)])
      break
    }

    const codePart = codeHead.substring(0, len)
    codeHead = codeHead.substring(len)

    codeMap.push([codePart, getExpressionPart(location)])
  }

  return codeMap
}

suite('traverse offsets', () => {
  test('one token', () => {
    const { offsets } = getTraverse('1')

    assert.deepEqual(offsets, [
      {
        len: 1,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 1,
            line: 1,
            column: 2
          }
        }
      }
    ])
  })

  test('tow tokens', () => {
    const { code, offsets } = getTraverse('-1')

    assert.equal(code, 'uop["-"](1)')

    assert.deepEqual(offsets, [
      {
        len: 9,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 2,
            line: 1,
            column: 3
          }
        }
      },
      {
        len: 1,
        location: {
          start: {
            offset: 1,
            line: 1,
            column: 2
          },
          end: {
            offset: 2,
            line: 1,
            column: 3
          }
        }
      },
      {
        len: 1,
        location: {
          start: {
            offset: 0,
            line: 1,
            column: 1
          },
          end: {
            offset: 2,
            line: 1,
            column: 3
          }
        }
      }
    ])
  })

  test('tow tokens map', () => {
    const expression = '-1'
    const traverseResult = getTraverse(expression)
    const mapResult = mapCode(expression, traverseResult)

    assert.deepEqual(mapResult, [
      ['uop["-"](', '-1'],
      ['1', '1'],
      [')', '-1']
    ])
  })

  test('sum tokens map', () => {
    const expression = '-1+ 2'
    const traverseResult = getTraverse(expression)
    const mapResult = mapCode(expression, traverseResult)

    assert.deepEqual(mapResult, [
      ['bop["+"](', '-1+ 2'],
      ['uop["-"](', '-1'],
      ['1', '1'],
      [')', '-1'],
      [',', '-1+ 2'],
      ['2', '2'],
      [')', '-1+ 2']
    ])
  })

  test('complex one line tokens map', () => {
    const expression = '( -1+ 2 *4) | add(_) | (if _ > 2 then "1" else "2")'
    const traverseResult = getTraverse(expression)
    const mapResult = mapCode(expression, traverseResult)

    assert.deepEqual(mapResult, [
      ['pipe(', '( -1+ 2 *4) | add(_) | (if _ > 2 then "1" else "2")'],
      ['bop["+"](', '-1+ 2 *4'],
      ['uop["-"](', '-1'],
      ['1', '1'],
      [')', '-1'],
      [',', '-1+ 2 *4'],
      ['bop["*"](', '2 *4'],
      ['2', '2'],
      [',', '2 *4'],
      ['4', '4'],
      [')', '2 *4'],
      [')', '-1+ 2 *4'],
      [',[', '( -1+ 2 *4) | add(_) | (if _ > 2 then "1" else "2")'],
      ['{opt:false,next:function(_){return ', 'add(_)'],
      ['call(', 'add(_)'],
      ['get("add")', 'add'],
      [',', 'add(_)'],
      ['[', 'add(_)'],
      ['_', '_'],
      [']', 'add(_)'],
      [')', 'add(_)'],
      ['}}', 'add(_)'],
      [',', 'add(_)'],
      ['{opt:false,next:function(_){return ', 'if _ > 2 then "1" else "2"'],
      ['(bool(', 'if _ > 2 then "1" else "2"'],
      ['bop[">"](', '_ > 2'],
      ['_', '_'],
      [',', '_ > 2'],
      ['2', '2'],
      [')', '_ > 2'],
      [')?', 'if _ > 2 then "1" else "2"'],
      ['"1"', '"1"'],
      [':', 'if _ > 2 then "1" else "2"'],
      ['"2"', '"2"'],
      [')', 'if _ > 2 then "1" else "2"'],
      ['}}', 'if _ > 2 then "1" else "2"'],
      ['])', '( -1+ 2 *4) | add(_) | (if _ > 2 then "1" else "2")']
    ])
  })

  test('complex multiline tokens map', () => {
    const expression =
      // prettier-ignore
      [
        '(',
        '  if -a > 1 + x then',
        '    "foo" & b',
        '  else',
        '    "bar"',
        ')',
        '  | append(_, "-baz")',
        '  | _ & c'
      ].join('\n')

    const traverseResult = getTraverse(expression)
    const mapResult = mapCode(expression, traverseResult)

    assert.deepEqual(mapResult, [
      [
        'pipe(',
        '(\n  if -a > 1 + x then\n    "foo" & b\n  else\n    "bar"\n)\n  | append(_, "-baz")\n  | _ & c'
      ],
      ['(bool(', 'if -a > 1 + x then\n    "foo" & b\n  else\n    "bar"'],
      ['bop[">"](', '-a > 1 + x'],
      ['uop["-"](', '-a'],
      ['get("a")', 'a'],
      [')', '-a'],
      [',', '-a > 1 + x'],
      ['bop["+"](', '1 + x'],
      ['1', '1'],
      [',', '1 + x'],
      ['get("x")', 'x'],
      [')', '1 + x'],
      [')', '-a > 1 + x'],
      [')?', 'if -a > 1 + x then\n    "foo" & b\n  else\n    "bar"'],
      ['bop["&"](', '"foo" & b'],
      ['"foo"', '"foo"'],
      [',', '"foo" & b'],
      ['get("b")', 'b'],
      [')', '"foo" & b'],
      [':', 'if -a > 1 + x then\n    "foo" & b\n  else\n    "bar"'],
      ['"bar"', '"bar"'],
      [')', 'if -a > 1 + x then\n    "foo" & b\n  else\n    "bar"'],
      [
        ',[',
        '(\n  if -a > 1 + x then\n    "foo" & b\n  else\n    "bar"\n)\n  | append(_, "-baz")\n  | _ & c'
      ],
      ['{opt:false,next:function(_){return ', 'append(_, "-baz")'],
      ['call(', 'append(_, "-baz")'],
      ['get("append")', 'append'],
      [',', 'append(_, "-baz")'],
      ['[', 'append(_, "-baz")'],
      ['_', '_'],
      [',', 'append(_, "-baz")'],
      ['"-baz"', '"-baz"'],
      [']', 'append(_, "-baz")'],
      [')', 'append(_, "-baz")'],
      ['}}', 'append(_, "-baz")'],
      [',', 'append(_, "-baz")'],
      ['{opt:false,next:function(_){return ', '_ & c'],
      ['bop["&"](', '_ & c'],
      ['_', '_'],
      [',', '_ & c'],
      ['get("c")', 'c'],
      [')', '_ & c'],
      ['}}', '_ & c'],
      [
        '])',
        '(\n  if -a > 1 + x then\n    "foo" & b\n  else\n    "bar"\n)\n  | append(_, "-baz")\n  | _ & c'
      ]
    ])
  })
})

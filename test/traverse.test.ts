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

  test('unary operators', () => {
    assert.equal(getCode('+1'), 'uop["+"](1)')
    assert.equal(getCode('-1'), 'uop["-"](1)')
  })

  test('binary operators', () => {
    assert.equal(getCode('-1 + 2'), 'bop["+"](uop["-"](1),2)')
    assert.equal(getCode('1 + 2 * -6'), 'bop["+"](1,bop["*"](2,uop["-"](6)))')
    assert.equal(getCode('(1 + 2) * 6'), 'bop["*"](bop["+"](1,2),6)')
  })

  test('logical operators', () => {
    assert.equal(
      getCode('true and false'),
      'lop["and"](()=>(true),()=>(false))'
    )
    assert.equal(
      getCode('true and (false or true)'),
      'lop["and"](()=>(true),()=>(lop["or"](()=>(false),()=>(true))))'
    )
    assert.equal(
      getCode('true and (false or true)'),
      'lop["and"](()=>(true),()=>(lop["or"](()=>(false),()=>(true))))'
    )
    assert.equal(
      getCode('true and (1 > 2 and -3 or {})'),
      'lop["and"](()=>(true),()=>(lop["or"](()=>(lop["and"](()=>(bop[">"](1,2)),()=>(uop["-"](3)))),()=>({}))))'
    )
  })

  test('property access', () => {
    assert.equal(getCode('a'), 'get(scope,"a")')
    assert.equal(getCode('a.b'), 'prop(get(scope,"a"),"b")')
    assert.equal(getCode('a.b["c"]'), 'prop(prop(get(scope,"a"),"b"),"c")')
    assert.equal(getCode('a["c"]'), 'prop(get(scope,"a"),"c")')
  })

  test('object', () => {
    assert.equal(getCode('{}'), '{}')
    assert.equal(
      getCode('{ a: 1, c: 1 + x }'),
      '{a:1,c:bop["+"](1,get(scope,"x"))}'
    )
  })

  test('array', () => {
    assert.equal(getCode('[]'), '[]')
    assert.equal(
      getCode('[1, 2, , { a: 1 }, x]'),
      '[1,2,,{a:1},get(scope,"x")]'
    )
  })

  test('conditional', () => {
    assert.equal(
      getCode('if a > 2 then "foo"'),
      '(bool(bop[">"](get(scope,"a"),2))?"foo":undefined)'
    )
    assert.equal(
      getCode(`if a > 2 then "foo" else 'bar'`),
      '(bool(bop[">"](get(scope,"a"),2))?"foo":"bar")'
    )
  })

  test('call', () => {
    assert.equal(getCode('a()'), 'call(get(scope,"a"),null)')

    assert.equal(getCode('a.b()'), 'call(prop(get(scope,"a"),"b"),null)')

    assert.equal(
      getCode('a.b()()'),
      'call(call(prop(get(scope,"a"),"b"),null),null)'
    )

    assert.equal(
      getCode('a.b().c'),
      'prop(call(prop(get(scope,"a"),"b"),null),"c")'
    )

    assert.equal(
      getCode('a.b()[1]'),
      'prop(call(prop(get(scope,"a"),"b"),null),1)'
    )

    assert.equal(
      getCode('a.b()[1].c'),
      'prop(prop(call(prop(get(scope,"a"),"b"),null),1),"c")'
    )

    assert.equal(
      getCode('a.b()["foo"]'),
      'prop(call(prop(get(scope,"a"),"b"),null),"foo")'
    )

    assert.equal(
      getCode('a(1, x, "foo")'),
      'call(get(scope,"a"),[1,get(scope,"x"),"foo"])'
    )
  })

  test('curry call', () => {
    assert.equal(
      getCode('a(#)'),
      '(scope=>(a0)=>call(get(scope,"a"),[a0]))(scope)'
    )

    assert.equal(
      getCode('a(#, #)'),
      '(scope=>(a0,a1)=>call(get(scope,"a"),[a0,a1]))(scope)'
    )

    assert.equal(
      getCode('a(#, foo, 2 + 3, #)'),
      '(scope=>(a0,a3)=>call(get(scope,"a"),[a0,get(scope,"foo"),bop["+"](2,3),a3]))(scope)'
    )
  })

  test('pipe', () => {
    assert.equal(
      getCode('1 | a'),
      'pipe(1,[{opt:false,next:(scope=>topic=>{scope=[["%"],[topic],scope];return get(scope,"a")})(scope)}])'
    )

    assert.equal(
      getCode('1 | %'),
      'pipe(1,[{opt:false,next:(scope=>topic=>{scope=[["%"],[topic],scope];return get(scope,"%")})(scope)}])'
    )

    assert.equal(
      getCode('1 |? a(%)'),
      'pipe(1,[{opt:true,next:(scope=>topic=>{scope=[["%"],[topic],scope];return call(get(scope,"a"),[get(scope,"%")])})(scope)}])'
    )

    assert.equal(
      getCode('1 + a | b(%)'),
      'pipe(bop["+"](1,get(scope,"a")),[{opt:false,next:(scope=>topic=>{scope=[["%"],[topic],scope];return call(get(scope,"b"),[get(scope,"%")])})(scope)}])'
    )

    assert.equal(
      getCode('1 | a(%) | b(2, %)'),
      'pipe(1,[{opt:false,next:(scope=>topic=>{scope=[["%"],[topic],scope];return call(get(scope,"a"),[get(scope,"%")])})(scope)},{opt:false,next:(scope=>topic=>{scope=[["%"],[topic],scope];return call(get(scope,"b"),[2,get(scope,"%")])})(scope)}])'
    )

    assert.equal(
      getCode('null |? add2(%) | a * %'),
      'pipe(null,[{opt:true,next:(scope=>topic=>{scope=[["%"],[topic],scope];return call(get(scope,"add2"),[get(scope,"%")])})(scope)},{opt:false,next:(scope=>topic=>{scope=[["%"],[topic],scope];return bop["*"](get(scope,"a"),get(scope,"%"))})(scope)}])'
    )
  })

  test('nullish coalescing', () => {
    assert.equal(getCode('a ?? b'), '(get(scope,"a")??get(scope,"b"))')
  })

  test('lambda', () => {
    assert.equal(
      getCode('a => b'),
      '((scope,params)=>function(p0){scope=[params,[p0],scope];return get(scope,"b")})(scope,["a"])'
    )

    assert.equal(
      getCode('a => (b) => a + b + c'),
      '((scope,params)=>function(p0){scope=[params,[p0],scope];return ((scope,params)=>function(p0){scope=[params,[p0],scope];return bop["+"](bop["+"](get(scope,"a"),get(scope,"b")),get(scope,"c"))})(scope,["b"])})(scope,["a"])'
    )
  })

  test('let', () => {
    assert.equal(
      getCode('let a = 1, a'),
      '(scope=>{var _varNames=[];var _varValues=[];scope=[_varNames,_varValues,scope];_varValues.push(1);_varNames.push("a");return get(scope,"a")})(scope)'
    )

    assert.equal(
      getCode('let a = 1, b = 2 + 4, c = a + b, a + b * c'),
      '(scope=>{var _varNames=[];var _varValues=[];scope=[_varNames,_varValues,scope];_varValues.push(1);_varNames.push("a");_varValues.push(bop["+"](2,4));_varNames.push("b");_varValues.push(bop["+"](get(scope,"a"),get(scope,"b")));_varNames.push("c");return bop["+"](get(scope,"a"),bop["*"](get(scope,"b"),get(scope,"c")))})(scope)'
    )
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
    const expression = '( -1+ 2 *4) | add(%) | (if % > 2 then "1" else "2")'
    const traverseResult = getTraverse(expression)
    const mapResult = mapCode(expression, traverseResult)

    assert.deepEqual(mapResult, [
      ['pipe(', '( -1+ 2 *4) | add(%) | (if % > 2 then "1" else "2")'],
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
      [',[', '( -1+ 2 *4) | add(%) | (if % > 2 then "1" else "2")'],
      [
        '{opt:false,next:(scope=>topic=>{scope=[["%"],[topic],scope];return ',
        'add(%)'
      ],
      ['call(', 'add(%)'],
      ['get(scope,"add")', 'add'],
      [',[', 'add(%)'],
      ['get(scope,"%")', '%'],
      ['])', 'add(%)'],
      ['})(scope)}', 'add(%)'],
      [',', 'add(%)'],
      [
        '{opt:false,next:(scope=>topic=>{scope=[["%"],[topic],scope];return ',
        'if % > 2 then "1" else "2"'
      ],
      ['(bool(', 'if % > 2 then "1" else "2"'],
      ['bop[">"](', '% > 2'],
      ['get(scope,"%")', '%'],
      [',', '% > 2'],
      ['2', '2'],
      [')', '% > 2'],
      [')?', 'if % > 2 then "1" else "2"'],
      ['"1"', '"1"'],
      [':', 'if % > 2 then "1" else "2"'],
      ['"2"', '"2"'],
      [')', 'if % > 2 then "1" else "2"'],
      ['})(scope)}', 'if % > 2 then "1" else "2"'],
      ['])', '( -1+ 2 *4) | add(%) | (if % > 2 then "1" else "2")']
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
        '  | append(%, "-baz")',
        '  | % & c'
      ].join('\n')

    const traverseResult = getTraverse(expression)
    const mapResult = mapCode(expression, traverseResult)

    assert.deepEqual(mapResult, [
      [
        'pipe(',
        '(\n  if -a > 1 + x then\n    "foo" & b\n  else\n    "bar"\n)\n  | append(%, "-baz")\n  | % & c'
      ],
      ['(bool(', 'if -a > 1 + x then\n    "foo" & b\n  else\n    "bar"'],
      ['bop[">"](', '-a > 1 + x'],
      ['uop["-"](', '-a'],
      ['get(scope,"a")', 'a'],
      [')', '-a'],
      [',', '-a > 1 + x'],
      ['bop["+"](', '1 + x'],
      ['1', '1'],
      [',', '1 + x'],
      ['get(scope,"x")', 'x'],
      [')', '1 + x'],
      [')', '-a > 1 + x'],
      [')?', 'if -a > 1 + x then\n    "foo" & b\n  else\n    "bar"'],
      ['bop["&"](', '"foo" & b'],
      ['"foo"', '"foo"'],
      [',', '"foo" & b'],
      ['get(scope,"b")', 'b'],
      [')', '"foo" & b'],
      [':', 'if -a > 1 + x then\n    "foo" & b\n  else\n    "bar"'],
      ['"bar"', '"bar"'],
      [')', 'if -a > 1 + x then\n    "foo" & b\n  else\n    "bar"'],
      [
        ',[',
        '(\n  if -a > 1 + x then\n    "foo" & b\n  else\n    "bar"\n)\n  | append(%, "-baz")\n  | % & c'
      ],
      [
        '{opt:false,next:(scope=>topic=>{scope=[["%"],[topic],scope];return ',
        'append(%, "-baz")'
      ],
      ['call(', 'append(%, "-baz")'],
      ['get(scope,"append")', 'append'],
      [',[', 'append(%, "-baz")'],
      ['get(scope,"%")', '%'],
      [',', 'append(%, "-baz")'],
      ['"-baz"', '"-baz"'],
      ['])', 'append(%, "-baz")'],
      ['})(scope)}', 'append(%, "-baz")'],
      [',', 'append(%, "-baz")'],
      [
        '{opt:false,next:(scope=>topic=>{scope=[["%"],[topic],scope];return ',
        '% & c'
      ],
      ['bop["&"](', '% & c'],
      ['get(scope,"%")', '%'],
      [',', '% & c'],
      ['get(scope,"c")', 'c'],
      [')', '% & c'],
      ['})(scope)}', '% & c'],
      [
        '])',
        '(\n  if -a > 1 + x then\n    "foo" & b\n  else\n    "bar"\n)\n  | append(%, "-baz")\n  | % & c'
      ]
    ])
  })
})

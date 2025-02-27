import { suite, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ensureFunction,
  ensureNumber,
  isObject,
  isSimpleValue,
  castToBoolean,
  castToString,
  typeOf,
  unbox,
  ensureRelationalComparable
} from '../src/index.js'

suite('tools', () => {
  suite('common', () => {
    test('typeOf', () => {
      /* prettier-ignore */
      const cases = [
        [ 1                , 'number'    ],
        [ 1n               , 'bigint'    ],
        [ 'foo'            , 'string'    ],
        [ true             , 'boolean'   ],
        [ null             , 'Null'      ],
        [ undefined        , 'undefined' ],
        [ NaN              , 'NaN'       ],
        [ Infinity         , 'Infinity'  ],
        [ -Infinity        , '-Infinity' ],
        [ new Number(42)   , 'Number'    ],
        [ new String('foo'), 'String'    ],
        [ new Boolean(true), 'Boolean'   ],
        [ {}               , 'Object'    ],
        [ []               , 'Array'     ],
        [ new Error('foo') , 'Error'     ]
      ]

      cases.forEach(([from, to]) => {
        assert.equal(typeOf(from), to, `typeOf ${typeOf(from)}`)
      })
    })

    test('unbox', () => {
      const obj = {}
      const arr = [] as unknown

      const cases = [
        [1, 1],
        ['foo', 'foo'],
        [true, true],
        [new Number(42), 42],
        [new String('foo'), 'foo'],
        [new Boolean(true), true],
        [obj, obj],
        [arr, arr]
      ]

      cases.forEach(([from, to]) => {
        assert.equal(unbox(from), to, `${typeOf(from)} unboxed to ${to}`)
      })
    })
  })

  suite('cast', () => {
    test('castToBoolean', () => {
      /* prettier-ignore */
      const cases: [unknown, boolean][] = [
        [ 1                , true  ],
        [ 0                , false ],
        [ 1n               , true  ],
        [ 'foo'            , true  ],
        [ ''               , false ],
        [ true             , true  ],
        [ false            , false ],
        [ null             , false ],
        [ undefined        , false ],
        [ NaN              , false ],
        [ Infinity         , true  ],
        [ -Infinity        , true  ],
        [ new Number(42)   , true  ],
        [ new String('foo'), true  ],
        [ new Boolean(true), true  ],
        [ {}               , true  ],
        [ []               , true  ],
        [ new Error('foo') , true  ]
      ]

      cases.forEach(([from, to]) => {
        assert.equal(castToBoolean(from), to, `castToBoolean(${from}) -> ${to}`)
      })
    })

    test('castToString', () => {
      /* prettier-ignore */
      const cases: [unknown, string | null][] = [
        // castable
        [ 1                , '1'         ],
        [ 1.2              , '1.2'       ],
        [ 0                , '0'         ],
        [ 1n               , '1'         ],
        [ 'foo'            , 'foo'       ],
        [ ''               , ''          ],
        [ true             , 'true'      ],
        [ false            , 'false'     ],
        [ null             , 'null'      ],
        [ undefined        , 'undefined' ],
        [ NaN              , 'NaN'       ],
        [ Infinity         , 'Infinity'  ],
        [ -Infinity        , '-Infinity' ],
        [ new Number(42)   , '42'        ],
        [ new String('foo'), 'foo'       ],
        [ new Boolean(true), 'true'      ],

        // not castable
        [ {}               , '[object Object]'   ],
        [ []               , '[object Array]'    ],
        [ new Error('foo') , '[object Error]'    ],
        [ () => true       , '[object Function]' ]
      ]

      cases.forEach(([from, to]) => {
        assert.equal(castToString(from), to, `castToString(${from}) -> ${to}`)
      })
    })
  })

  suite('ensure', () => {
    test('ensureFunction', () => {
      const fn = () => 'ok'
      assert.equal(ensureFunction(fn), fn)

      assert.throws(() => {
        ensureFunction(1)
      })

      assert.throws(() => {
        ensureFunction({})
      })

      assert.throws(() => {
        ensureFunction([])
      })
    })

    test('ensureNumber', () => {
      assert.equal(ensureNumber(1), 1)
      assert.equal(ensureNumber(12345n), 12345n)
      assert.equal(ensureNumber(new Number(42)), 42)

      assert.throws(() => {
        ensureNumber(NaN)
      })

      assert.throws(() => {
        ensureNumber(Infinity)
      })

      assert.throws(() => {
        ensureNumber('123')
      })

      assert.throws(() => {
        ensureNumber({})
      })
    })

    test('ensureRelationalComparable', () => {
      /* prettier-ignore */
      const cases: [unknown, boolean][] = [
        [ 1                , true  ],
        [ 1n               , true  ],
        [ 'foo'            , true  ],
        [ ''               , true  ],
        [ Infinity         , true  ],
        [ -Infinity        , true  ],

        [ new Boolean(true), false ],
        [ NaN              , false ],
        [ null             , false ],
        [ undefined        , false ],
        [ true             , false ],
        [ {}               , false ],
        [ []               , false ],
        [ new Error('foo') , false ]
      ]

      assert.equal(ensureRelationalComparable(new Number(42)), 42)
      assert.equal(ensureRelationalComparable(new String('foo')), 'foo')

      cases.forEach(([from, to]) => {
        if (to === true) {
          assert.equal(
            ensureRelationalComparable(from),
            from,
            `ensureRelationalComparable(${typeOf(from)}) should return same value`
          )
        } else {
          assert.throws(() => {
            ensureRelationalComparable(from)
          })
        }
      })
    })
  })

  suite('guards', () => {
    test('isObject', () => {
      const objects = [{}]

      objects.forEach(it => {
        assert.equal(isObject({}), true, `${typeOf(it)} is Object`)
      })

      const notObjects = [
        1,
        'str',
        true,
        null,
        undefined,
        [],
        () => true,
        new Error('foo'),
        new Number(42),
        new String('foo'),
        new Boolean(true)
      ]

      notObjects.forEach(it => {
        assert.equal(isObject({}), true, `${typeOf(it)} is not Object`)
      })
    })

    test('isSimpleValue', () => {
      /* prettier-ignore */
      const cases: [unknown, boolean][] = [
        [1                , true  ],
        [1n               , true  ],
        ['foo'            , true  ],
        [''               , true  ],
        [true             , true  ],
        [null             , true  ],
        [undefined        , true  ],
        [NaN              , true  ],
        [Infinity         , true  ],
        [-Infinity        , true  ],
        [new Number(42)   , true  ],
        [new String('foo'), true  ],
        [new Boolean(true), true  ],

        [{}               , false ],
        [[]               , false ],
        [new Error('foo') , false ]
      ]

      cases.forEach(([from, to]) => {
        assert.equal(
          isSimpleValue(from),
          to,
          `isSimpleValue(${from}) should return ${to}`
        )
      })
    })
  })
})

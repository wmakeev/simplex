import { suite, test } from 'node:test'
import assert from 'node:assert/strict'
import { UnexpectedTypeError } from '../../src/errors.js'
import { arr } from '../../src/stdlib/arr.js'

suite('stdlib/arr', () => {
  test('toString', () => {
    assert.equal(arr.toString([1, 2, 3]), '1,2,3')
    assert.equal(arr.toString([]), '')
  })

  test('toString throws for non-array', () => {
    assert.throws(() => arr.toString('not array'), UnexpectedTypeError)
  })

  test('length', () => {
    assert.equal(arr.length([1, 2, 3]), 3)
    assert.equal(arr.length([]), 0)
  })

  test('map', () => {
    assert.deepEqual(
      arr.map([1, 2, 3], (x: number) => x * 2),
      [2, 4, 6]
    )
  })

  test('filter', () => {
    assert.deepEqual(
      arr.filter([1, 2, 3, 4], (x: number) => x > 2),
      [3, 4]
    )
  })

  test('find/findIndex', () => {
    assert.equal(
      arr.find([1, 2, 3], (x: number) => x > 1),
      2
    )
    assert.equal(
      arr.findIndex([1, 2, 3], (x: number) => x > 1),
      1
    )
  })

  test('every/some', () => {
    assert.equal(arr.every([2, 4, 6], (x: number) => x % 2 === 0), true)
    assert.equal(arr.some([1, 2, 3], (x: number) => x > 2), true)
    assert.equal(arr.some([1, 2, 3], (x: number) => x > 5), false)
  })

  test('reduce', () => {
    assert.equal(arr.reduce([1, 2, 3], (a: number, b: number) => a + b), 6)
  })

  test('fold', () => {
    assert.equal(arr.fold([1, 2, 3], (a: number, b: number) => a + b, 0), 6)
    assert.equal(arr.fold([1, 2, 3], (a: number, b: number) => a + b, 10), 16)
  })

  test('reduceRight', () => {
    assert.equal(
      arr.reduceRight(['a', 'b', 'c'], (a: string, b: string) => a + b),
      'cba'
    )
  })

  test('foldRight', () => {
    assert.equal(
      arr.foldRight(['a', 'b', 'c'], (a: string, b: string) => a + b, ''),
      'cba'
    )
  })

  test('flat/flatMap', () => {
    assert.deepEqual(arr.flat([[1], [2, 3]]), [1, 2, 3])
    assert.deepEqual(arr.flat([[1, [2]], [3]], 2), [1, 2, 3])
    assert.deepEqual(
      arr.flatMap([1, 2], (x: number) => [x, x * 2]),
      [1, 2, 2, 4]
    )
  })

  test('includes/indexOf/lastIndexOf', () => {
    assert.equal(arr.includes([1, 2, 3], 2), true)
    assert.equal(arr.includes([1, 2, 3], 4), false)
    assert.equal(arr.indexOf([1, 2, 3], 2), 1)
    assert.equal(arr.lastIndexOf([1, 2, 1], 1), 2)
  })

  test('slice', () => {
    assert.deepEqual(arr.slice([1, 2, 3, 4], 1, 3), [2, 3])
  })

  test('join', () => {
    assert.equal(arr.join([1, 2, 3], '-'), '1-2-3')
    assert.equal(arr.join([1, 2, 3]), '1,2,3')
  })

  test('concat', () => {
    assert.deepEqual(arr.concat([1], [2], [3]), [1, 2, 3])
  })

  test('from/of', () => {
    assert.deepEqual(arr.from('abc'), ['a', 'b', 'c'])
    assert.deepEqual(arr.of(1, 2, 3), [1, 2, 3])
  })

  test('at', () => {
    assert.equal(arr.at([1, 2, 3], -1), 3)
    assert.equal(arr.at([1, 2, 3], 0), 1)
  })

  suite('immutability', () => {
    test('sort does not mutate original', () => {
      const original = [3, 1, 2]
      const sorted = arr.sort(original) as number[]
      assert.deepEqual(sorted, [1, 2, 3])
      assert.deepEqual(original, [3, 1, 2])
    })

    test('sort with comparator', () => {
      const sorted = arr.sort([3, 1, 2], (a: number, b: number) => b - a)
      assert.deepEqual(sorted, [3, 2, 1])
    })

    test('reverse does not mutate original', () => {
      const original = [1, 2, 3]
      const reversed = arr.reverse(original)
      assert.deepEqual(reversed, [3, 2, 1])
      assert.deepEqual(original, [1, 2, 3])
    })

    test('fill does not mutate original', () => {
      const original = [1, 2, 3]
      const filled = arr.fill(original, 0)
      assert.deepEqual(filled, [0, 0, 0])
      assert.deepEqual(original, [1, 2, 3])
    })
  })

  suite('tier 3 guards', () => {
    test('throws UnexpectedTypeError for non-array', () => {
      assert.throws(() => arr.length('abc'), UnexpectedTypeError)
      assert.throws(() => arr.map('abc', (x: unknown) => x), UnexpectedTypeError)
      assert.throws(() => arr.sort(42), UnexpectedTypeError)
    })
  })
})

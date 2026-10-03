import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TYPES,
  IDENTITY,
  simulate,
  correct,
  applyMatrix,
  multiply,
  deltaE,
  colorName,
  toHex,
} from '../src/engine/index.js'

const ZERO = [0, 0, 0]

function close(a, b, eps = 1e-6) {
  assert.equal(a.length, b.length)
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, `index ${i}: ${v} vs ${b[i]}`))
}

test('simulate is the identity at severity 0 for every type', () => {
  for (const type of TYPES) close(simulate(type, 0), IDENTITY)
})

test('every simulate matrix has rows that sum to 1', () => {
  for (const type of TYPES) {
    for (const severity of [0, 0.25, 0.5, 0.75, 1]) {
      const m = simulate(type, severity)
      for (let row = 0; row < 3; row++) {
        const sum = m[row * 3] + m[row * 3 + 1] + m[row * 3 + 2]
        assert.ok(Math.abs(sum - 1) < 1e-4, `${type} ${severity} row ${row}: ${sum}`)
      }
    }
  }
})

test('correct leaves colors unchanged at severity 0 for every type', () => {
  for (const type of TYPES) {
    const { matrix, offset } = correct(type, 0)
    assert.deepEqual(applyMatrix(matrix, offset, [200, 30, 30]), [200, 30, 30])
  }
})

function separation(type, severity, a, b, corrected) {
  const s = simulate(type, severity)
  const c = correct(type, severity)
  const see = (rgb) => applyMatrix(s, ZERO, corrected ? applyMatrix(c.matrix, c.offset, rgb) : rgb)
  return deltaE(see(a), see(b))
}

test('deutan correction pulls a red-green pair apart', () => {
  const a = [200, 60, 40]
  const b = [110, 130, 40]
  assert.ok(separation('deutan', 1, a, b, false) < deltaE(a, b))
  assert.ok(separation('deutan', 1, a, b, true) > separation('deutan', 1, a, b, false))
})

test('protan correction pulls a red-green pair apart', () => {
  const a = [200, 60, 40]
  const b = [110, 130, 40]
  assert.ok(separation('protan', 1, a, b, true) > separation('protan', 1, a, b, false))
})

test('tritan correction pulls a blue-green pair apart', () => {
  const a = [60, 90, 200]
  const b = [60, 150, 120]
  assert.ok(separation('tritan', 1, a, b, false) < deltaE(a, b))
  assert.ok(separation('tritan', 1, a, b, true) > separation('tritan', 1, a, b, false))
})

test('achroma correction raises contrast between two grays', () => {
  const a = [100, 100, 100]
  const b = [150, 150, 150]
  assert.ok(separation('achroma', 1, a, b, true) > separation('achroma', 1, a, b, false))
})

test('applyMatrix clamps to 0..255', () => {
  assert.deepEqual(applyMatrix(Array(9).fill(2), ZERO, [200, 200, 200]), [255, 255, 255])
  assert.deepEqual(applyMatrix(Array(9).fill(-1), ZERO, [200, 200, 200]), [0, 0, 0])
  assert.deepEqual(applyMatrix(IDENTITY, [1, -1, 0], [100, 100, 100]), [255, 0, 100])
})

test('severity outside 0..1 and NaN are clamped', () => {
  close(simulate('deutan', 5), simulate('deutan', 1))
  close(simulate('deutan', -3), IDENTITY)
  close(simulate('deutan', NaN), IDENTITY)
  close(correct('protan', 9).matrix, correct('protan', 1).matrix)
})

test('an unknown type behaves as no deficiency', () => {
  close(simulate('blue', 1), IDENTITY)
  close(correct('blue', 1).matrix, IDENTITY)
})

test('multiply composes matrices', () => {
  close(multiply(IDENTITY, simulate('tritan', 1)), simulate('tritan', 1))
  close(multiply([2, 0, 0, 0, 2, 0, 0, 0, 2], [1, 2, 3, 4, 5, 6, 7, 8, 9]), [2, 4, 6, 8, 10, 12, 14, 16, 18])
})

test('deltaE', () => {
  assert.equal(deltaE([10, 20, 30], [10, 20, 30]), 0)
  assert.ok(Math.abs(deltaE([0, 0, 0], [255, 255, 255]) - 100) < 0.5)
})

test('colorName gives everyday names to well-known colors', () => {
  const table = [
    [[255, 0, 0], 'red'],
    [[128, 0, 0], 'dark red'],
    [[0, 0, 0], 'black'],
    [[255, 255, 255], 'white'],
    [[128, 128, 128], 'gray'],
    [[64, 64, 64], 'dark gray'],
    [[211, 211, 211], 'light gray'],
    [[0, 255, 0], 'green'],
    [[0, 128, 0], 'dark green'],
    [[0, 0, 255], 'blue'],
    [[0, 0, 128], 'dark blue'],
    [[135, 206, 235], 'light blue'],
    [[255, 255, 0], 'yellow'],
    [[255, 165, 0], 'orange'],
    [[150, 75, 0], 'brown'],
    [[210, 180, 140], 'tan'],
    [[128, 128, 0], 'olive'],
    [[255, 192, 203], 'pink'],
    [[255, 105, 180], 'pink'],
    [[128, 0, 128], 'purple'],
    [[75, 0, 130], 'dark purple'],
    [[255, 0, 255], 'magenta'],
    [[0, 255, 255], 'cyan'],
    [[0, 128, 128], 'teal'],
  ]
  for (const [rgb, name] of table) assert.equal(colorName(rgb), name, rgb.join(','))
})

test('colorName tells apart the colors used in red and green signals', () => {
  // The pairs a red-green color blind person most needs named correctly.
  assert.equal(colorName([224, 49, 49]), 'red')
  assert.equal(colorName([47, 158, 68]), 'green')
  assert.equal(colorName([63, 163, 77]), 'green')
  assert.equal(colorName([209, 69, 59]), 'red')
  assert.equal(colorName([240, 140, 0]), 'orange')
  assert.equal(colorName([245, 196, 0]), 'yellow')
  assert.equal(colorName([141, 85, 36]), 'brown')
})

test('colorName always returns a name, for every color', () => {
  for (let r = 0; r < 256; r += 17) {
    for (let g = 0; g < 256; g += 17) {
      for (let b = 0; b < 256; b += 17) {
        const name = colorName([r, g, b])
        assert.ok(typeof name === 'string' && name.length > 2, `${r},${g},${b}: ${name}`)
      }
    }
  }
})

test('toHex is the exact color', () => {
  assert.equal(toHex([224, 49, 49]), '#E03131')
  assert.equal(toHex([0, 0, 0]), '#000000')
  assert.equal(toHex([255, 255, 255]), '#FFFFFF')
  assert.equal(toHex([1, 2, 3]), '#010203')
})

// ---- Boost ----------------------------------------------------------------

test('boost of 1, or none given, is the standard correction', () => {
  for (const type of TYPES) close(correct(type, 0.8, 1).matrix, correct(type, 0.8).matrix)
})

test('boost pushes confusable colors further apart', () => {
  const red = [224, 49, 49]
  const green = [47, 158, 68]
  for (const type of ['deutan', 'protan']) {
    const s = simulate(type, 1)
    const apart = (boost) => {
      const c = correct(type, 1, boost)
      const see = (rgb) => applyMatrix(s, ZERO, applyMatrix(c.matrix, c.offset, rgb))
      return deltaE(see(red), see(green))
    }
    assert.ok(apart(2) > apart(1) + 10, `${type}: ${apart(1)} then ${apart(2)}`)
    assert.ok(apart(3) > apart(2), type)
  }
})

test('boost leaves grays gray, so text and backgrounds keep their look', () => {
  for (const type of ['protan', 'deutan', 'tritan']) {
    const c = correct(type, 1, 3)
    for (const gray of [[0, 0, 0], [128, 128, 128], [255, 255, 255]]) {
      const out = applyMatrix(c.matrix, c.offset, gray)
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(out[i] - gray[i]) <= 1, `${type} ${gray}: ${out}`)
    }
  }
})

test('boost does nothing at severity 0', () => {
  for (const type of TYPES) {
    const c = correct(type, 0, 3)
    assert.deepEqual(applyMatrix(c.matrix, c.offset, [200, 30, 30]), [200, 30, 30])
  }
})

test('boost outside 1..3 and non-numbers are clamped', () => {
  close(correct('deutan', 1, 99).matrix, correct('deutan', 1, 3).matrix)
  close(correct('deutan', 1, -4).matrix, correct('deutan', 1, 1).matrix)
  close(correct('deutan', 1, NaN).matrix, correct('deutan', 1, 1).matrix)
  close(correct('deutan', 1, 'lots').matrix, correct('deutan', 1, 1).matrix)
})

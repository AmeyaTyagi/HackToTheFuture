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

test('colorName', () => {
  const table = [
    [[255, 0, 0], 'red'],
    [[120, 0, 0], 'dark red'],
    [[0, 0, 0], 'black'],
    [[255, 255, 255], 'white'],
    [[128, 128, 128], 'gray'],
    [[0, 128, 0], 'green'],
    [[0, 0, 255], 'blue'],
    [[255, 255, 0], 'yellow'],
    [[150, 75, 0], 'brown'],
  ]
  for (const [rgb, name] of table) assert.equal(colorName(rgb), name, rgb.join(','))
})

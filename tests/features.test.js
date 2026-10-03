import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  plateColors,
  findConflicts,
  simulate,
  correct,
  applyMatrix,
  recolor,
  deltaE,
} from '../src/engine/index.js'

const ZERO = [0, 0, 0]

// ---- Conflict finder ------------------------------------------------------

function image(width, height, colorAt) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y)
      pixels.set([r, g, b, 255], (y * width + x) * 4)
    }
  }
  return pixels
}

// A pair a deuteranope confuses, taken from the easiest deutan test plate.
const plate = plateColors('deutan', 0)

test('finds the conflict in a two-color image the user cannot tell apart', () => {
  const pixels = image(40, 20, (x) => (x < 20 ? plate.figure : plate.background))
  const { colors, pairs, labels } = findConflicts(pixels, 40, 20, 'deutan', 1)
  assert.equal(colors.length, 2)
  assert.equal(pairs.length, 1)
  assert.notEqual(labels[0], 255)
  assert.notEqual(labels[39], 255)
  assert.notEqual(labels[0], labels[39])
})

test('the same image is no conflict for a person who can see the difference', () => {
  const pixels = image(40, 20, (x) => (x < 20 ? plate.figure : plate.background))
  assert.equal(findConflicts(pixels, 40, 20, 'deutan', 0).pairs.length, 0)
})

test('red and blue are no conflict for deutan', () => {
  const pixels = image(40, 20, (x) => (x < 20 ? [220, 30, 30] : [30, 30, 220]))
  const { pairs, labels } = findConflicts(pixels, 40, 20, 'deutan', 1)
  assert.equal(pairs.length, 0)
  assert.ok(labels.every((v) => v === 255))
})

test('a flat image has no conflicts', () => {
  const pixels = image(30, 30, () => [120, 120, 120])
  const { colors, pairs } = findConflicts(pixels, 30, 30, 'protan', 1)
  assert.equal(colors.length, 1)
  assert.equal(pairs.length, 0)
})

test('an empty or truncated image has no conflicts and does not throw', () => {
  assert.deepEqual(findConflicts(new Uint8ClampedArray(0), 0, 0, 'deutan', 1).pairs, [])
  assert.deepEqual(findConflicts(new Uint8ClampedArray(8), 10, 10, 'deutan', 1).pairs, [])
})

test('slight shading of one color is not split into several colors', () => {
  const pixels = image(40, 20, (x, y) => [200 + (x % 4), 40 + (y % 4), 40])
  assert.equal(findConflicts(pixels, 40, 20, 'deutan', 1).colors.length, 1)
})

// ---- recolor --------------------------------------------------------------

test('recolor matches applyMatrix pixel by pixel and keeps alpha', () => {
  const c = correct('deutan', 1)
  const s = { matrix: simulate('deutan', 1) }
  const pixels = new Uint8ClampedArray([200, 60, 40, 255, 10, 250, 90, 128])
  const out = recolor(pixels, [c, s])
  const expected = (rgb) => applyMatrix(s.matrix, ZERO, applyMatrix(c.matrix, c.offset, rgb))
  assert.deepEqual([...out.slice(0, 3)], expected([200, 60, 40]))
  assert.deepEqual([...out.slice(4, 7)], expected([10, 250, 90]))
  assert.equal(out[3], 255)
  assert.equal(out[7], 128)
  assert.deepEqual([...pixels.slice(0, 3)], [200, 60, 40])
})

test('red and green are a conflict for deutan and protan but not tritan', () => {
  const pixels = image(40, 20, (x) => (x < 20 ? [224, 49, 49] : [47, 158, 68]))
  assert.equal(findConflicts(pixels, 40, 20, 'deutan', 1).pairs.length, 1)
  assert.equal(findConflicts(pixels, 40, 20, 'protan', 1).pairs.length, 1)
  assert.equal(findConflicts(pixels, 40, 20, 'tritan', 1).pairs.length, 0)
})

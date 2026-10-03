import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PLATES,
  scoreTest,
  findConflicts,
  simulate,
  correct,
  applyMatrix,
  recolor,
  deltaE,
} from '../src/engine/index.js'

const ZERO = [0, 0, 0]

function answersWithMisses(missed) {
  const answers = {}
  for (const plate of PLATES) answers[plate.id] = missed.includes(plate.id) ? null : String(plate.digit)
  return answers
}

// ---- Vision test ----------------------------------------------------------

test('there are ten plates: one control and three per axis', () => {
  assert.equal(PLATES.length, 10)
  assert.equal(PLATES[0].axis, 'control')
  for (const axis of ['protan', 'deutan', 'tritan']) {
    assert.equal(PLATES.filter((plate) => plate.axis === axis).length, 3)
  }
  assert.equal(new Set(PLATES.map((plate) => plate.id)).size, 10)
})

test('plate colors are valid screen colors', () => {
  for (const plate of PLATES) {
    for (const v of [...plate.figure, ...plate.background]) {
      assert.ok(Number.isInteger(v) && v >= 0 && v <= 255, `${plate.id}: ${v}`)
    }
  }
})

test('each plate is visible to normal vision and hidden from its own axis', () => {
  for (const plate of PLATES.filter((p) => p.axis !== 'control')) {
    const normal = deltaE(plate.figure, plate.background)
    const s = simulate(plate.axis, 1)
    const hidden = deltaE(applyMatrix(s, ZERO, plate.figure), applyMatrix(s, ZERO, plate.background))
    assert.ok(normal > 10, `${plate.id} normal ${normal}`)
    assert.ok(hidden < 12, `${plate.id} hidden ${hidden}`)
    assert.ok(hidden < normal / 4, `${plate.id} ratio`)
  }
})

test('the control plate is visible to every type', () => {
  const control = PLATES[0]
  for (const type of ['protan', 'deutan', 'tritan', 'achroma']) {
    const s = simulate(type, 1)
    const seen = deltaE(applyMatrix(s, ZERO, control.figure), applyMatrix(s, ZERO, control.background))
    assert.ok(seen > 40, `${type}: ${seen}`)
  }
})

test('all correct answers report no deficiency', () => {
  assert.deepEqual(scoreTest(answersWithMisses([])), { status: 'none' })
})

test('a wrong control answer cannot be scored', () => {
  assert.deepEqual(scoreTest(answersWithMisses(['control'])), { status: 'invalid' })
})

test('misses set type and severity', () => {
  assert.deepEqual(scoreTest(answersWithMisses(['deutan-1', 'deutan-2'])), {
    status: 'ok',
    type: 'deutan',
    severity: 0.7,
  })
  assert.deepEqual(scoreTest(answersWithMisses(['tritan-1', 'tritan-2', 'tritan-3'])), {
    status: 'ok',
    type: 'tritan',
    severity: 1,
  })
  assert.deepEqual(scoreTest(answersWithMisses(['protan-1'])), { status: 'ok', type: 'protan', severity: 0.4 })
})

test('ties go to deutan, then protan', () => {
  assert.equal(scoreTest(answersWithMisses(['protan-1', 'deutan-1'])).type, 'deutan')
  assert.equal(scoreTest(answersWithMisses(['protan-1', 'tritan-1'])).type, 'protan')
})

test('empty, non-digit and missing answers count as misses, never as errors', () => {
  const answers = answersWithMisses([])
  answers['deutan-1'] = ''
  answers['deutan-2'] = 'x'
  delete answers['deutan-3']
  assert.deepEqual(scoreTest(answers), { status: 'ok', type: 'deutan', severity: 1 })
  assert.deepEqual(scoreTest(null), { status: 'invalid' })
  assert.deepEqual(scoreTest(undefined), { status: 'invalid' })
})

test('answers with surrounding spaces or as numbers are accepted', () => {
  const answers = answersWithMisses([])
  answers.control = ' 8 '
  answers['deutan-1'] = PLATES.find((p) => p.id === 'deutan-1').digit
  assert.deepEqual(scoreTest(answers), { status: 'none' })
})

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

// A pair a deuteranope confuses, taken from a test plate.
const plate = PLATES.find((p) => p.id === 'deutan-3')

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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AXES,
  LADDER,
  CONTROL,
  TOTAL_PLATES,
  plateColors,
  rgbToLms,
  createTest,
  scoreThresholds,
  simulate,
  applyMatrix,
  deltaE,
} from '../src/engine/index.js'

const ZERO = [0, 0, 0]

// Plays a whole test. canRead(plate) says whether this person reads a plate.
function play(canRead) {
  const run = createTest()
  let shown = 0
  for (let plate = run.next(); plate; plate = run.next()) {
    shown++
    run.answer(canRead(plate))
  }
  return { result: run.result(), shown }
}

test('each plate changes one cone response and leaves the other two alone', () => {
  for (const axis of AXES) {
    const cone = AXES.indexOf(axis)
    for (let level = 0; level < LADDER.length; level++) {
      const { figure, background } = plateColors(axis, level)
      const a = rgbToLms(figure)
      const b = rgbToLms(background)
      const change = a.map((v, i) => Math.abs(v - b[i]) / ((v + b[i]) / 2))
      for (let i = 0; i < 3; i++) {
        if (i === cone) assert.ok(change[i] > 0.04, `${axis} ${level}: own cone changes ${change[i]}`)
        // Rounding to whole color values leaves under 1% on the others.
        else assert.ok(change[i] < 0.01, `${axis} ${level}: cone ${i} changes ${change[i]}`)
      }
    }
  }
})

test('plates match the difficulty ladder for normal vision, the same on every axis', () => {
  for (const axis of AXES) {
    LADDER.forEach((target, level) => {
      const { figure, background } = plateColors(axis, level)
      assert.ok(Math.abs(deltaE(figure, background) - target) < 1.5, `${axis} ${level}`)
    })
  }
})

test('plate colors are valid screen colors, away from the limits', () => {
  for (const axis of AXES) {
    for (let level = 0; level < LADDER.length; level++) {
      const { figure, background } = plateColors(axis, level)
      for (const v of [...figure, ...background]) {
        assert.ok(Number.isInteger(v) && v > 10 && v < 245, `${axis} ${level}: ${v}`)
      }
    }
  }
})

test('red-green plates are hidden from the matching simulated vision', () => {
  for (const axis of ['protan', 'deutan']) {
    const s = simulate(axis, 1)
    for (let level = 0; level < LADDER.length; level++) {
      const { figure, background } = plateColors(axis, level)
      const hidden = deltaE(applyMatrix(s, ZERO, figure), applyMatrix(s, ZERO, background))
      assert.ok(hidden < 5, `${axis} ${level}: ${hidden}`)
    }
  }
})

test('the control plate is visible to every type', () => {
  for (const type of ['protan', 'deutan', 'tritan', 'achroma']) {
    const s = simulate(type, 1)
    const seen = deltaE(applyMatrix(s, ZERO, CONTROL.figure), applyMatrix(s, ZERO, CONTROL.background))
    assert.ok(seen > 40, `${type}: ${seen}`)
  }
})

test('the test shows one control plate then seven per axis', () => {
  assert.equal(play(() => true).shown, TOTAL_PLATES)
  assert.equal(TOTAL_PLATES, 22)
  assert.equal(createTest().next().axis, 'control')
})

test('plates are numbered from 1 to the total', () => {
  const run = createTest()
  const numbers = []
  for (let plate = run.next(); plate; plate = run.next()) {
    numbers.push(plate.number)
    run.answer(true)
  }
  assert.deepEqual(numbers, Array.from({ length: TOTAL_PLATES }, (_, i) => i + 1))
})

test('reading every plate reports no deficiency', () => {
  assert.equal(play(() => true).result.status, 'none')
})

test('one slip does not turn normal vision into a deficiency', () => {
  for (let slip = 2; slip <= TOTAL_PLATES; slip++) {
    let count = 0
    const { result } = play(() => ++count !== slip)
    assert.equal(result.status, 'none', `slip on plate ${slip}`)
  }
})

test('missing the control plate ends the test as unscorable', () => {
  const { result, shown } = play(() => false)
  assert.equal(result.status, 'invalid')
  assert.equal(shown, 1)
})

test('a person who cannot see one axis at all gets that type at full strength', () => {
  for (const axis of AXES) {
    const { result } = play((plate) => plate.axis !== axis)
    assert.equal(result.status, 'ok')
    assert.equal(result.type, axis)
    assert.equal(result.severity, 1)
  }
})

test('a higher threshold on an axis gives a milder result than a lower one', () => {
  // Reads deutan plates only up to a given level of difficulty.
  const upTo = (limit) => play((plate) => plate.axis !== 'deutan' || plate.level <= limit).result
  const mild = upTo(3)
  const strong = upTo(0)
  assert.equal(mild.type, 'deutan')
  assert.equal(strong.type, 'deutan')
  assert.ok(mild.severity < strong.severity, `${mild.severity} vs ${strong.severity}`)
  assert.ok(mild.severity >= 0.2 && strong.severity < 1)
})

test('equal red-green thresholds are reported as deutan, the more common type', () => {
  assert.equal(scoreThresholds({ protan: 1, deutan: 1, tritan: 6 }).type, 'deutan')
  assert.equal(scoreThresholds({ protan: 0, deutan: 1, tritan: 6 }).type, 'protan')
  assert.equal(scoreThresholds({ protan: 6, deutan: 6, tritan: 2 }).type, 'tritan')
})

test('severity stays between 20% and 100% and normal thresholds score as none', () => {
  assert.deepEqual(scoreThresholds({ protan: 6, deutan: 6, tritan: 6 }), { status: 'none' })
  assert.deepEqual(scoreThresholds({ protan: 6, deutan: 4.5, tritan: 6 }), { status: 'none' })
  assert.equal(scoreThresholds({ protan: 6, deutan: -1, tritan: 6 }).severity, 1)
  assert.equal(scoreThresholds({ protan: 6, deutan: 4.25, tritan: 6 }).severity, 0.25)
})

test('anything but true counts as a miss', () => {
  const run = createTest()
  run.answer(true)
  for (const value of [undefined, null, 'yes', 1, false, undefined, null]) {
    assert.equal(run.next().axis, 'protan')
    run.answer(value)
    run.answer(true)
    run.answer(true)
  }
  assert.equal(run.result().type, 'protan')
  assert.equal(run.result().severity, 1)
})

test('answers after the test is over are ignored', () => {
  const run = createTest()
  run.answer(true)
  while (run.next()) run.answer(false)
  const result = run.result()
  run.answer(true)
  run.answer(true)
  assert.deepEqual(run.result(), result)
  assert.equal(run.next(), null)
})

test('an unfinished test has no result yet', () => {
  const run = createTest()
  run.answer(true)
  run.answer(true)
  assert.equal(run.result().status, 'incomplete')
})

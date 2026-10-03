import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDwell, contains } from '../src/main/geometry.js'

test('dwell fires once after the cursor rests for the full time', () => {
  const dwell = createDwell(3000)
  const at = { x: 100, y: 100 }
  assert.equal(dwell.update(at, 0), null)
  assert.equal(dwell.update(at, 2999), null)
  assert.equal(dwell.update(at, 3000), 'dwell')
  assert.equal(dwell.update(at, 3100), null)
  assert.equal(dwell.update(at, 60000), null)
})

test('moving the cursor restarts the wait and reports the move', () => {
  const dwell = createDwell(3000)
  dwell.update({ x: 100, y: 100 }, 0)
  assert.equal(dwell.update({ x: 200, y: 100 }, 2000), 'moved')
  assert.equal(dwell.update({ x: 200, y: 100 }, 4999), null)
  assert.equal(dwell.update({ x: 200, y: 100 }, 5000), 'dwell')
  assert.equal(dwell.update({ x: 300, y: 100 }, 5100), 'moved')
  assert.equal(dwell.update({ x: 300, y: 100 }, 8100), 'dwell')
})

test('a hand tremor of a couple of pixels still counts as resting', () => {
  const dwell = createDwell(3000)
  dwell.update({ x: 100, y: 100 }, 0)
  assert.equal(dwell.update({ x: 102, y: 101 }, 1000), null)
  assert.equal(dwell.update({ x: 99, y: 102 }, 3000), 'dwell')
})

test('a slow drift away from the resting spot counts as moving', () => {
  const dwell = createDwell(3000)
  dwell.update({ x: 100, y: 100 }, 0)
  assert.equal(dwell.update({ x: 102, y: 100 }, 1000), null)
  assert.equal(dwell.update({ x: 104, y: 100 }, 2000), 'moved')
  assert.equal(dwell.update({ x: 104, y: 100 }, 3000), null)
  assert.equal(dwell.update({ x: 104, y: 100 }, 5000), 'dwell')
})

test('contains', () => {
  const bounds = { x: 0, y: 0, width: 1280, height: 800 }
  assert.equal(contains(bounds, { x: 0, y: 0 }), true)
  assert.equal(contains(bounds, { x: 1279, y: 799 }), true)
  assert.equal(contains(bounds, { x: 1280, y: 10 }), false)
  assert.equal(contains(bounds, { x: -5, y: 10 }), false)
})

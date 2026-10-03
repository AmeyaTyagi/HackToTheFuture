import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sanitize, load, save, DEFAULTS } from '../src/main/settings.js'
import { toMagMatrix } from '../src/main/backends/magnifier.js'
import { toImagePoint, pixelFromBitmap } from '../src/main/geometry.js'

test('sanitize returns defaults for missing or non-object input', () => {
  assert.deepEqual(sanitize(undefined), DEFAULTS)
  assert.deepEqual(sanitize(null), DEFAULTS)
  assert.deepEqual(sanitize('nonsense'), DEFAULTS)
})

test('sanitize repairs each bad field', () => {
  assert.equal(sanitize({ severity: 5 }).severity, 1)
  assert.equal(sanitize({ severity: -2 }).severity, 0)
  assert.equal(sanitize({ severity: 'abc' }).severity, 0.8)
  assert.equal(sanitize({ type: 'blue' }).type, 'deutan')
  assert.equal(sanitize({ enabled: 'yes' }).enabled, false)
})

test('sanitize passes valid settings through', () => {
  const valid = { enabled: true, type: 'tritan', severity: 0.35 }
  assert.deepEqual(sanitize(valid), valid)
})

test('load survives a corrupt file and round-trips a saved one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'photon-'))
  const file = join(dir, 'nested', 'settings.json')
  assert.deepEqual(load(file), DEFAULTS)
  save(file, { enabled: true, type: 'protan', severity: 0.5 })
  assert.deepEqual(load(file), { enabled: true, type: 'protan', severity: 0.5 })
  writeFileSync(file, '{ not json')
  assert.deepEqual(load(file), DEFAULTS)
  save(file, { type: 'blue', severity: 99 })
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { enabled: false, type: 'deutan', severity: 1 })
})

test('toMagMatrix maps the identity to the 5x5 identity', () => {
  const identity5 = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]
  assert.deepEqual(toMagMatrix([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0]), identity5)
})

test('toMagMatrix transposes and puts the offset in the last row', () => {
  const out = toMagMatrix([1, 2, 3, 4, 5, 6, 7, 8, 9], [0.1, 0.2, 0.3])
  // Row 1, column 0 of the Windows matrix is how much green feeds red: m[1].
  assert.equal(out[1 * 5 + 0], 2)
  assert.equal(out[0 * 5 + 1], 4)
  assert.equal(out[2 * 5 + 1], 6)
  assert.deepEqual(out.slice(20), [0.1, 0.2, 0.3, 0, 1])
  assert.equal(out[18], 1)
})

test('toImagePoint scales logical cursor pixels to physical image pixels', () => {
  const size = { width: 2880, height: 1800 }
  assert.deepEqual(toImagePoint({ x: 100, y: 200 }, { x: 0, y: 0 }, 1.5, size), { x: 150, y: 300 })
})

test('toImagePoint accounts for a display that is not at the origin', () => {
  const size = { width: 1920, height: 1080 }
  assert.deepEqual(toImagePoint({ x: -1900, y: 10 }, { x: -1920, y: 0 }, 1, size), { x: 20, y: 10 })
})

test('toImagePoint clamps a cursor outside the display to the image edge', () => {
  const size = { width: 1920, height: 1080 }
  assert.deepEqual(toImagePoint({ x: 5000, y: -40 }, { x: 0, y: 0 }, 1, size), { x: 1919, y: 0 })
})

test('pixelFromBitmap reads BGRA as RGB', () => {
  // 2x1 image: first pixel blue=10 green=20 red=30, second blue=40 green=50 red=60.
  const bitmap = Buffer.from([10, 20, 30, 255, 40, 50, 60, 255])
  assert.deepEqual(pixelFromBitmap(bitmap, 2, { x: 0, y: 0 }), [30, 20, 10])
  assert.deepEqual(pixelFromBitmap(bitmap, 2, { x: 1, y: 0 }), [60, 50, 40])
})

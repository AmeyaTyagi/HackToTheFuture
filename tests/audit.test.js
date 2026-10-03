// Does the correction actually help? These tests count, for a simulated
// color blind viewer, how many pairs of real-world colors look the same,
// with and without Photon. They are the evidence behind the correction
// weights in src/engine/matrices.js, and they fail if a change to the color
// math makes Photon do more harm than good.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { simulate, correct, applyMatrix, rgbToLab } from '../src/engine/index.js'

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const ZERO = [0, 0, 0]

// Backgrounds and text. Colors must stay distinct from these too.
const NEUTRALS = ['#000000', '#1c1c1e', '#3a3a3c', '#808080', '#c8c8cc', '#f2f2f7', '#ffffff']

// Set A: Tableau 10, D3 and Matplotlib, Office charts, status and traffic
// colors, and Material.
const TUNED = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47', '#264478', '#9e480e', '#636363', '#997300',
  '#e03131', '#2f9e44', '#f08c00', '#f5c400', '#1971c2', '#868e96', '#d1453b', '#3fa34d', '#8d5524',
  '#f44336', '#e91e63', '#9c27b0', '#3f51b5', '#2196f3', '#009688', '#4caf50', '#cddc39', '#ffeb3b', '#ff9800',
  '#795548', '#607d8b',
  ...NEUTRALS,
].map(hex)

// Set B: ColorBrewer Set1, Dark2 and Paired, Tailwind, Bootstrap, Google
// brand colors, and the basic CSS colors. Both sets were used to choose the
// correction weights, so these tests guard against regressions; they are
// not an independent validation.
const HELD_OUT = [
  '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999',
  '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666',
  '#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#cab2d6', '#6a3d9a',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b',
  '#0d6efd', '#198754', '#dc3545', '#ffc107', '#0dcaf0', '#4285f4', '#ea4335', '#fbbc05', '#34a853',
  '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
  '#800000', '#008000', '#000080', '#808000', '#800080', '#008080',
  ...NEUTRALS,
].map(hex)

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// Pairs of colors that normal vision sees as clearly different.
function distinctPairs(colors) {
  const labs = colors.map(rgbToLab)
  const pairs = []
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      if (distance(labs[i], labs[j]) >= 25) pairs.push([i, j])
    }
  }
  return pairs
}

// How many of those pairs look the same (deltaE under 12) to the viewer.
function confusable(colors, type, severity, photonOn) {
  const sees = simulate(type, severity)
  const fix = photonOn ? correct(type, severity) : null
  const labs = colors.map((color) => {
    const shown = fix ? applyMatrix(fix.matrix, fix.offset, color) : color
    return rgbToLab(applyMatrix(sees, ZERO, shown))
  })
  return distinctPairs(colors).filter(([i, j]) => distance(labs[i], labs[j]) < 12).length
}

const TYPES = ['deutan', 'protan', 'tritan']

test('with full color blindness, Photon leaves clearly fewer confusable colors', () => {
  for (const type of TYPES) {
    for (const [name, colors] of [['set A', TUNED], ['set B', HELD_OUT]]) {
      const without = confusable(colors, type, 1, false)
      const withPhoton = confusable(colors, type, 1, true)
      assert.ok(withPhoton < without, `${type} ${name}: ${without} without, ${withPhoton} with`)
    }
  }
})

test('on set A, Photon cuts confusable pairs by at least 40% at full strength', () => {
  for (const type of TYPES) {
    const without = confusable(TUNED, type, 1, false)
    const withPhoton = confusable(TUNED, type, 1, true)
    assert.ok(withPhoton <= without * 0.6, `${type}: ${without} without, ${withPhoton} with`)
  }
})

test('from 60% strength up, Photon is never worse than no correction, on either set', () => {
  for (const type of TYPES) {
    for (const severity of [1, 0.9, 0.8, 0.7, 0.6]) {
      for (const [name, colors] of [['set A', TUNED], ['set B', HELD_OUT]]) {
        const without = confusable(colors, type, severity, false)
        const withPhoton = confusable(colors, type, severity, true)
        assert.ok(withPhoton <= without, `${type} ${severity} ${name}: ${without} without, ${withPhoton} with`)
      }
    }
  }
})

test('for mild color blindness, where almost nothing is confused to begin with, Photon costs at most two pairs', () => {
  // Out of more than a thousand pairs in each set.
  for (const type of TYPES) {
    for (const severity of [0.5, 0.4, 0.3, 0.2, 0.1]) {
      for (const [name, colors] of [['set A', TUNED], ['set B', HELD_OUT]]) {
        const without = confusable(colors, type, severity, false)
        const withPhoton = confusable(colors, type, severity, true)
        assert.ok(withPhoton <= without + 2, `${type} ${severity} ${name}: ${without} without, ${withPhoton} with`)
      }
    }
  }
})

test('red and green status colors are told apart by deutan vision with Photon', () => {
  const red = [224, 49, 49]
  const green = [47, 158, 68]
  const sees = simulate('deutan', 1)
  const fix = correct('deutan', 1)
  const lab = (color) => rgbToLab(applyMatrix(sees, ZERO, applyMatrix(fix.matrix, fix.offset, color)))
  const before = distance(rgbToLab(applyMatrix(sees, ZERO, red)), rgbToLab(applyMatrix(sees, ZERO, green)))
  const after = distance(lab(red), lab(green))
  assert.ok(before < 12, `before ${before}`)
  assert.ok(after > 60, `after ${after}`)
})

test('with Photon, red and green stay visible on black and on white', () => {
  const red = [224, 49, 49]
  const green = [47, 158, 68]
  for (const type of ['deutan', 'protan']) {
    const sees = simulate(type, 1)
    const fix = correct(type, 1)
    const lab = (color) => rgbToLab(applyMatrix(sees, ZERO, applyMatrix(fix.matrix, fix.offset, color)))
    for (const [name, color] of [['red', red], ['green', green]]) {
      for (const [ground, value] of [['black', [0, 0, 0]], ['white', [255, 255, 255]]]) {
        const contrast = distance(lab(color), rgbToLab(value))
        assert.ok(contrast >= 25, `${type}: ${name} on ${ground} is ${contrast.toFixed(0)}`)
      }
    }
  }
})

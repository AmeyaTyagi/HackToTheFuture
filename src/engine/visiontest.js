// Vision test: plate colors, the adaptive procedure, and scoring.
//
// Each plate hides a digit using two colors that differ in the response of
// exactly one cone type (L, M or S) and are identical for the other two. A
// person missing that cone cannot see the digit at any strength, and a
// person in whom it is weak needs a bigger difference than normal. Because
// the colors are built from cone responses in linear light, not picked by
// eye, the test does not depend on a hand-tuned palette. Dots also vary in
// brightness, which hides the small errors an uncalibrated screen adds.

import { srgbToLinear, linearToSrgb, deltaE } from './color.js'

export const AXES = ['protan', 'deutan', 'tritan']

// Linear sRGB to cone responses (Vienot, Brettel & Mollon, 1999).
const RGB_TO_LMS = [17.8824, 43.5161, 4.11935, 3.45565, 27.1554, 3.86714, 0.0299566, 0.184309, 1.46709]

function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map(
    (v) => v / det,
  )
}

const LMS_TO_RGB = invert(RGB_TO_LMS)

export function rgbToLms(rgb) {
  const [r, g, b] = rgb.map(srgbToLinear)
  return [0, 1, 2].map((row) => RGB_TO_LMS[row * 3] * r + RGB_TO_LMS[row * 3 + 1] * g + RGB_TO_LMS[row * 3 + 2] * b)
}

// Mid-gray in linear light: the color every plate is centered on.
const BASE = 0.35

// The change in linear RGB that moves one cone's response and no other.
function isolatingDirection(axis) {
  const cone = AXES.indexOf(axis)
  return [LMS_TO_RGB[cone], LMS_TO_RGB[3 + cone], LMS_TO_RGB[6 + cone]]
}

function colorsAt(direction, amount) {
  return {
    figure: direction.map((d) => linearToSrgb(BASE + amount * d)),
    background: direction.map((d) => linearToSrgb(BASE - amount * d)),
  }
}

// Difficulty levels, easiest first, as the color difference a person with
// normal vision sees between digit and background (CIE76 deltaE). Using the
// same ladder on every axis makes the three thresholds comparable.
export const LADDER = [56, 40, 28, 20, 14, 10]

const cache = new Map()

// The two colors of a plate. level indexes LADDER.
export function plateColors(axis, level) {
  const key = `${axis}:${level}`
  if (cache.has(key)) return cache.get(key)
  const direction = isolatingDirection(axis)
  // The largest step that keeps both colors displayable.
  let high = Math.min(...direction.map((d) => Math.min(BASE - 0.01, 0.99 - BASE) / Math.abs(d)))
  let low = 0
  // Find the step whose visible difference matches the ladder.
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2
    const { figure, background } = colorsAt(direction, mid)
    if (deltaE(figure, background) < LADDER[level]) low = mid
    else high = mid
  }
  const colors = colorsAt(direction, high)
  cache.set(key, colors)
  return colors
}

// Brightness alone gives this one away, so everyone can read it.
export const CONTROL = { figure: [52, 62, 84], background: [214, 204, 190] }

export const TRIALS_PER_AXIS = 7
export const TOTAL_PLATES = 1 + AXES.length * TRIALS_PER_AXIS
const START_LEVEL = 1
const HARDEST = LADDER.length - 1
// A threshold at or beyond this is normal: it allows one slip near the end.
const NORMAL = 4.5
// Ties go to the more common type.
const TIE_ORDER = ['deutan', 'protan', 'tritan']

// Turns the three thresholds into a result. A threshold runs from -1 (could
// not read even the easiest plate) to 6 (read the hardest every time).
export function scoreThresholds(thresholds) {
  let type = TIE_ORDER[0]
  for (const axis of TIE_ORDER) if (thresholds[axis] < thresholds[type]) type = axis
  const threshold = thresholds[type]
  if (!(threshold < NORMAL)) return { status: 'none' }
  const severity = 1 - (0.8 * (threshold + 1)) / (NORMAL + 1)
  return { status: 'ok', type, severity: Math.min(1, Math.max(0.2, Math.round(severity * 20) / 20)) }
}

// Runs the test: one control plate, then a staircase on each axis. A right
// answer makes that axis harder, a wrong one easier, so each axis settles
// at the smallest difference the person can see.
export function createTest() {
  const order = ['control']
  for (let trial = 0; trial < TRIALS_PER_AXIS; trial++) order.push(...AXES)
  const level = Object.fromEntries(AXES.map((axis) => [axis, START_LEVEL]))
  const history = Object.fromEntries(AXES.map((axis) => [axis, []]))
  let index = 0
  let controlPassed = null

  return {
    total: TOTAL_PLATES,

    get done() {
      return controlPassed === false || index >= order.length
    },

    // The plate to show now, or null when the test is over.
    next() {
      if (this.done) return null
      const axis = order[index]
      if (axis === 'control') return { axis, number: 1, ...CONTROL }
      const shown = Math.min(HARDEST, Math.max(0, level[axis]))
      return { axis, level: shown, number: index + 1, ...plateColors(axis, shown) }
    },

    // Records whether the plate from next() was read correctly.
    answer(correct) {
      if (this.done) return
      const axis = order[index]
      index++
      if (axis === 'control') {
        controlPassed = correct === true
        return
      }
      const shown = Math.min(HARDEST, Math.max(0, level[axis]))
      level[axis] = shown + (correct === true ? 1 : -1)
      history[axis].push(level[axis])
    },

    result() {
      if (controlPassed !== true) return { status: 'invalid' }
      if (!this.done) return { status: 'incomplete' }
      const thresholds = {}
      for (const axis of AXES) {
        // The staircase has settled by the last four trials.
        const settled = history[axis].slice(-4)
        thresholds[axis] = settled.reduce((sum, v) => sum + v, 0) / settled.length
      }
      return { ...scoreThresholds(thresholds), thresholds }
    },
  }
}

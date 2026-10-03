// Vision test: plate colors and scoring. Each test plate hides a digit using
// two colors that sit on one confusion line, the direction in color space
// along which a given type of color blindness sees no difference.

import { simulate } from './matrices.js'

// The direction d that the fully affected eye cannot see: |S d| is smallest.
// Found by scanning the unit sphere, then scaled so its largest part is 1.
function confusionDirection(type) {
  const s = simulate(type, 1)
  let best = null
  let bestLength = Infinity
  for (let theta = 0; theta < 180; theta += 0.5) {
    for (let phi = 0; phi < 360; phi += 0.5) {
      const t = (theta * Math.PI) / 180
      const p = (phi * Math.PI) / 180
      const d = [Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)]
      const length = Math.hypot(
        s[0] * d[0] + s[1] * d[1] + s[2] * d[2],
        s[3] * d[0] + s[4] * d[1] + s[5] * d[2],
        s[6] * d[0] + s[7] * d[1] + s[8] * d[2],
      )
      if (length < bestLength) {
        bestLength = length
        best = d
      }
    }
  }
  const scale = Math.max(...best.map(Math.abs))
  return best.map((v) => v / scale)
}

// How far apart figure and background sit along the confusion line, in RGB
// units. A mild deficiency hides only the small step; a full one hides all.
// The tritan model leaves a little residual difference, so its steps are smaller.
const STEPS = { protan: [16, 30, 52], deutan: [16, 30, 52], tritan: [12, 22, 36] }
const BASE = { protan: [150, 125, 95], deutan: [150, 125, 95], tritan: [120, 135, 150] }
const DIGITS = { protan: [2, 5, 8], deutan: [3, 6, 9], tritan: [4, 7, 5] }

function buildPlates() {
  const plates = [{ id: 'control', axis: 'control', digit: 8, background: [214, 204, 190], figure: [52, 62, 84] }]
  const byAxis = {}
  for (const axis of ['protan', 'deutan', 'tritan']) {
    const d = confusionDirection(axis)
    byAxis[axis] = STEPS[axis].map((step, i) => ({
      id: `${axis}-${i + 1}`,
      axis,
      digit: DIGITS[axis][i],
      background: BASE[axis].map((v, c) => Math.round(v - step * d[c])),
      figure: BASE[axis].map((v, c) => Math.round(v + step * d[c])),
    }))
  }
  // Interleave the axes, easiest to see first.
  for (let i = 2; i >= 0; i--) {
    plates.push(byAxis.protan[i], byAxis.deutan[i], byAxis.tritan[i])
  }
  return plates
}

export const PLATES = buildPlates()

const SEVERITY = { 1: 0.4, 2: 0.7, 3: 1 }
// Ties go to the more common type.
const TIE_ORDER = ['deutan', 'protan', 'tritan']

// answers maps plate id to what the person typed, or null for "nothing".
export function scoreTest(answers) {
  const given = answers && typeof answers === 'object' ? answers : {}
  const misses = { protan: 0, deutan: 0, tritan: 0 }
  for (const plate of PLATES) {
    const answer = given[plate.id]
    const correct = answer != null && String(answer).trim() === String(plate.digit)
    if (correct) continue
    if (plate.axis === 'control') return { status: 'invalid' }
    misses[plate.axis]++
  }
  const type = TIE_ORDER.reduce((best, axis) => (misses[axis] > misses[best] ? axis : best), TIE_ORDER[0])
  if (misses[type] === 0) return { status: 'none' }
  return { status: 'ok', type, severity: SEVERITY[misses[type]] }
}

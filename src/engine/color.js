// Per-color helpers: applying a transform, measuring difference, naming.

function clampByte(v) {
  return Math.min(255, Math.max(0, Math.round(v)))
}

// matrix is row-major 3x3, offset is in 0..1 units, rgb is 0..255.
export function applyMatrix(m, offset, [r, g, b]) {
  return [
    clampByte(m[0] * r + m[1] * g + m[2] * b + offset[0] * 255),
    clampByte(m[3] * r + m[4] * g + m[5] * b + offset[1] * 255),
    clampByte(m[6] * r + m[7] * g + m[8] * b + offset[2] * 255),
  ]
}

// Runs every pixel of an RGBA buffer through a list of transforms in order,
// clamping after each one the way a screen does. Returns a new buffer.
export function recolor(pixels, transforms) {
  const out = new Uint8ClampedArray(pixels)
  for (const { matrix: m, offset = [0, 0, 0] } of transforms) {
    const or = offset[0] * 255
    const og = offset[1] * 255
    const ob = offset[2] * 255
    for (let i = 0; i < out.length; i += 4) {
      const r = out[i]
      const g = out[i + 1]
      const b = out[i + 2]
      // Uint8ClampedArray rounds and clamps on assignment.
      out[i] = m[0] * r + m[1] * g + m[2] * b + or
      out[i + 1] = m[3] * r + m[4] * g + m[5] * b + og
      out[i + 2] = m[6] * r + m[7] * g + m[8] * b + ob
    }
  }
  return out
}

// sRGB byte (0..255) to linear light (0..1), and back.
export function srgbToLinear(c) {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

export function linearToSrgb(v) {
  return clampByte(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))
}

function labF(t) {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116
}

export function rgbToLab([r, g, b]) {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  // sRGB to XYZ (D65), normalized by the D65 white point.
  const x = labF((0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047)
  const y = labF(0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb)
  const z = labF((0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

// CIE76 color difference. About 2 is just noticeable, 100 is black vs white.
export function deltaE(a, b) {
  const [l1, a1, b1] = rgbToLab(a)
  const [l2, a2, b2] = rgbToLab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

export function rgbToHsl([r, g, b]) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  h *= 60
  if (h < 0) h += 360
  return [h, s, l]
}

// Upper hue bound (degrees) for each family; red wraps around past 345.
const HUES = [
  [15, 'red'],
  [45, 'orange'],
  [70, 'yellow'],
  [90, 'yellow-green'],
  [165, 'green'],
  [195, 'cyan'],
  [250, 'blue'],
  [290, 'purple'],
  [325, 'magenta'],
  [345, 'pink'],
  [360, 'red'],
]

function shade(l) {
  if (l < 0.15) return 'very dark '
  if (l < 0.32) return 'dark '
  if (l > 0.85) return 'pale '
  if (l > 0.68) return 'light '
  return ''
}

// Names a color the way a person would say it: a brightness word where it
// helps, then the color family. Several families have everyday names for
// their dark or light forms (brown, olive, pink, teal, tan), used here
// because "dark orange" is not what anyone calls brown.
export function colorName(rgb) {
  const [h, s, l] = rgbToHsl(rgb)
  if (l < 0.08) return 'black'
  if (l > 0.95) return 'white'
  if (s < 0.12) return l < 0.3 ? 'dark gray' : l > 0.7 ? 'light gray' : 'gray'

  const family = HUES.find(([limit]) => h < limit)[1]

  if (family === 'orange') {
    if (l < 0.2) return 'dark brown'
    if (l < 0.42) return 'brown'
    // Washed-out light orange is tan or beige, not orange.
    if (s < 0.6) return l > 0.8 ? 'beige' : 'tan'
  }
  // Light red is pink, and pink keeps its name across its light shades.
  if (family === 'red' && l > 0.68) return l > 0.9 ? 'pale pink' : 'pink'
  if (family === 'pink') return l < 0.32 ? 'dark pink' : l > 0.9 ? 'pale pink' : 'pink'
  if ((family === 'yellow' || family === 'yellow-green') && l < 0.32) return l < 0.15 ? 'dark olive' : 'olive'
  if (family === 'cyan' && l < 0.42) return l < 0.2 ? 'dark teal' : 'teal'
  if (family === 'magenta' && l < 0.4) return l < 0.2 ? 'dark purple' : 'purple'

  return shade(l) + family
}

export function toHex(rgb) {
  return '#' + rgb.map((v) => clampByte(v).toString(16).padStart(2, '0')).join('').toUpperCase()
}

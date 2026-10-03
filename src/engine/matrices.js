// Color vision deficiency simulation and correction matrices.
// All matrices are row-major 3x3 arrays applied to column vectors [r, g, b].

export const TYPES = ['protan', 'deutan', 'tritan', 'achroma']

export const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1]

// Machado, Oliveira & Fernandes (2009), "A Physiologically-based Model for
// Simulation of Color Vision Deficiency", at severity 0.5 and 1.0.
const MACHADO = {
  protan: [
    [0.458064, 0.679578, -0.137642, 0.092785, 0.846313, 0.060902, -0.007494, -0.016807, 1.024301],
    [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.547494, 0.607765, -0.155259, 0.181692, 0.781742, 0.036566, -0.01041, 0.027275, 0.983136],
    [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.017277, 0.027029, -0.044306, -0.006113, 0.958479, 0.047634, 0.006379, 0.248708, 0.744913],
    [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  ],
}

// Rec. 709 luminance, repeated on every row: what full achromatopsia sees.
const LUMINANCE = [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722]

// Where daltonization sends the color information the viewer cannot see.
const ERROR_SHIFT = {
  protan: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1],
  deutan: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1],
  tritan: [1, 0, 0.7, 0, 1, 0.7, 0, 0, 0],
}

export function clampSeverity(severity) {
  const n = Number(severity)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

// Boost is how hard the correction pushes confusable colors apart:
// 1 is the standard amount, 3 the most.
export const BOOST_MIN = 1
export const BOOST_MAX = 3

export function clampBoost(boost) {
  const n = Number(boost)
  if (!Number.isFinite(n)) return BOOST_MIN
  return Math.min(BOOST_MAX, Math.max(BOOST_MIN, n))
}

function lerp(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t)
}

export function multiply(a, b) {
  const out = new Array(9)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out[row * 3 + col] =
        a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col]
    }
  }
  return out
}

// How the given vision sees a color.
export function simulate(type, severity) {
  const s = clampSeverity(severity)
  if (type === 'achroma') return lerp(IDENTITY, LUMINANCE, s)
  const table = MACHADO[type]
  if (!table) return [...IDENTITY]
  return s <= 0.5 ? lerp(IDENTITY, table[0], s / 0.5) : lerp(table[0], table[1], (s - 0.5) / 0.5)
}

// The transform Photon applies to the screen. Offset is in 0..1 units.
export function correct(type, severity, boost = 1) {
  const s = clampSeverity(severity)
  const push = clampBoost(boost)
  if (type === 'achroma') {
    // Color cannot be restored, so stretch contrast around mid-gray instead.
    const k = 1 + 0.5 * s * (1 + (push - 1) / 2)
    const shift = 0.5 * (1 - k)
    return { matrix: IDENTITY.map((v) => v * k), offset: [shift, shift, shift] }
  }
  const shift = ERROR_SHIFT[type]
  if (!shift) return { matrix: [...IDENTITY], offset: [0, 0, 0] }
  const lost = simulate(type, s).map((v, i) => IDENTITY[i] - v)
  const matrix = multiply(shift, lost).map((v, i) => v * push + IDENTITY[i])
  return { matrix, offset: [0, 0, 0] }
}

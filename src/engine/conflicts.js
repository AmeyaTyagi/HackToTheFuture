// Conflict finder: which of the main colors in an image look clearly
// different to normal vision but nearly the same to the user?

import { simulate } from './matrices.js'
import { applyMatrix, deltaE } from './color.js'

export const DISTINCT = 20 // deltaE above this: clearly different colors
export const CONFUSED = 8 // deltaE below this: looks the same
export const LOST = 0.35 // or: under this share of the difference survives
const MAX_COLORS = 12
const MERGE = 10 // bins closer than this are the same color
const MIN_SHARE = 0.003 // ignore colors covering less than 0.3% of the image
const NONE = 255

// pixels is RGBA, as from canvas getImageData.
// Returns the dominant colors, the conflicting pairs (as indexes into
// colors), and for each pixel the index of its dominant color or 255.
export function findConflicts(pixels, width, height, type, severity) {
  const total = width * height
  const labels = new Uint8Array(total).fill(NONE)
  if (!total || pixels.length < total * 4) return { colors: [], pairs: [], labels }

  // 1. Histogram at 4 bits per channel.
  const count = new Uint32Array(4096)
  const sum = new Float64Array(4096 * 3)
  const binOf = new Uint16Array(total)
  for (let i = 0; i < total; i++) {
    const r = pixels[i * 4]
    const g = pixels[i * 4 + 1]
    const b = pixels[i * 4 + 2]
    const bin = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    binOf[i] = bin
    count[bin]++
    sum[bin * 3] += r
    sum[bin * 3 + 1] += g
    sum[bin * 3 + 2] += b
  }

  // 2. Merge neighboring bins into colors, biggest first.
  const bins = []
  for (let bin = 0; bin < 4096; bin++) if (count[bin]) bins.push(bin)
  bins.sort((a, b) => count[b] - count[a])
  const colors = []
  const colorOfBin = new Uint8Array(4096).fill(NONE)
  for (const bin of bins) {
    const rgb = [0, 1, 2].map((c) => Math.round(sum[bin * 3 + c] / count[bin]))
    let index = colors.findIndex((color) => deltaE(color.rgb, rgb) < MERGE)
    if (index === -1) {
      if (colors.length >= MAX_COLORS || count[bin] < total * MIN_SHARE) continue
      index = colors.push({ rgb, count: 0 }) - 1
    }
    colors[index].count += count[bin]
    colorOfBin[bin] = index
  }

  // 3. Find pairs that are distinct normally and, under simulation, either
  //    look the same or keep only a small share of their difference.
  const s = simulate(type, severity)
  const seen = colors.map((color) => applyMatrix(s, [0, 0, 0], color.rgb))
  const pairs = []
  for (let a = 0; a < colors.length; a++) {
    for (let b = a + 1; b < colors.length; b++) {
      const normal = deltaE(colors[a].rgb, colors[b].rgb)
      if (normal > DISTINCT && deltaE(seen[a], seen[b]) < Math.max(CONFUSED, LOST * normal)) {
        pairs.push({ a, b })
      }
    }
  }

  // 4. Label only pixels whose color is part of a conflict.
  const involved = new Set(pairs.flatMap((pair) => [pair.a, pair.b]))
  for (let i = 0; i < total; i++) {
    const index = colorOfBin[binOf[i]]
    if (involved.has(index)) labels[i] = index
  }

  return { colors: colors.map((color) => color.rgb), pairs, labels }
}

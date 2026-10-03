// Conflict finder: scans a snapshot of the screen and outlines the areas
// whose colors look alike to the user. Both areas of a pair carry the same
// number.

import { photon, inBrowser, showBrowserBanner, loadImage } from '../shared/api.js'
import { findConflicts, colorName } from '../../engine/index.js'

const $ = (id) => document.getElementById(id)
const ANALYSIS_WIDTH = 480
const NONE = 255

function swatch(rgb) {
  const el = document.createElement('span')
  el.className = 'swatch'
  el.style.background = `rgb(${rgb.join(',')})`
  return el
}

// Outlines every labeled region: a cell is on an edge when a neighbor
// carries a different label. Black underlay plus white line reads on any color.
function drawOutlines(labels, width, height) {
  const canvas = $('outlines')
  canvas.width = window.innerWidth * devicePixelRatio
  canvas.height = window.innerHeight * devicePixelRatio
  const ctx = canvas.getContext('2d')
  const sx = canvas.width / width
  const sy = canvas.height / height

  const edges = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x]
      if (label === NONE) continue
      const differs =
        (x > 0 && labels[y * width + x - 1] !== label) ||
        (x < width - 1 && labels[y * width + x + 1] !== label) ||
        (y > 0 && labels[(y - 1) * width + x] !== label) ||
        (y < height - 1 && labels[(y + 1) * width + x] !== label)
      if (differs) edges.push([x * sx, y * sy])
    }
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
  for (const [x, y] of edges) ctx.fillRect(x - 1.5, y - 1.5, sx + 3, sy + 3)
  ctx.fillStyle = '#fff'
  for (const [x, y] of edges) ctx.fillRect(x, y, sx, sy)
}

// A point inside the region to hang the badge on: the labeled pixel nearest
// the region's centroid, since the centroid itself may fall outside it.
function anchor(labels, width, height, index) {
  let sumX = 0
  let sumY = 0
  let n = 0
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== index) continue
    sumX += i % width
    sumY += Math.floor(i / width)
    n++
  }
  if (!n) return null
  const cx = sumX / n
  const cy = sumY / n
  let best = null
  let bestDistance = Infinity
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== index) continue
    const distance = Math.hypot((i % width) - cx, Math.floor(i / width) - cy)
    if (distance < bestDistance) {
      bestDistance = distance
      best = { x: (i % width) / width, y: Math.floor(i / width) / height }
    }
  }
  return best
}

function addBadge(point, number, name) {
  const badge = document.createElement('div')
  badge.className = 'badge'
  badge.style.left = `${point.x * 100}%`
  badge.style.top = `${point.y * 100}%`
  const circle = document.createElement('span')
  circle.className = 'number'
  circle.textContent = String(number)
  badge.append(circle, name)
  $('badges').append(badge)
}

async function start() {
  if (inBrowser) {
    document.documentElement.classList.add('in-browser')
    showBrowserBanner('Sample image. In the desktop app this scans your real screen.')
  }
  const [{ settings }, snapshot] = await Promise.all([photon.getState(), photon.getSnapshot()])
  if (!snapshot) throw new Error('There is no screen snapshot to scan.')
  const image = await loadImage(snapshot.dataUrl)

  if (inBrowser) {
    const backdrop = $('backdrop')
    backdrop.width = image.naturalWidth
    backdrop.height = image.naturalHeight
    backdrop.getContext('2d').drawImage(image, 0, 0)
  }

  const width = ANALYSIS_WIDTH
  const height = Math.round((image.naturalHeight / image.naturalWidth) * width)
  const small = new OffscreenCanvas(width, height)
  const ctx = small.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)

  // A strength of zero would never find anything.
  const severity = settings.severity > 0 ? settings.severity : 1
  const { colors, pairs, labels } = findConflicts(data, width, height, settings.type, severity)

  if (!pairs.length) {
    $('title').textContent = 'No colors on this screen look alike to you'
    $('hint').textContent = inBrowser ? '' : 'Closing in a moment.'
    if (!inBrowser) setTimeout(() => photon.close(), 3500)
    return
  }

  drawOutlines(labels, width, height)

  const numberOf = new Map()
  pairs.forEach((pair, i) => {
    for (const index of [pair.a, pair.b]) if (!numberOf.has(index)) numberOf.set(index, i + 1)
    const row = document.createElement('li')
    const number = document.createElement('span')
    number.className = 'number'
    number.textContent = String(i + 1)
    row.append(
      number,
      swatch(colors[pair.a]),
      colorName(colors[pair.a]),
      'and',
      swatch(colors[pair.b]),
      colorName(colors[pair.b]),
    )
    $('pairs').append(row)
  })
  for (const [index, number] of numberOf) {
    const point = anchor(labels, width, height, index)
    if (point) addBadge(point, number, colorName(colors[index]))
  }

  $('title').textContent =
    pairs.length === 1 ? '1 pair of colors looks alike to you' : `${pairs.length} pairs of colors look alike to you`
  $('hint').textContent = inBrowser ? 'Outlined areas with the same number are easy to confuse.' : 'Outlined areas with the same number are easy to confuse. Press Esc to close.'
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') photon.close()
})

start().catch((error) => {
  $('title').textContent = error.message
})

// Judge view: a snapshot of the screen with a draggable divider.
// Left of the divider: what the chosen color vision sees without Photon.
// Right of it: what the same person sees with Photon on.

import { photon, inBrowser, showBrowserBanner, loadImage, markPlatform } from '../shared/api.js'
import { makeSample } from '../shared/sample.js'
import { simulate, correct, recolor } from '../../engine/index.js'

markPlatform()

const $ = (id) => document.getElementById(id)
const left = $('left')
const right = $('right')
const divider = $('divider')

const TYPE_NAMES = { protan: 'protan', deutan: 'deutan', tritan: 'tritan', achroma: 'monochrome' }

let source = null // ImageData of the true-color snapshot
let type = 'deutan'
let severity = 0.8
let boost = 2
let screenImage = null // the snapshot of the real screen, if there is one
let sourceName = 'screen'
let leftMode = 'without'
let position = 0.5

function put(canvas, pixels) {
  canvas.getContext('2d').putImageData(new ImageData(pixels, source.width, source.height), 0, 0)
}

function draw() {
  if (!source) return
  const seen = { matrix: simulate(type, severity) }
  put(right, recolor(source.data, [correct(type, severity, boost), seen]))
  put(left, leftMode === 'normal' ? new Uint8ClampedArray(source.data) : recolor(source.data, [seen]))

  const percent = Math.round(severity * 100)
  $('left-label').textContent =
    leftMode === 'normal' ? 'Normal vision' : `Without Photon (${TYPE_NAMES[type]}, ${percent}%)`
  for (const button of $('types').children) {
    button.setAttribute('aria-pressed', String(button.dataset.type === type))
  }
  for (const button of $('left-mode').children) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === leftMode))
  }
  for (const button of $('source').children) {
    button.setAttribute('aria-pressed', String(button.dataset.source === sourceName))
  }
  $('boost').value = boost
  $('boost').style.setProperty('--fill-pct', `${((boost - 1) / 2) * 100}%`)
  $('boost-value').textContent = `${boost.toFixed(1)}×`
}

// Loads a picture (an image or a canvas) as the thing being compared.
function setSource(picture) {
  const width = picture.naturalWidth ?? picture.width
  const height = picture.naturalHeight ?? picture.height
  for (const canvas of [left, right]) {
    canvas.width = width
    canvas.height = height
  }
  const ctx = right.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(picture, 0, 0)
  source = ctx.getImageData(0, 0, width, height)
  draw()
}

function setPosition(next) {
  position = Math.min(1, Math.max(0, next))
  const percent = position * 100
  left.style.clipPath = `inset(0 ${100 - percent}% 0 0)`
  divider.style.left = `${percent}%`
  divider.setAttribute('aria-valuenow', String(Math.round(percent)))
}

divider.addEventListener('pointerdown', (event) => {
  divider.setPointerCapture(event.pointerId)
})
divider.addEventListener('pointermove', (event) => {
  if (divider.hasPointerCapture(event.pointerId)) setPosition(event.clientX / window.innerWidth)
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') photon.close()
  // Arrow keys on the Boost slider belong to the slider.
  if (event.target === $('boost')) return
  if (event.key === 'ArrowLeft') setPosition(position - 0.02)
  if (event.key === 'ArrowRight') setPosition(position + 0.02)
})

$('types').addEventListener('click', (event) => {
  const button = event.target.closest('button')
  if (!button) return
  type = button.dataset.type
  draw()
})

$('left-mode').addEventListener('click', (event) => {
  const button = event.target.closest('button')
  if (!button) return
  leftMode = button.dataset.mode
  draw()
})

$('source').addEventListener('click', (event) => {
  const button = event.target.closest('button')
  if (!button) return
  sourceName = button.dataset.source
  // The demo image is packed with the color pairs people most often confuse.
  setSource(sourceName === 'demo' || !screenImage ? makeSample() : screenImage)
})

// Boost here is saved, so the real screen correction matches what was shown.
$('boost').addEventListener('input', (event) => {
  boost = Number(event.target.value)
  draw()
  photon.setSettings({ boost })
})

$('close').addEventListener('click', () => photon.close())

async function start() {
  showBrowserBanner('Sample image. In the desktop app this shows your real screen.')
  const [{ settings }, snapshot] = await Promise.all([photon.getState(), photon.getSnapshot()])
  if (!snapshot) throw new Error('There is no screen snapshot to show.')
  type = settings.type
  // A strength of zero would show no difference at all.
  severity = settings.severity > 0 ? settings.severity : 1

  boost = settings.boost ?? 2

  if (inBrowser) {
    // A browser has no real screen to show, only the demo image.
    sourceName = 'demo'
    $('source').hidden = true
  } else {
    screenImage = await loadImage(snapshot.dataUrl)
  }

  $('message').remove()
  setPosition(0.5)
  setSource(screenImage ?? makeSample())
}

start().catch((error) => {
  $('message').textContent = error.message
})

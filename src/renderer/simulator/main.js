// Judge view: a snapshot of the screen with a draggable divider.
// Left of the divider: what the chosen color vision sees without Photon.
// Right of it: what the same person sees with Photon on.

import { photon, showBrowserBanner, loadImage } from '../shared/api.js'
import { simulate, correct, recolor } from '../../engine/index.js'

const $ = (id) => document.getElementById(id)
const left = $('left')
const right = $('right')
const divider = $('divider')

const TYPE_NAMES = { protan: 'protan', deutan: 'deutan', tritan: 'tritan', achroma: 'monochrome' }

let source = null // ImageData of the true-color snapshot
let type = 'deutan'
let severity = 0.8
let leftMode = 'without'
let position = 0.5

function put(canvas, pixels) {
  canvas.getContext('2d').putImageData(new ImageData(pixels, source.width, source.height), 0, 0)
}

function draw() {
  if (!source) return
  const seen = { matrix: simulate(type, severity) }
  put(right, recolor(source.data, [correct(type, severity), seen]))
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

$('close').addEventListener('click', () => photon.close())

async function start() {
  showBrowserBanner('Sample image. In the desktop app this shows your real screen.')
  const [{ settings }, snapshot] = await Promise.all([photon.getState(), photon.getSnapshot()])
  if (!snapshot) throw new Error('There is no screen snapshot to show.')
  type = settings.type
  // A strength of zero would show no difference at all.
  severity = settings.severity > 0 ? settings.severity : 1

  const image = await loadImage(snapshot.dataUrl)
  for (const canvas of [left, right]) {
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
  }
  const ctx = right.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0)
  source = ctx.getImageData(0, 0, right.width, right.height)

  $('message').remove()
  setPosition(0.5)
  draw()
}

start().catch((error) => {
  $('message').textContent = error.message
})

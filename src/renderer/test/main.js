// Vision test: shows the plates, collects answers, and offers to apply the
// resulting type and strength to Photon.

import { photon, showBrowserBanner } from '../shared/api.js'
import { PLATES, scoreTest } from '../../engine/index.js'

const $ = (id) => document.getElementById(id)

const TYPE_TEXT = {
  protan: 'protan (red-weak) color vision',
  deutan: 'deutan (green-weak) color vision',
  tritan: 'tritan (blue-yellow) color vision',
}
const STRENGTH_TEXT = { 0.4: 'mild', 0.7: 'moderate', 1: 'strong' }

let index = 0
let answers = {}
let result = null

// Draws a circle packed with dots. Dots under the digit take the figure
// color, the rest the background color. Brightness varies from dot to dot
// so the digit cannot be picked out by brightness alone.
function drawPlate(canvas, plate) {
  const size = canvas.width
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)

  const mask = document.createElement('canvas')
  mask.width = mask.height = size
  const maskCtx = mask.getContext('2d', { willReadFrequently: true })
  maskCtx.font = `800 ${size * 0.62}px system-ui, sans-serif`
  maskCtx.textAlign = 'center'
  maskCtx.textBaseline = 'middle'
  maskCtx.fillText(String(plate.digit), size / 2, size * 0.53)
  const inside = maskCtx.getImageData(0, 0, size, size).data

  const center = size / 2
  const limit = size * 0.48
  const dots = []
  for (const radius of [size * 0.026, size * 0.019, size * 0.013, size * 0.009]) {
    for (let attempt = 0; attempt < 2600; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const distance = Math.sqrt(Math.random()) * (limit - radius)
      const x = center + Math.cos(angle) * distance
      const y = center + Math.sin(angle) * distance
      if (dots.some((dot) => Math.hypot(dot.x - x, dot.y - y) < dot.radius + radius + 1.5)) continue
      dots.push({ x, y, radius })
    }
  }

  for (const dot of dots) {
    const isFigure = inside[(Math.round(dot.y) * size + Math.round(dot.x)) * 4 + 3] > 128
    const brightness = 0.84 + Math.random() * 0.32
    const [r, g, b] = (isFigure ? plate.figure : plate.background).map((v) => Math.min(255, v * brightness))
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    ctx.beginPath()
    ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

function showSection(id) {
  for (const section of document.querySelectorAll('section')) section.hidden = section.id !== id
}

function showPlate() {
  $('progress').textContent = `Plate ${index + 1} of ${PLATES.length}`
  drawPlate($('plate'), PLATES[index])
}

function answer(value) {
  if ($('quiz').hidden) return
  answers[PLATES[index].id] = value
  index++
  if (index < PLATES.length) showPlate()
  else showResult()
}

function showResult() {
  result = scoreTest(answers)
  $('apply').hidden = result.status !== 'ok'
  $('retry').hidden = result.status !== 'invalid'
  if (result.status === 'ok') {
    $('result-title').textContent = 'Photon can help'
    $('result-detail').textContent = `Your answers suggest ${STRENGTH_TEXT[result.severity]} ${TYPE_TEXT[result.type]}.`
  } else if (result.status === 'none') {
    $('result-title').textContent = 'No color vision deficiency detected'
    $('result-detail').textContent = 'You read every plate. Your Photon settings have not been changed.'
  } else {
    $('result-title').textContent = 'The test could not be scored'
    $('result-detail').textContent =
      'The first plate can be read by everyone, and it was missed. Check your screen brightness and try again.'
  }
  showSection('result')
}

function begin() {
  index = 0
  answers = {}
  showSection('quiz')
  showPlate()
}

for (let digit = 0; digit <= 9; digit++) {
  const button = document.createElement('button')
  button.textContent = String(digit)
  button.addEventListener('click', () => answer(String(digit)))
  $('keypad').append(button)
}

$('start').addEventListener('click', begin)
$('retry').addEventListener('click', begin)
$('nothing').addEventListener('click', () => answer(null))
$('done').addEventListener('click', () => photon.close())
$('apply').addEventListener('click', async () => {
  await photon.setSettings({ type: result.type, severity: result.severity, enabled: true })
  photon.close()
})

window.addEventListener('keydown', (event) => {
  if (/^[0-9]$/.test(event.key)) answer(event.key)
  if (event.key === 'Escape') photon.close()
})

showBrowserBanner('Browser preview. Results are applied to the real screen only in the desktop app.')

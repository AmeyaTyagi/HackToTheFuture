// Vision test: shows the plates, collects answers, and offers to apply the
// resulting type and strength to Photon.

import { photon, showBrowserBanner } from '../shared/api.js'
import { createTest, plateColors, LADDER } from '../../engine/index.js'

const $ = (id) => document.getElementById(id)

const TYPE_TEXT = {
  protan: 'protan (red-weak) color vision',
  deutan: 'deutan (green-weak) color vision',
  tritan: 'tritan (blue-yellow) color vision',
}
const strengthText = (severity) => (severity < 0.45 ? 'mild' : severity < 0.75 ? 'moderate' : 'strong')
const DIGITS = [2, 3, 4, 5, 6, 7, 8, 9]

let test = null
let plate = null
let digit = null
let result = null

// Draws a circle packed with dots. Dots under the digit take the figure
// color, the rest the background color. Brightness varies from dot to dot
// so the digit cannot be picked out by brightness alone.
function drawPlate(canvas, plate, digit) {
  const size = canvas.width
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)

  const mask = document.createElement('canvas')
  mask.width = mask.height = size
  const maskCtx = mask.getContext('2d', { willReadFrequently: true })
  maskCtx.font = `900 ${size * 0.8}px 'Arial Black', 'Helvetica Neue', Arial, sans-serif`
  maskCtx.textAlign = 'center'
  maskCtx.textBaseline = 'middle'
  maskCtx.fillText(String(digit), size / 2, size * 0.54)
  const inside = maskCtx.getImageData(0, 0, size, size).data

  const center = size / 2
  const limit = size * 0.48
  const dots = []
  // Small dots, so the digit's outline stays crisp.
  for (const radius of [size * 0.019, size * 0.014, size * 0.01, size * 0.007]) {
    for (let attempt = 0; attempt < 3500; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const distance = Math.sqrt(Math.random()) * (limit - radius)
      const x = center + Math.cos(angle) * distance
      const y = center + Math.sin(angle) * distance
      if (dots.some((dot) => Math.hypot(dot.x - x, dot.y - y) < dot.radius + radius + 1)) continue
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
  plate = test.next()
  if (!plate) return showResult()
  // A fresh digit each time, never the same twice in a row.
  const choices = DIGITS.filter((d) => d !== digit)
  digit = choices[Math.floor(Math.random() * choices.length)]
  $('progress').textContent = `Plate ${plate.number} of ${test.total}`
  drawPlate($('plate'), plate, digit)
}

function answer(value) {
  if ($('quiz').hidden || !plate) return
  test.answer(value === String(digit))
  showPlate()
}

function showResult() {
  result = test.result()
  $('apply').hidden = result.status !== 'ok'
  $('retry').hidden = result.status !== 'invalid'
  if (result.status === 'ok') {
    $('result-title').textContent = 'Photon can help'
    $('result-detail').textContent = `Your answers suggest ${strengthText(result.severity)} ${TYPE_TEXT[result.type]}. Photon will use a strength of ${Math.round(result.severity * 100)}%.`
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
  test = createTest()
  digit = null
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

// Development aid: /test/?plate=deutan:5 shows one plate of a given axis and
// level with the digit 5, for checking that it is readable.
const preview = new URLSearchParams(location.search).get('plate')
if (preview) {
  const [axis, level] = preview.split(':')
  showSection('quiz')
  $('progress').textContent = `Preview: ${axis}, level ${level} of ${LADDER.length - 1}, digit 5`
  drawPlate($('plate'), plateColors(axis, Number(level)), 5)
}

showBrowserBanner('Browser preview. Results are applied to the real screen only in the desktop app.')

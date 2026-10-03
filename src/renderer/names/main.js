// Color names: a small label by the cursor that says what color is under it.
// In the desktop app the main process moves this window and sends the color.

import { photon, inBrowser, showBrowserBanner, markPlatform } from '../shared/api.js'
import { makeSample } from '../shared/sample.js'
import { colorName, toHex } from '../../engine/index.js'

markPlatform()

const $ = (id) => document.getElementById(id)

function show({ rgb, name, hex }) {
  $('swatch').style.background = `rgb(${rgb.join(',')})`
  $('name').textContent = name
  $('hex').textContent = hex
}

photon.on('names:update', show)

if (inBrowser) {
  document.documentElement.classList.add('in-browser')
  showBrowserBanner('Sample image. Rest the pointer on a color for 3 seconds to see its name.')

  const sample = makeSample()
  const canvas = $('sample')
  canvas.width = sample.width
  canvas.height = sample.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(sample, 0, 0)

  const label = $('label')
  const DWELL_MS = 3000
  let timer = null
  label.hidden = true

  function nameAt(clientX, clientY) {
    // Undo the letterboxing of object-fit: contain to find the image pixel.
    const scale = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height)
    const x = Math.floor((clientX - (window.innerWidth - canvas.width * scale) / 2) / scale)
    const y = Math.floor((clientY - (window.innerHeight - canvas.height * scale) / 2) / scale)
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return
    const rgb = [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]
    show({ rgb, name: colorName(rgb), hex: toHex(rgb) })
    label.hidden = false
    label.style.left = `${Math.min(clientX + 20, window.innerWidth - label.offsetWidth - 8)}px`
    label.style.top = `${Math.min(clientY + 20, window.innerHeight - label.offsetHeight - 8)}px`
  }

  // The label appears only after the pointer has rested, and hides on a move.
  window.addEventListener('pointermove', (event) => {
    label.hidden = true
    clearTimeout(timer)
    timer = setTimeout(() => nameAt(event.clientX, event.clientY), DWELL_MS)
  })
}

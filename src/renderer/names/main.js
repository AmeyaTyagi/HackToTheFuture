// Color names: a small label by the cursor that says what color is under it.
// In the desktop app the main process moves this window and sends the color.

import { photon, inBrowser, showBrowserBanner } from '../shared/api.js'
import { makeSample } from '../shared/sample.js'
import { colorName, toHex } from '../../engine/index.js'

const $ = (id) => document.getElementById(id)

function show({ rgb, name, hex }) {
  $('swatch').style.background = `rgb(${rgb.join(',')})`
  $('name').textContent = name
  $('hex').textContent = hex
}

photon.on('names:update', show)

if (inBrowser) {
  document.documentElement.classList.add('in-browser')
  showBrowserBanner('Sample image. In the desktop app the label follows your cursor over any app.')

  const sample = makeSample()
  const canvas = $('sample')
  canvas.width = sample.width
  canvas.height = sample.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(sample, 0, 0)

  window.addEventListener('pointermove', (event) => {
    const label = $('label')
    label.style.left = `${Math.min(event.clientX + 20, window.innerWidth - label.offsetWidth - 8)}px`
    label.style.top = `${Math.min(event.clientY + 20, window.innerHeight - label.offsetHeight - 8)}px`

    // Undo the letterboxing of object-fit: contain to find the image pixel.
    const scale = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height)
    const x = Math.floor((event.clientX - (window.innerWidth - canvas.width * scale) / 2) / scale)
    const y = Math.floor((event.clientY - (window.innerHeight - canvas.height * scale) / 2) / scale)
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return
    const rgb = [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]
    show({ rgb, name: colorName(rgb), hex: toHex(rgb) })
  })
}

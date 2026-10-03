// Diagnostic: how fast is a GDI screen capture on Windows, and does it
// include the full-screen color effect? Briefly inverts the screen.
// Run with: npx electron scripts/probe-capture.mjs
import { app, screen } from 'electron'
import koffi from 'koffi'
import { createGdiCapture } from '../src/main/gdi.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const mag = koffi.load('Magnification.dll')
  koffi.struct('MAGCOLOREFFECT', { transform: koffi.array('float', 25) })
  const init = mag.func('bool __stdcall MagInitialize()')
  const uninit = mag.func('bool __stdcall MagUninitialize()')
  const set = mag.func('bool __stdcall MagSetFullscreenColorEffect(MAGCOLOREFFECT *effect)')
  const identity = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]
  const negative = [-1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]

  const gdi = await createGdiCapture()
  const display = screen.getPrimaryDisplay()
  const width = Math.round(display.size.width * display.scaleFactor)
  const height = Math.round(display.size.height * display.scaleFactor)

  init()
  let t = Date.now()
  const plain = gdi.grab(0, 0, width, height)
  const first = Date.now() - t
  t = Date.now()
  gdi.grab(0, 0, width, height)
  const second = Date.now() - t

  set({ transform: negative })
  await sleep(300)
  const withEffect = gdi.grab(0, 0, width, height)
  t = Date.now()
  const pixel = gdi.pixel(Math.round(width / 2), Math.round(height / 2))
  const pixelMs = Date.now() - t
  // How long after lifting the effect does a read see true colors again?
  const under = pixel.join(',')
  set({ transform: identity })
  t = Date.now()
  let liftMs = -1
  while (Date.now() - t < 1000) {
    if (gdi.pixel(Math.round(width / 2), Math.round(height / 2)).join(',') !== under) {
      liftMs = Date.now() - t
      break
    }
  }
  // And how long until applying it shows up?
  const clear = gdi.pixel(Math.round(width / 2), Math.round(height / 2)).join(',')
  set({ transform: negative })
  t = Date.now()
  let applyMs = -1
  while (Date.now() - t < 1000) {
    if (gdi.pixel(Math.round(width / 2), Math.round(height / 2)).join(',') !== clear) {
      applyMs = Date.now() - t
      break
    }
  }
  set({ transform: identity })
  uninit()

  let diff = 0
  let n = 0
  for (let i = 0; i < plain.length; i += 4 * 97) {
    diff += Math.abs(plain[i] - withEffect[i])
    n++
  }
  console.log(JSON.stringify({ width, height, bytes: plain.length, firstMs: first, secondMs: second, pixelMs, pixel, meanDiffUnderEffect: diff / n, liftMs, applyMs }))
  app.quit()
})

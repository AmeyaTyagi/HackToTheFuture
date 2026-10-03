// Diagnostic: does a screen capture include the Windows full-screen color
// effect? Run with: npx electron scripts/probe-capture.mjs
// Briefly inverts the screen.
import { app, desktopCapturer, screen } from 'electron'
import koffi from 'koffi'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function grab() {
  const d = screen.getPrimaryDisplay()
  const thumbnailSize = {
    width: Math.round(d.size.width * d.scaleFactor),
    height: Math.round(d.size.height * d.scaleFactor),
  }
  const t0 = Date.now()
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
  const image = sources[0].thumbnail
  return { bitmap: image.toBitmap(), size: image.getSize(), ms: Date.now() - t0, count: sources.length }
}

app.whenReady().then(async () => {
  const lib = koffi.load('Magnification.dll')
  koffi.struct('MAGCOLOREFFECT', { transform: koffi.array('float', 25) })
  const init = lib.func('bool __stdcall MagInitialize()')
  const uninit = lib.func('bool __stdcall MagUninitialize()')
  const set = lib.func('bool __stdcall MagSetFullscreenColorEffect(MAGCOLOREFFECT *effect)')
  const identity = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]
  const negative = [-1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]

  init()
  const plain = await grab()
  set({ transform: negative })
  await sleep(250)
  const withEffect = await grab()
  set({ transform: identity })
  uninit()

  let diff = 0
  let n = 0
  for (let i = 0; i < plain.bitmap.length; i += 4 * 97) {
    diff += Math.abs(plain.bitmap[i] - withEffect.bitmap[i])
    n++
  }
  console.log(JSON.stringify({ size: plain.size, sources: plain.count, captureMs: plain.ms, meanDiff: diff / n }))
  app.quit()
})

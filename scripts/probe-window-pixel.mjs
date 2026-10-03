// Diagnostic: does reading a color from the window under a point give the
// true color while the screen is recolored? Briefly inverts the screen.
// Run with: npx electron scripts/probe-window-pixel.mjs
import { app, BrowserWindow, screen } from 'electron'
import koffi from 'koffi'
import { createGdiCapture } from '../src/main/gdi.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const mag = koffi.load('Magnification.dll')
  koffi.struct('MAGCOLOREFFECT', { transform: koffi.array('float', 25) })
  const init = mag.func('bool __stdcall MagInitialize()')
  const uninit = mag.func('bool __stdcall MagUninitialize()')
  const set = mag.func('bool __stdcall MagSetFullscreenColorEffect(MAGCOLOREFFECT *effect)')
  const identity = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]
  const negative = [-1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
  const gdi = await createGdiCapture()

  const card = new BrowserWindow({ x: 200, y: 200, width: 400, height: 300, frame: false, alwaysOnTop: true, focusable: false })
  await card.loadURL('data:text/html,' + encodeURIComponent('<body style="margin:0;background:rgb(220,40,40)">'))
  await sleep(600)

  // A point inside the card, and points over whatever other windows are open.
  const inCard = screen.dipToScreenPoint({ x: 400, y: 350 })
  const size = screen.getPrimaryDisplay().size
  const others = [
    [0.5, 0.5], [0.8, 0.3], [0.7, 0.8], [0.15, 0.85], [0.9, 0.9],
  ].map(([fx, fy]) => screen.dipToScreenPoint({ x: Math.round(size.width * fx), y: Math.round(size.height * fy) }))

  init()
  const report = { card: {}, others: [] }
  report.card.screenPlain = gdi.pixel(inCard.x, inCard.y)
  const truth = others.map((p) => gdi.pixel(p.x, p.y))
  set({ transform: negative })
  await sleep(300)
  report.card.screenUnderEffect = gdi.pixel(inCard.x, inCard.y)
  let t = Date.now()
  report.card.windowUnderEffect = gdi.windowPixel(inCard.x, inCard.y)
  report.card.ms = Date.now() - t
  others.forEach((p, i) => {
    t = Date.now()
    const fromWindow = gdi.windowPixel(p.x, p.y)
    report.others.push({ truth: truth[i], fromWindow, ms: Date.now() - t })
  })
  set({ transform: identity })
  uninit()
  console.log(JSON.stringify(report))
  app.exit(0)
})

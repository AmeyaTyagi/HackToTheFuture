import { desktopCapturer, screen } from 'electron'
import { createGdiCapture } from './gdi.js'
import { toImagePoint, pixelFromBitmap, contains } from './geometry.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Reads the screen. Results must hold true colors, not corrected ones, so
// when the backend's effect shows up in captures, correction is lifted for
// the moment of the read.
//
// On Windows this goes through GDI, which reads the whole screen in about
// 50 ms; Electron's desktopCapturer takes about two seconds there. Other
// systems use desktopCapturer.
export async function createCapture({ backend, isCorrecting, reapply }) {
  let gdi = null
  if (process.platform === 'win32') {
    try {
      gdi = await createGdiCapture()
    } catch (error) {
      console.error('Photon: fast screen capture is unavailable, using the slow path:', error.message)
    }
  }
  // Measured on Windows: a read sees the lifted effect within about 10 ms.
  const liftMs = gdi ? 40 : 100

  // The primary display as { bitmap (BGRA), size, display }.
  async function grab() {
    const display = screen.getPrimaryDisplay()
    if (gdi) {
      const rect = screen.dipToScreenRect(null, display.bounds)
      return {
        bitmap: gdi.grab(rect.x, rect.y, rect.width, rect.height),
        size: { width: rect.width, height: rect.height },
        display,
      }
    }
    const thumbnailSize = {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    }
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
    const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
    if (!source || source.thumbnail.isEmpty()) throw new Error('Photon could not capture the screen.')
    return { bitmap: source.thumbnail.toBitmap(), size: source.thumbnail.getSize(), display }
  }

  function wouldFlicker() {
    return backend.capturesIncludeEffect && isCorrecting()
  }

  async function withTrueColors(read) {
    if (!wouldFlicker()) return read()
    backend.clear()
    try {
      await sleep(liftMs)
      return await read()
    } finally {
      reapply()
    }
  }

  return {
    // The screen exactly as it is shown, correction included where the
    // system captures it. Used by the self test.
    raw: grab,

    snapshot: () => withTrueColors(grab),

    // The true color under a cursor position given in logical pixels, or
    // null where Photon cannot read it.
    async pixelAt(cursor) {
      if (gdi) {
        const point = screen.dipToScreenPoint(cursor)
        return withTrueColors(() => gdi.pixel(point.x, point.y))
      }
      // The slow path captures the primary display only.
      const display = screen.getPrimaryDisplay()
      if (!contains(display.bounds, cursor)) return null
      const { bitmap, size } = await withTrueColors(grab)
      return pixelFromBitmap(bitmap, size.width, toImagePoint(cursor, display.bounds, display.scaleFactor, size))
    },
  }
}

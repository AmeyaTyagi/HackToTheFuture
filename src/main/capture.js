import { desktopCapturer, screen } from 'electron'
import { applyMatrix } from '../engine/index.js'
import { createGdiCapture } from './gdi.js'
import { toImagePoint, pixelFromBitmap, contains } from './geometry.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// How far, per color channel, a window's own color run through the current
// correction may sit from what the screen shows and still count as the
// same pixel. Covers rounding only.
const MATCH = 4

// Reads the screen. Results must hold true colors, not corrected ones.
//
// On Windows this goes through GDI, which reads the whole screen in about
// 50 ms; Electron's desktopCapturer takes about two seconds there. Other
// systems use desktopCapturer.
//
// currentTransform() returns the correction being applied right now, or
// null when the screen is showing true colors.
export async function createCapture({ backend, isCorrecting, reapply, currentTransform }) {
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
  // How many times correction has been lifted for a read. Each one is a
  // visible flicker, so the self test watches this.
  let lifts = 0

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

  // True when what a capture sees is the corrected screen.
  function capturesAreCorrected() {
    return backend.capturesIncludeEffect && isCorrecting()
  }

  async function withTrueColors(read) {
    if (!capturesAreCorrected()) return read()
    lifts++
    backend.clear()
    try {
      await sleep(liftMs)
      return await read()
    } finally {
      reapply()
    }
  }

  // The true color of one screen pixel, given in physical pixels (Windows).
  //
  // With correction off, the screen itself is the truth. With it on, the
  // screen shows corrected colors, so the color is taken from the window
  // under the point, which draws its own picture unaffected by correction.
  // That answer is accepted only if running it through the correction
  // reproduces exactly what the screen shows at that pixel. If it does not
  // (a see-through window, a window that will not draw), correction is
  // lifted for a moment and the screen is read directly. Either way the
  // result is the real pixel, never an estimate.
  async function truePixel(point) {
    if (!capturesAreCorrected()) return gdi.pixel(point.x, point.y)
    const transform = currentTransform()
    const fromWindow = gdi.windowPixel(point.x, point.y)
    if (transform && fromWindow) {
      const expected = applyMatrix(transform.matrix, transform.offset, fromWindow)
      const shown = gdi.pixel(point.x, point.y)
      if (expected.every((v, i) => Math.abs(v - shown[i]) <= MATCH)) return fromWindow
    }
    return withTrueColors(() => gdi.pixel(point.x, point.y))
  }

  return {
    get lifts() {
      return lifts
    },

    // The screen exactly as it is shown, correction included where the
    // system captures it. Used by the self test.
    raw: grab,

    snapshot: () => withTrueColors(grab),

    // Windows only: the true color at a point in physical pixels.
    pixelAtPhysical: gdi ? truePixel : null,

    // The true color under the cursor, or null where Photon cannot read it.
    // cursor is its position in logical pixels.
    async pixelAt(cursor) {
      // Windows reports the tip of the cursor in physical pixels, which is
      // exact; converting from logical pixels can be a pixel off.
      if (gdi) return truePixel(gdi.cursor() ?? screen.dipToScreenPoint(cursor))
      // The slow path captures the primary display only.
      const display = screen.getPrimaryDisplay()
      if (!contains(display.bounds, cursor)) return null
      const { bitmap, size } = await withTrueColors(grab)
      return pixelFromBitmap(bitmap, size.width, toImagePoint(cursor, display.bounds, display.scaleFactor, size))
    },
  }
}

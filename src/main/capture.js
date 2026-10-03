import { desktopCapturer, screen } from 'electron'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Snapshots must hold true colors, not corrected ones. When the backend's
// effect shows up in captures, correction is lifted for the capture.
export function createCapture({ backend, isCorrecting, reapply }) {
  async function grab() {
    const display = screen.getPrimaryDisplay()
    const thumbnailSize = {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    }
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
    const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
    if (!source || source.thumbnail.isEmpty()) {
      throw new Error('Photon could not capture the screen.')
    }
    return { image: source.thumbnail, display }
  }

  return {
    // True when taking a snapshot right now would make the screen flicker.
    get wouldFlicker() {
      return backend.capturesIncludeEffect && isCorrecting()
    },

    // The screen exactly as it is shown, correction included where the
    // system captures it. Used by the self test.
    raw: grab,

    async snapshot() {
      if (!this.wouldFlicker) return grab()
      backend.clear()
      try {
        await sleep(100)
        return await grab()
      } finally {
        reapply()
      }
    },
  }
}

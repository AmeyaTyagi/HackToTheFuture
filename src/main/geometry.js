// Pure coordinate helpers, kept free of Electron imports so they can be tested.

// Maps a cursor position in logical screen pixels to a pixel in a snapshot
// of the display, which is in physical pixels.
export function toImagePoint(cursor, displayBounds, scaleFactor, imageSize) {
  const x = Math.round((cursor.x - displayBounds.x) * scaleFactor)
  const y = Math.round((cursor.y - displayBounds.y) * scaleFactor)
  return {
    x: Math.min(imageSize.width - 1, Math.max(0, x)),
    y: Math.min(imageSize.height - 1, Math.max(0, y)),
  }
}

// Watches for the cursor coming to rest. update() returns 'moved' when the
// cursor leaves its resting spot, 'dwell' once when it has stayed within
// `tolerance` pixels for `ms` milliseconds, and null otherwise.
export function createDwell(ms, tolerance = 3) {
  let anchor = null
  let since = 0
  let fired = false
  return {
    update(point, now) {
      if (!anchor || Math.hypot(point.x - anchor.x, point.y - anchor.y) > tolerance) {
        const first = anchor === null
        anchor = { x: point.x, y: point.y }
        since = now
        fired = false
        return first ? null : 'moved'
      }
      if (!fired && now - since >= ms) {
        fired = true
        return 'dwell'
      }
      return null
    },
  }
}

export function contains(bounds, point) {
  return (
    point.x >= bounds.x &&
    point.y >= bounds.y &&
    point.x < bounds.x + bounds.width &&
    point.y < bounds.y + bounds.height
  )
}

// Reads one pixel from a BGRA bitmap, as returned by nativeImage.toBitmap().
export function pixelFromBitmap(bitmap, width, point) {
  const i = (point.y * width + point.x) * 4
  return [bitmap[i + 2], bitmap[i + 1], bitmap[i]]
}

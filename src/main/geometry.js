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

// Reads one pixel from a BGRA bitmap, as returned by nativeImage.toBitmap().
export function pixelFromBitmap(bitmap, width, point) {
  const i = (point.y * width + point.x) * 4
  return [bitmap[i + 2], bitmap[i + 1], bitmap[i]]
}

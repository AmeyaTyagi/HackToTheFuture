// Fast screen reads on Windows through GDI. A full-screen grab takes tens of
// milliseconds, where Electron's desktopCapturer takes about two seconds.
// Coordinates are physical pixels on the virtual desktop.

const SRCCOPY = 0x00cc0020
const CAPTUREBLT = 0x40000000

export async function createGdiCapture() {
  const { default: koffi } = await import('koffi')
  const user32 = koffi.load('user32.dll')
  const gdi32 = koffi.load('gdi32.dll')

  const BITMAPINFOHEADER = koffi.struct('BITMAPINFOHEADER', {
    biSize: 'uint32',
    biWidth: 'int32',
    biHeight: 'int32',
    biPlanes: 'uint16',
    biBitCount: 'uint16',
    biCompression: 'uint32',
    biSizeImage: 'uint32',
    biXPelsPerMeter: 'int32',
    biYPelsPerMeter: 'int32',
    biClrUsed: 'uint32',
    biClrImportant: 'uint32',
  })

  const GetDC = user32.func('void * __stdcall GetDC(void *hwnd)')
  const ReleaseDC = user32.func('int __stdcall ReleaseDC(void *hwnd, void *hdc)')
  const CreateCompatibleDC = gdi32.func('void * __stdcall CreateCompatibleDC(void *hdc)')
  const CreateCompatibleBitmap = gdi32.func('void * __stdcall CreateCompatibleBitmap(void *hdc, int width, int height)')
  const SelectObject = gdi32.func('void * __stdcall SelectObject(void *hdc, void *object)')
  const DeleteObject = gdi32.func('bool __stdcall DeleteObject(void *object)')
  const DeleteDC = gdi32.func('bool __stdcall DeleteDC(void *hdc)')
  const BitBlt = gdi32.func(
    'bool __stdcall BitBlt(void *dest, int x, int y, int width, int height, void *src, int srcX, int srcY, uint32 rop)',
  )
  const GetDIBits = gdi32.func(
    'int __stdcall GetDIBits(void *hdc, void *bitmap, uint32 start, uint32 lines, void *bits, BITMAPINFOHEADER *info, uint32 usage)',
  )

  // Copies a rectangle of the screen into a top-down BGRA buffer.
  function grab(x, y, width, height) {
    const screenDc = GetDC(null)
    const memoryDc = CreateCompatibleDC(screenDc)
    const bitmap = CreateCompatibleBitmap(screenDc, width, height)
    const previous = SelectObject(memoryDc, bitmap)
    try {
      if (!BitBlt(memoryDc, 0, 0, width, height, screenDc, x, y, SRCCOPY | CAPTUREBLT)) {
        throw new Error('Windows could not copy the screen.')
      }
      const buffer = Buffer.alloc(width * height * 4)
      const info = {
        biSize: 40,
        biWidth: width,
        // Negative height asks for rows from the top down.
        biHeight: -height,
        biPlanes: 1,
        biBitCount: 32,
        biCompression: 0,
        biSizeImage: 0,
        biXPelsPerMeter: 0,
        biYPelsPerMeter: 0,
        biClrUsed: 0,
        biClrImportant: 0,
      }
      // The bitmap must not be selected into a DC while it is read.
      SelectObject(memoryDc, previous)
      if (GetDIBits(screenDc, bitmap, 0, height, buffer, info, 0) !== height) {
        throw new Error('Windows could not read the screen copy.')
      }
      // GDI leaves the alpha byte at zero.
      for (let i = 3; i < buffer.length; i += 4) buffer[i] = 255
      return buffer
    } finally {
      DeleteObject(bitmap)
      DeleteDC(memoryDc)
      ReleaseDC(null, screenDc)
    }
  }

  return {
    grab,
    // One pixel as [r, g, b].
    pixel(x, y) {
      const buffer = grab(x, y, 1, 1)
      return [buffer[2], buffer[1], buffer[0]]
    },
  }
}

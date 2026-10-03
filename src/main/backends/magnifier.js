// Windows backend: the Magnification API applies one color matrix to the
// whole desktop on the GPU, covering every app with no added latency.
// Windows drops the effect when the process exits, so a crash cannot leave
// the screen recolored.

const IDENTITY_5X5 = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]

// Windows multiplies a row vector [r g b a 1] by the matrix, so our
// column-vector 3x3 goes in transposed, with the offset in the last row.
export function toMagMatrix(m, offset) {
  return [
    m[0], m[3], m[6], 0, 0,
    m[1], m[4], m[7], 0, 0,
    m[2], m[5], m[8], 0, 0,
    0, 0, 0, 1, 0,
    offset[0], offset[1], offset[2], 0, 1,
  ]
}

export function createMagnifierBackend() {
  let api = null

  return {
    name: 'magnifier',
    // Screen captures on Windows include the color effect.
    capturesIncludeEffect: true,

    async start() {
      const { default: koffi } = await import('koffi')
      const lib = koffi.load('Magnification.dll')
      koffi.struct('MAGCOLOREFFECT', { transform: koffi.array('float', 25) })
      const init = lib.func('bool __stdcall MagInitialize()')
      const uninit = lib.func('bool __stdcall MagUninitialize()')
      const set = lib.func('bool __stdcall MagSetFullscreenColorEffect(MAGCOLOREFFECT *effect)')
      if (!init()) throw new Error('Windows refused to start the screen color service.')
      api = { uninit, set }
    },

    apply({ matrix, offset }) {
      if (!api) return false
      return api.set({ transform: toMagMatrix(matrix, offset) })
    },

    clear() {
      if (!api) return false
      return api.set({ transform: IDENTITY_5X5 })
    },

    stop() {
      if (!api) return
      api.set({ transform: IDENTITY_5X5 })
      api.uninit()
      api = null
    },
  }
}

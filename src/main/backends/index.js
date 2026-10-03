// Picks how the screen gets recolored on this system.
// Every backend exposes: name, capturesIncludeEffect, start(), apply({matrix, offset}), clear(), stop().

export async function createBackend(deps) {
  if (process.env.PHOTON_BACKEND === 'overlay' || process.platform === 'darwin') {
    const { createOverlayBackend } = await import('./overlay.js')
    return createOverlayBackend(deps)
  }
  if (process.platform === 'win32') {
    const { createMagnifierBackend } = await import('./magnifier.js')
    return createMagnifierBackend()
  }
  return {
    name: 'none',
    capturesIncludeEffect: false,
    async start() {
      throw new Error('Screen correction is supported on Windows and macOS only.')
    },
    apply: () => false,
    clear: () => false,
    stop() {},
  }
}

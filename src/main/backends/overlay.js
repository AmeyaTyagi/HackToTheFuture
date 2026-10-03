// macOS backend (also runnable on Windows with PHOTON_BACKEND=overlay).
// There is no system call for a full-screen color matrix on macOS, so this
// captures the screen and redraws it, recolored, in a click-through window
// on top. The window is excluded from capture so it does not film itself.

import { BrowserWindow, screen, systemPreferences } from 'electron'

export function createOverlayBackend({ loadPage, preload }) {
  let win = null
  let transform = null

  function send() {
    if (win && !win.isDestroyed() && transform) win.webContents.send('overlay:transform', transform)
  }

  function open() {
    const { bounds } = screen.getPrimaryDisplay()
    win = new BrowserWindow({
      ...bounds,
      transparent: true,
      frame: false,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      webPreferences: { preload, backgroundThrottling: false },
    })
    win.setIgnoreMouseEvents(true)
    win.setContentProtection(true)
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.webContents.on('did-finish-load', send)
    win.on('closed', () => {
      win = null
    })
    loadPage(win, 'overlay')
  }

  return {
    name: 'overlay',
    // The overlay window is excluded from capture, so snapshots are true color.
    capturesIncludeEffect: false,

    async start() {
      if (process.platform === 'darwin') {
        const status = systemPreferences.getMediaAccessStatus('screen')
        if (status === 'denied' || status === 'restricted') {
          throw new Error(
            'Photon needs the Screen Recording permission. Enable it in System Settings, Privacy & Security, Screen Recording, then restart Photon.',
          )
        }
      }
    },

    apply(next) {
      transform = next
      if (!win || win.isDestroyed()) open()
      else send()
      return true
    },

    clear() {
      transform = null
      if (win && !win.isDestroyed()) win.destroy()
      win = null
      return true
    },

    stop() {
      this.clear()
    },
  }
}

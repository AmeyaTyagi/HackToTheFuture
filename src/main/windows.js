import { BrowserWindow, screen } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const here = import.meta.dirname
const isDev = process.env.PHOTON_DEV === '1'
const isMac = process.platform === 'darwin'

export const preload = join(here, 'preload.cjs')

// Debug aid: with PHOTON_SHOT_DIR set, each window saves a picture of itself
// two seconds after loading, so the interface can be checked without
// screenshotting the whole desktop.
function saveShot(win, page) {
  const dir = process.env.PHOTON_SHOT_DIR
  if (!dir) return
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      if (win.isDestroyed()) return
      const image = await win.webContents.capturePage()
      writeFileSync(join(dir, `${page}.png`), image.toPNG())
    }, 2000)
  })
}

export function loadPage(win, page) {
  saveShot(win, page)
  // Surface page errors in the terminal that launched Photon.
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.error(`Photon [${page}]: ${event.message}`)
  })
  if (isDev) return win.loadURL(`http://127.0.0.1:5173/${page}/`)
  return win.loadFile(join(here, '../../dist', page, 'index.html'))
}

const webPreferences = { preload }

export function createPanel() {
  const win = new BrowserWindow({
    width: 340,
    height: 668,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Translucent, blurred background: vibrancy on macOS, acrylic on Windows 11.
    ...(isMac
      ? { vibrancy: 'popover', visualEffectState: 'active', transparent: true }
      : { backgroundMaterial: 'acrylic' }),
    webPreferences,
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  loadPage(win, 'panel')
  return win
}

// Bottom-right above the taskbar on Windows, under the menu bar icon on macOS.
export function placePanel(win, trayBounds) {
  const { workArea } = screen.getPrimaryDisplay()
  const [width, height] = win.getSize()
  const margin = 12
  let x = workArea.x + workArea.width - width - margin
  let y = workArea.y + workArea.height - height - margin
  if (isMac && trayBounds && trayBounds.width > 0) {
    x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2)
    y = Math.round(trayBounds.y + trayBounds.height + 6)
  }
  x = Math.min(workArea.x + workArea.width - width - margin, Math.max(workArea.x + margin, x))
  win.setPosition(x, y)
}

export function createSimulator() {
  const win = new BrowserWindow({
    ...screen.getPrimaryDisplay().bounds,
    frame: false,
    fullscreen: true,
    skipTaskbar: true,
    backgroundColor: '#000000',
    webPreferences,
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  loadPage(win, 'simulator')
  return win
}

export function createNamesLabel() {
  const win = new BrowserWindow({
    width: 320,
    height: 56,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences,
  })
  win.setIgnoreMouseEvents(true)
  win.setAlwaysOnTop(true, 'screen-saver')
  // Stays hidden until the cursor rests; the main process shows it.
  loadPage(win, 'names')
  return win
}

export function createConflicts() {
  const win = new BrowserWindow({
    ...screen.getPrimaryDisplay().bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    enableLargerThanScreen: true,
    webPreferences,
  })
  win.setIgnoreMouseEvents(true)
  win.setAlwaysOnTop(true, 'screen-saver')
  loadPage(win, 'conflicts')
  return win
}

export function createTest() {
  const win = new BrowserWindow({
    width: 560,
    height: 720,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Photon Vision Test',
    autoHideMenuBar: true,
    webPreferences,
  })
  win.setMenuBarVisibility(false)
  loadPage(win, 'test')
  return win
}

import { BrowserWindow, nativeTheme, screen } from 'electron'
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

export const PANEL_WIDTH = 340

export function createPanel() {
  const win = new BrowserWindow({
    width: PANEL_WIDTH,
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

// The height the panel's content needs; the page reports it.
let panelHeight = 668

// Records a new content height. Returns false if it is unchanged, so the
// caller can skip moving the window.
export function setPanelHeight(height) {
  const { workArea } = screen.getPrimaryDisplay()
  const next = Math.min(workArea.height - 24, Math.max(200, Math.round(height)))
  if (Math.abs(next - panelHeight) <= 1) return false
  panelHeight = next
  return true
}

// Bottom-right above the taskbar on Windows, under the menu bar icon on macOS.
//
// Size and position are set together from fixed numbers, never read back
// from the window. On fractionally scaled displays (125%, 150%) Windows
// rounds a window up by a pixel each time it is moved, so reading the size
// and setting it again made the panel grow until it filled the screen.
export function placePanel(win, trayBounds) {
  const { workArea } = screen.getPrimaryDisplay()
  const width = PANEL_WIDTH
  const height = panelHeight
  const margin = 12
  let x = workArea.x + workArea.width - width - margin
  let y = workArea.y + workArea.height - height - margin
  if (isMac && trayBounds && trayBounds.width > 0) {
    x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2)
    y = Math.round(trayBounds.y + trayBounds.height + 6)
  }
  x = Math.min(workArea.x + workArea.width - width - margin, Math.max(workArea.x + margin, x))
  // A window that is not resizable ignores size changes on Windows.
  win.setResizable(true)
  win.setBounds({ x, y, width, height })
  win.setResizable(false)
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
    // Shown behind the page where the system has no window material.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#282828' : '#ececec',
    // macOS: native traffic lights over the page, window-tinted material.
    // Elsewhere: no system frame; the page draws a macOS-style title bar.
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', vibrancy: 'under-window', visualEffectState: 'active' }
      : { frame: false, backgroundMaterial: 'mica' }),
    webPreferences,
  })
  win.setMenuBarVisibility(false)
  loadPage(win, 'test')
  return win
}

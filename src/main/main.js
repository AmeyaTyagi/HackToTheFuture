import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  session as electronSession,
  shell,
} from 'electron'
import { join } from 'node:path'
import { correct, colorName, toHex } from '../engine/index.js'
import { createBackend } from './backends/index.js'
import { createCapture } from './capture.js'
import { toImagePoint, pixelFromBitmap } from './geometry.js'
import { load, save, sanitize } from './settings.js'
import { registerShortcuts } from './shortcuts.js'
import {
  preload,
  loadPage,
  createPanel,
  placePanel,
  createSimulator,
  createNamesLabel,
  createConflicts,
  createTest,
} from './windows.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let settings
let settingsFile
let backend
let backendReady = false
let capture
let tray
let panel
let lastSnapshot = null
let names = null
let conflicts = null
let quitting = false

// Windows that need true colors on screen (judge view, vision test) pause
// correction while they are open.
const pausedBy = new Set()

const status = { backendError: null, shortcutErrors: [], actionError: null }

function isCorrecting() {
  return backendReady && settings.enabled && pausedBy.size === 0
}

function applyCorrection() {
  if (!backendReady) return
  if (isCorrecting()) backend.apply(correct(settings.type, settings.severity))
  else backend.clear()
}

function currentState() {
  return {
    settings,
    status: { ...status, backend: backend?.name ?? 'none', namesOn: names !== null },
  }
}

function broadcast() {
  const state = currentState()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('state:changed', state)
  }
  tray?.setToolTip(`Photon: ${settings.enabled ? 'on' : 'off'}`)
}

function updateSettings(partial) {
  settings = sanitize({ ...settings, ...partial })
  save(settingsFile, settings)
  applyCorrection()
  broadcast()
  return currentState()
}

function pauseWhileOpen(win) {
  const id = win.id
  pausedBy.add(id)
  applyCorrection()
  win.on('closed', () => {
    pausedBy.delete(id)
    applyCorrection()
  })
}

async function takeSnapshot() {
  // Keep Photon's own panel out of the picture.
  if (panel?.isVisible()) {
    panel.hide()
    await sleep(150)
  }
  const { image, display } = await capture.snapshot()
  const size = image.getSize()
  return { image, display, size }
}

function rememberSnapshot({ image, size }) {
  lastSnapshot = { dataUrl: image.toDataURL(), width: size.width, height: size.height }
}

// ---- Actions -------------------------------------------------------------

async function openSimulator() {
  rememberSnapshot(await takeSnapshot())
  pauseWhileOpen(createSimulator())
}

function openTest() {
  panel?.hide()
  pauseWhileOpen(createTest())
}

function stopNames() {
  if (!names) return
  clearInterval(names.timer)
  if (!names.win.isDestroyed()) names.win.destroy()
  names = null
  broadcast()
}

async function toggleNames() {
  if (names) return stopNames()
  const shot = await takeSnapshot()
  const session = {
    win: createNamesLabel(),
    bitmap: shot.image.toBitmap(),
    size: shot.size,
    display: shot.display,
    refreshedAt: Date.now(),
    refreshing: false,
    timer: null,
  }
  names = session

  async function refresh() {
    session.refreshing = true
    try {
      const next = await capture.snapshot()
      session.bitmap = next.image.toBitmap()
      session.size = next.image.getSize()
      session.display = next.display
    } catch {
      // Keep the previous snapshot.
    } finally {
      session.refreshedAt = Date.now()
      session.refreshing = false
    }
  }

  session.timer = setInterval(() => {
    if (session.win.isDestroyed()) return stopNames()
    const cursor = screen.getCursorScreenPoint()
    const { bounds, scaleFactor } = session.display
    const point = toImagePoint(cursor, bounds, scaleFactor, session.size)
    const rgb = pixelFromBitmap(session.bitmap, session.size.width, point)

    // Sit below and right of the cursor, flipping at the screen edges.
    const [w, h] = session.win.getSize()
    const x = cursor.x + 20 + w > bounds.x + bounds.width ? cursor.x - 20 - w : cursor.x + 20
    const y = cursor.y + 20 + h > bounds.y + bounds.height ? cursor.y - 20 - h : cursor.y + 20
    session.win.setPosition(x, y)
    session.win.webContents.send('names:update', { rgb, name: colorName(rgb), hex: toHex(rgb) })

    // Refreshing would flicker when correction has to be lifted to capture.
    if (!capture.wouldFlicker && !session.refreshing && Date.now() - session.refreshedAt > 1000) {
      refresh()
    }
  }, 66)
  broadcast()
}

function closeConflicts() {
  if (!conflicts) return
  globalShortcut.unregister('Escape')
  if (!conflicts.isDestroyed()) conflicts.destroy()
  conflicts = null
}

async function toggleConflicts() {
  if (conflicts) return closeConflicts()
  rememberSnapshot(await takeSnapshot())
  conflicts = createConflicts()
  // The overlay is click-through and cannot take focus, so Esc is caught here.
  globalShortcut.register('Escape', closeConflicts)
  conflicts.on('closed', () => {
    globalShortcut.unregister('Escape')
    conflicts = null
  })
}

const actions = {
  toggle: async () => updateSettings({ enabled: !settings.enabled }),
  simulator: openSimulator,
  names: toggleNames,
  conflicts: toggleConflicts,
  test: async () => openTest(),
  permissions: async () =>
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'),
}

async function run(action) {
  if (!actions[action]) return
  try {
    status.actionError = null
    await actions[action]()
  } catch (error) {
    status.actionError = error.message
    console.error(`Photon: ${action} failed:`, error)
  }
  broadcast()
}

// ---- Tray ----------------------------------------------------------------

// Draws the tray icon in code: a ring swept through the color wheel.
function makeIcon(size) {
  const buffer = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c
      const dy = y - c
      const d = Math.hypot(dx, dy) / c
      const i = (y * size + x) * 4
      if (d > 1 || d < 0.42) continue
      const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
      const f = (n) => {
        const k = (n + hue / 60) % 6
        return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))))
      }
      const edge = Math.min(1, (1 - d) * c, (d - 0.42) * c)
      buffer[i] = f(1) // blue
      buffer[i + 1] = f(3) // green
      buffer[i + 2] = f(5) // red
      buffer[i + 3] = Math.round(255 * Math.max(0, edge))
    }
  }
  return nativeImage.createFromBitmap(buffer, { width: size, height: size })
}

function showPanel() {
  if (!panel || panel.isDestroyed()) return
  placePanel(panel, tray?.getBounds())
  panel.show()
  panel.focus()
}

function togglePanel() {
  if (panel?.isVisible()) panel.hide()
  else showPanel()
}

function createTray() {
  tray = new Tray(makeIcon(process.platform === 'darwin' ? 18 : 32))
  tray.setToolTip('Photon')
  tray.on('click', togglePanel)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Photon', click: showPanel },
      { label: 'Turn correction on or off', click: () => run('toggle') },
      { type: 'separator' },
      { label: 'Quit Photon', click: () => app.quit() },
    ]),
  )
}

// ---- Lifecycle -----------------------------------------------------------

function registerIpc() {
  ipcMain.handle('state:get', () => currentState())
  ipcMain.handle('settings:set', (_event, partial) => updateSettings(partial))
  ipcMain.handle('action:run', (_event, action) => run(action))
  ipcMain.handle('capture:last', () => lastSnapshot)
  ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win === panel) panel.hide()
    else win?.close()
  })
  ipcMain.handle('app:quit', () => app.quit())
}

async function start() {
  settingsFile = join(app.getPath('userData'), 'settings.json')
  settings = load(settingsFile)

  // The overlay backend's page asks for the screen through getDisplayMedia.
  electronSession.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const display = screen.getPrimaryDisplay()
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    callback({ video: sources.find((s) => s.display_id === String(display.id)) ?? sources[0] })
  })

  backend = await createBackend({ loadPage, preload })
  try {
    await backend.start()
    backendReady = true
  } catch (error) {
    status.backendError = error.message
  }
  capture = createCapture({ backend, isCorrecting, reapply: applyCorrection })

  registerIpc()
  status.shortcutErrors = registerShortcuts({
    toggle: () => run('toggle'),
    simulator: () => run('simulator'),
    names: () => run('names'),
    conflicts: () => run('conflicts'),
  })

  createTray()
  panel = createPanel()
  panel.on('blur', () => {
    if (!panel.webContents.isDevToolsOpened()) panel.hide()
  })
  panel.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    panel.hide()
  })
  panel.webContents.once('did-finish-load', showPanel)

  applyCorrection()
  broadcast()

  if (process.env.PHOTON_SELFTEST === '1') {
    const { runSelfTest } = await import('./selftest.js')
    runSelfTest({ backend, capture, getState: currentState, updateSettings, run, isCorrecting })
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showPanel)
  // Photon lives in the tray, so closing every window does not quit it.
  app.on('window-all-closed', () => {})
  app.on('before-quit', () => {
    quitting = true
    stopNames()
    closeConflicts()
    globalShortcut.unregisterAll()
    // Never leave the screen recolored.
    if (backendReady) {
      backend.clear()
      backend.stop()
    }
  })
  if (process.platform === 'darwin') app.dock?.hide()
  app.whenReady().then(start)
}

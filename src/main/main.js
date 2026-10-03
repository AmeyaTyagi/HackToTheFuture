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
import { createDwell } from './geometry.js'
import { load, save, sanitize } from './settings.js'
import { registerShortcuts } from './shortcuts.js'
import {
  preload,
  loadPage,
  createPanel,
  setPanelHeight,
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
let panelHiddenAt = 0

// Windows that need true colors on screen (judge view, vision test) pause
// correction while they are open.
const pausedBy = new Set()

const status = { backendError: null, shortcutErrors: [], actionError: null }

function isCorrecting() {
  return backendReady && settings.enabled && pausedBy.size === 0
}

function applyCorrection() {
  if (!backendReady) return
  if (isCorrecting()) backend.apply(correct(settings.type, settings.severity, settings.boost))
  else backend.clear()
}

function currentState() {
  return {
    settings,
    status: {
      ...status,
      backend: backend?.name ?? 'none',
      namesOn: names !== null,
      conflictsOn: conflicts !== null,
      simulatorOn: Boolean(findPage('simulator')),
    },
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
    broadcast()
  })
}

// Takes a snapshot without Photon's own panel in it. The panel stays open
// on screen; it is only excluded from capture for the moment of the read.
async function takeSnapshot() {
  const open = panel && !panel.isDestroyed() && panel.isVisible()
  if (!open) return capture.snapshot()
  panel.setContentProtection(true)
  try {
    await sleep(60)
    return await capture.snapshot()
  } finally {
    panel.setContentProtection(false)
  }
}

function rememberSnapshot({ bitmap, size }) {
  const image = nativeImage.createFromBitmap(bitmap, size)
  lastSnapshot = { dataUrl: image.toDataURL(), width: size.width, height: size.height }
}

// ---- Actions -------------------------------------------------------------

function findPage(page) {
  return BrowserWindow.getAllWindows().find((win) => !win.isDestroyed() && win.photonPage === page)
}

// The shortcut opens the judge view, and closes it if it is already open.
async function openSimulator() {
  const open = findPage('simulator')
  if (open) return open.close()
  rememberSnapshot(await takeSnapshot())
  const win = createSimulator()
  win.photonPage = 'simulator'
  pauseWhileOpen(win)
}

function openTest() {
  const open = findPage('test')
  if (open) return open.focus()
  const win = createTest()
  win.photonPage = 'test'
  pauseWhileOpen(win)
}

function stopNames() {
  if (!names) return
  clearInterval(names.timer)
  if (!names.win.isDestroyed()) names.win.destroy()
  names = null
  broadcast()
}

// Color names: while the mode is on, resting the cursor for DWELL_MS shows
// the name of the color under it. Moving the cursor hides the label again.
const DWELL_MS = 2000

function toggleNames() {
  if (names) return stopNames()
  const live = { win: createNamesLabel(), dwell: createDwell(DWELL_MS), busy: false, timer: null }
  names = live

  async function showName(restingAt) {
    live.busy = true
    try {
      // Read now, so the label names what is on screen at this moment.
      const rgb = await capture.pixelAt(restingAt)
      const cursor = screen.getCursorScreenPoint()
      const moved = Math.hypot(cursor.x - restingAt.x, cursor.y - restingAt.y) > 3
      if (!rgb || names !== live || live.win.isDestroyed() || moved) return
      const { bounds } = screen.getDisplayNearestPoint(cursor)

      // Sit right beside the cursor, below and to its right, flipping at the
      // screen edges.
      const [w, h] = live.win.getSize()
      const gap = 10
      const x = cursor.x + gap + w > bounds.x + bounds.width ? cursor.x - gap - w : cursor.x + gap
      const y = cursor.y + gap + h > bounds.y + bounds.height ? cursor.y - gap - h : cursor.y + gap
      live.win.setPosition(x, y)
      live.win.webContents.send('names:update', { rgb, name: colorName(rgb), hex: toHex(rgb) })
      live.win.showInactive()
    } catch (error) {
      console.error('Photon: could not read the color under the cursor:', error.message)
    } finally {
      live.busy = false
    }
  }

  live.timer = setInterval(() => {
    if (live.win.isDestroyed()) return stopNames()
    const cursor = screen.getCursorScreenPoint()
    const event = live.dwell.update(cursor, Date.now())
    if (event === 'moved' && live.win.isVisible()) live.win.hide()
    if (event === 'dwell' && !live.busy) showName(cursor)
  }, 100)
  broadcast()
}

function closeConflicts() {
  if (!conflicts) return
  globalShortcut.unregister('Escape')
  if (!conflicts.isDestroyed()) conflicts.destroy()
  conflicts = null
  broadcast()
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
    broadcast()
  })
  // Keep the panel usable above the overlay.
  if (panel?.isVisible()) panel.moveTop()
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
  if (panel?.isVisible()) return panel.hide()
  // Clicking the tray icon while the panel is open blurs it first, which
  // hides it; that same click must not open it again.
  if (Date.now() - panelHiddenAt > 300) showPanel()
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
  ipcMain.handle('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
  // The panel asks for the height its content needs, so it never clips or
  // leaves empty space whatever the platform's fonts do.
  ipcMain.handle('window:fit', (event, height) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win !== panel || !Number.isFinite(height)) return
    if (setPanelHeight(height)) placePanel(panel, tray?.getBounds())
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
  capture = await createCapture({
    backend,
    isCorrecting,
    reapply: applyCorrection,
    currentTransform: () => (isCorrecting() ? correct(settings.type, settings.severity, settings.boost) : null),
  })

  registerIpc()
  status.shortcutErrors = registerShortcuts({
    toggle: () => run('toggle'),
    simulator: () => run('simulator'),
    names: () => run('names'),
    conflicts: () => run('conflicts'),
  })

  createTray()
  panel = createPanel()
  // The panel stays open while its features are switched on and off, and
  // hides (it does not quit) as soon as the user clicks anywhere else.
  panel.on('blur', () => {
    if (!panel.webContents.isDevToolsOpened()) panel.hide()
  })
  panel.on('hide', () => {
    panelHiddenAt = Date.now()
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
    runSelfTest({
      backend,
      capture,
      getState: currentState,
      updateSettings,
      run,
      isCorrecting,
      getPanel: () => panel,
      takeSnapshot,
    })
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

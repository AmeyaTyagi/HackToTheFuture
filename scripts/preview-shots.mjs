// Diagnostic: saves a picture of each screen as it looks in a browser
// (sample image, no desktop capture). Needs the dev server running.
// Run with: npx electron scripts/preview-shots.mjs <output folder>
import { app, BrowserWindow } from 'electron'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? 'shots'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const pages = [
  { name: 'index', path: '', width: 700, height: 760 },
  { name: 'panel', path: 'panel/', width: 520, height: 700 },
  { name: 'simulator', path: 'simulator/', width: 1280, height: 800 },
  { name: 'test-intro', path: 'test/', width: 560, height: 720 },
  { name: 'test-plate', path: 'test/', width: 560, height: 760, js: "document.getElementById('start').click()" },
  // The hardest plate on each axis, to check a person with normal vision can read it.
  { name: 'plate-protan-hardest', path: 'test/?plate=protan:5', width: 560, height: 760 },
  { name: 'plate-deutan-hardest', path: 'test/?plate=deutan:5', width: 560, height: 760 },
  { name: 'plate-tritan-hardest', path: 'test/?plate=tritan:5', width: 560, height: 760 },
  {
    name: 'test-result',
    path: 'test/',
    width: 560,
    height: 720,
    // Misses the control plate, which ends the test as unscorable.
    js: "document.getElementById('start').click(); for (let i = 0; i < 30; i++) document.getElementById('nothing').click()",
  },
  { name: 'conflicts', path: 'conflicts/', width: 1280, height: 800 },
  {
    name: 'names',
    path: 'names/',
    width: 1280,
    height: 800,
    js: "window.dispatchEvent(new PointerEvent('pointermove', { clientX: 210, clientY: 230 }))",
    wait: 3300,
  },
]

// Keep running between windows.
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  mkdirSync(out, { recursive: true })
  for (const page of pages) {
    const win = new BrowserWindow({ width: page.width, height: page.height, show: false, useContentSize: true })
    const errors = []
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') errors.push(event.message)
    })
    const url = `http://127.0.0.1:5173/${page.path}`
    // The dev server may reload the page once while it warms up.
    await win.loadURL(url).catch(() => sleep(500).then(() => win.loadURL(url)))
    await sleep(900)
    if (page.js) await win.webContents.executeJavaScript(page.js)
    await sleep(page.wait ?? 900)
    writeFileSync(join(out, `${page.name}.png`), (await win.webContents.capturePage()).toPNG())
    console.log(page.name, errors.length ? `ERRORS: ${errors.join(' | ')}` : 'ok')
    win.destroy()
  }
  app.quit()
})

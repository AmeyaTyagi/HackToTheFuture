// `npm run selftest` drives every feature once on the real screen and prints
// PASS or FAIL for each. It recolors the screen for a few seconds, restores
// the previous settings, and quits. Useful on a new machine or system.

import { BrowserWindow, app, screen } from 'electron'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function meanDifference(a, b) {
  const one = a.bitmap
  const two = b.bitmap
  if (one.length !== two.length) return Infinity
  let sum = 0
  let n = 0
  for (let i = 0; i < one.length; i += 4 * 53) {
    sum += Math.abs(one[i] - two[i]) + Math.abs(one[i + 1] - two[i + 1]) + Math.abs(one[i + 2] - two[i + 2])
    n += 3
  }
  return sum / n
}

function findWindow(page) {
  return BrowserWindow.getAllWindows().find((win) => !win.isDestroyed() && win.webContents.getURL().includes(`/${page}/`))
}

async function read(page, expression) {
  const win = findWindow(page)
  if (!win) return undefined
  return win.webContents.executeJavaScript(expression)
}

export async function runSelfTest({
  backend,
  capture,
  getState,
  updateSettings,
  run,
  isCorrecting,
  getPanel,
  takeSnapshot,
}) {
  const results = []
  const check = (name, ok, detail = '') => {
    results.push(ok)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  }
  const before = { ...getState().settings }

  try {
    const { status } = getState()
    check(`screen backend "${backend.name}" started`, !status.backendError, status.backendError ?? '')
    check('all shortcuts registered', status.shortcutErrors.length === 0, status.shortcutErrors.join(', '))

    // The panel opens at launch and may resize or hide at any moment, which
    // would change the screen between the captures compared below.
    // It shows itself when its page finishes loading, so wait for that first.
    const opening = getPanel()
    if (opening.webContents.isLoading()) {
      await new Promise((resolve) => opening.webContents.once('did-finish-load', resolve))
    }
    await sleep(800)
    opening.hide()
    await sleep(400)

    // Correction. A red and green card guarantees there is color on screen
    // to change; a gray screen looks the same corrected or not.
    const card = new BrowserWindow({
      x: 100,
      y: 100,
      width: 480,
      height: 320,
      frame: false,
      alwaysOnTop: true,
      focusable: false,
    })
    const cardPage = '<body style="margin:0;background:linear-gradient(90deg,rgb(220,40,40) 50%,rgb(40,160,60) 50%)">'
    await card.loadURL('data:text/html,' + encodeURIComponent(cardPage))
    await sleep(500)
    updateSettings({ enabled: false })
    await sleep(400)
    let timer = Date.now()
    const plain = await capture.raw()
    const firstCapture = Date.now() - timer
    timer = Date.now()
    await capture.raw()
    console.log(`      (screen capture takes ${firstCapture} ms the first time, ${Date.now() - timer} ms after that)`)
    updateSettings({ enabled: true, type: 'deutan', severity: 1 })
    await sleep(600)
    check('correction is active', isCorrecting())
    if (backend.capturesIncludeEffect) {
      const corrected = await capture.raw()
      const change = meanDifference(plain, corrected)
      check('the screen is recolored', change > 2, `mean change ${change.toFixed(2)} per channel`)
    } else {
      await sleep(1500)
      const frames = await read('overlay', "document.getElementById('screen').width")
      check('the overlay is drawing the screen', frames > 300, `frame width ${frames}`)
    }
    const lifted = await capture.snapshot()
    const drift = meanDifference(plain, lifted)
    check('snapshots hold true colors while correcting', drift < 3, `differs from uncorrected by ${drift.toFixed(2)}`)
    await sleep(300)
    check('correction resumes after a snapshot', isCorrecting())

    // Color reads. While the screen is recolored, the color under a point
    // must come back exact, and without lifting correction (no flicker).
    if (capture.pixelAtPhysical && backend.capturesIncludeEffect) {
      const red = screen.dipToScreenPoint({ x: 200, y: 260 })
      const green = screen.dipToScreenPoint({ x: 480, y: 260 })
      const wrong = []
      const liftsBefore = capture.lifts
      for (const type of ['protan', 'deutan', 'tritan', 'achroma']) {
        for (const boost of [1, 2, 3]) {
          updateSettings({ enabled: true, type, severity: 1, boost })
          await sleep(150)
          const a = await capture.pixelAtPhysical(red)
          const b = await capture.pixelAtPhysical(green)
          if (String(a) !== '220,40,40') wrong.push(`${type} ${boost}x red read as ${a}`)
          if (String(b) !== '40,160,60') wrong.push(`${type} ${boost}x green read as ${b}`)
        }
      }
      check('colors are read exactly under every type and boost', wrong.length === 0, wrong.slice(0, 3).join('; '))
      check('reading a color does not flicker the screen', capture.lifts === liftsBefore, `${capture.lifts - liftsBefore} flickers in 24 reads`)
      updateSettings({ enabled: true, type: 'deutan', severity: 1, boost: before.boost })
      await sleep(150)
    }
    card.destroy()

    // The panel stays open, and stays out of snapshots.
    const panel = getPanel()
    panel.show()
    await sleep(400)
    const withPanelOpen = await takeSnapshot()
    check('the panel stays open while a snapshot is taken', panel.isVisible())
    panel.hide()
    await sleep(400)
    const withPanelHidden = await capture.snapshot()
    const leak = meanDifference(withPanelOpen, withPanelHidden)
    check('the open panel is left out of snapshots', leak < 0.5, `differs from a snapshot without it by ${leak.toFixed(2)}`)
    panel.show()
    await sleep(300)

    // Judge view.
    await run('simulator')
    await sleep(3000)
    check('judge view drew the snapshot', (await read('simulator', "document.getElementById('message') === null")) === true)
    check('correction pauses during judge view', !isCorrecting())
    findWindow('simulator')?.close()
    await sleep(500)
    check('correction resumes after judge view', isCorrecting())

    // Color names.
    // The label appears once the cursor has rested for two seconds, so
    // this check needs the mouse left alone.
    // The judge view took focus, which hides the panel; bring it back.
    panel.show()
    await sleep(300)
    await run('names')
    await sleep(1500)
    check('color names stays hidden at first', findWindow('names')?.isVisible() === false)
    // Two seconds of rest plus the time one screen capture takes.
    const waitStart = Date.now()
    while (Date.now() - waitStart < 9000 && findWindow('names')?.isVisible() !== true) await sleep(200)
    const name = await read('names', "document.getElementById('name').textContent")
    const shown = findWindow('names')?.isVisible() === true
    if (shown) console.log(`      (label appeared ${((Date.now() - waitStart + 1500) / 1000).toFixed(1)} s after the mode was turned on)`)
    check('color names appears after the cursor rests', shown && Boolean(name), shown ? name : 'label not shown; was the mouse moved?')
    check('the panel stays open while color names is on', panel.isVisible())
    await run('names')
    await sleep(300)
    check('color names turns off', !getState().status.namesOn)

    // Conflict finder.
    await run('conflicts')
    await sleep(3000)
    check('the panel stays open while the conflict finder is on', panel.isVisible())
    const title = await read('conflicts', "document.getElementById('title').textContent")
    check('conflict finder scanned the screen', Boolean(title) && !title.startsWith('Scanning'), title ?? 'no window')
    await run('conflicts')
    await sleep(300)
    check('conflict finder closes', !findWindow('conflicts'))

    // Vision test.
    await run('test')
    await sleep(1500)
    check('the panel hides when another window is clicked or opened', !panel.isVisible())
    const plates = await read('test', "document.getElementById('start').click(); document.getElementById('progress').textContent")
    check('vision test shows plates', String(plates).startsWith('Plate 1 of'), plates ?? 'no window')
    check('correction pauses during the vision test', !isCorrecting())
    findWindow('test')?.close()
    await sleep(500)
  } catch (error) {
    check('self test ran to the end', false, error.message)
  } finally {
    updateSettings(before)
  }

  const failed = results.filter((ok) => !ok).length
  console.log(failed ? `\n${failed} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`)
  app.exit(failed ? 1 : 0)
}

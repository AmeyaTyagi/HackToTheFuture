// `npm run selftest` drives every feature once on the real screen and prints
// PASS or FAIL for each. It recolors the screen for a few seconds, restores
// the previous settings, and quits. Useful on a new machine or system.

import { BrowserWindow, app } from 'electron'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function meanDifference(a, b) {
  const one = a.toBitmap()
  const two = b.toBitmap()
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

export async function runSelfTest({ backend, capture, getState, updateSettings, run, isCorrecting }) {
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

    // Correction. A red and green card guarantees there is color on screen
    // to change; a gray screen looks the same corrected or not.
    const card = new BrowserWindow({ width: 480, height: 320, frame: false, alwaysOnTop: true, focusable: false })
    const cardPage = '<body style="margin:0;background:linear-gradient(90deg,rgb(220,40,40) 50%,rgb(40,160,60) 50%)">'
    await card.loadURL('data:text/html,' + encodeURIComponent(cardPage))
    await sleep(500)
    updateSettings({ enabled: false })
    await sleep(400)
    const plain = (await capture.raw()).image
    updateSettings({ enabled: true, type: 'deutan', severity: 1 })
    await sleep(600)
    check('correction is active', isCorrecting())
    if (backend.capturesIncludeEffect) {
      const corrected = (await capture.raw()).image
      const change = meanDifference(plain, corrected)
      check('the screen is recolored', change > 2, `mean change ${change.toFixed(2)} per channel`)
    } else {
      await sleep(1500)
      const frames = await read('overlay', "document.getElementById('screen').width")
      check('the overlay is drawing the screen', frames > 300, `frame width ${frames}`)
    }
    const lifted = (await capture.snapshot()).image
    const drift = meanDifference(plain, lifted)
    check('snapshots hold true colors while correcting', drift < 3, `differs from uncorrected by ${drift.toFixed(2)}`)
    await sleep(300)
    check('correction resumes after a snapshot', isCorrecting())
    card.destroy()

    // Judge view.
    await run('simulator')
    await sleep(3000)
    check('judge view drew the snapshot', (await read('simulator', "document.getElementById('message') === null")) === true)
    check('correction pauses during judge view', !isCorrecting())
    findWindow('simulator')?.close()
    await sleep(500)
    check('correction resumes after judge view', isCorrecting())

    // Color names.
    await run('names')
    await sleep(1500)
    const name = await read('names', "document.getElementById('name').textContent")
    check('color names label shows a color', Boolean(name) && name !== 'Move the pointer', name ?? 'no window')
    await run('names')
    await sleep(300)
    check('color names turns off', !getState().status.namesOn)

    // Conflict finder.
    await run('conflicts')
    await sleep(3000)
    const title = await read('conflicts', "document.getElementById('title').textContent")
    check('conflict finder scanned the screen', Boolean(title) && !title.startsWith('Scanning'), title ?? 'no window')
    await run('conflicts')
    await sleep(300)
    check('conflict finder closes', !findWindow('conflicts'))

    // Vision test.
    await run('test')
    await sleep(1500)
    const plates = await read('test', "document.getElementById('start').click(); document.getElementById('progress').textContent")
    check('vision test shows plates', plates === 'Plate 1 of 10', plates ?? 'no window')
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

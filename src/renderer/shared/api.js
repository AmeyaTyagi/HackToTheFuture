// Every page talks to Photon through this module. In the desktop app that
// is the preload API. In a plain browser it is a stand-in that keeps
// settings in memory and supplies a sample image where a screen snapshot
// is needed, so the interface can be worked on at http://localhost:5173.

import { makeSample } from './sample.js'

const PAGES = { simulator: 'simulator', test: 'test', conflicts: 'conflicts', names: 'names' }
const STORE = 'photon-browser-settings'

function createStub() {
  let settings = { enabled: false, type: 'deutan', severity: 0.8, boost: 2 }
  try {
    settings = { ...settings, ...JSON.parse(sessionStorage.getItem(STORE)) }
  } catch {
    // Start from the defaults.
  }
  const listeners = []
  const state = () => ({
    settings,
    status: { backend: 'browser', backendError: null, shortcutErrors: [], actionError: null, namesOn: false },
  })
  return {
    platform: 'browser',
    getState: async () => state(),
    setSettings: async (partial) => {
      settings = { ...settings, ...partial }
      try {
        sessionStorage.setItem(STORE, JSON.stringify(settings))
      } catch {
        // Private windows may refuse storage; the page still works.
      }
      listeners.forEach((callback) => callback(state()))
      return state()
    },
    run: async (action) => {
      if (PAGES[action]) location.href = `../${PAGES[action]}/`
    },
    getSnapshot: async () => {
      const canvas = makeSample()
      return { dataUrl: canvas.toDataURL(), width: canvas.width, height: canvas.height }
    },
    close: async () => {
      location.href = '../'
    },
    minimize: async () => {},
    fit: async () => {},
    quit: async () => {},
    on: (channel, callback) => {
      if (channel === 'state:changed') listeners.push(callback)
    },
  }
}

export const inBrowser = !window.photon
export const photon = window.photon ?? createStub()

// Marks <html> with where the page runs, so styles can adapt:
// in-app or in-browser, plus platform-darwin, platform-win32 or platform-linux.
export function markPlatform() {
  document.documentElement.classList.add(inBrowser ? 'in-browser' : 'in-app', `platform-${photon.platform}`)
}

export function showBrowserBanner(text = 'Preview in a browser. Recoloring the real screen needs the Photon desktop app.') {
  if (!inBrowser) return
  const banner = document.createElement('div')
  banner.className = 'browser-banner'
  banner.textContent = text
  document.body.append(banner)
}

export function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load the screen snapshot.'))
    image.src = dataUrl
  })
}

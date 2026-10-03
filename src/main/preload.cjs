const { contextBridge, ipcRenderer } = require('electron')

// Channels the main process may push to a page.
const PUSH = ['state:changed', 'names:update', 'overlay:transform']

contextBridge.exposeInMainWorld('photon', {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('state:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  run: (action) => ipcRenderer.invoke('action:run', action),
  getSnapshot: () => ipcRenderer.invoke('capture:last'),
  close: () => ipcRenderer.invoke('window:close'),
  quit: () => ipcRenderer.invoke('app:quit'),
  on: (channel, callback) => {
    if (!PUSH.includes(channel)) return
    ipcRenderer.on(channel, (_event, payload) => callback(payload))
  },
})

import { globalShortcut } from 'electron'

export const SHORTCUTS = {
  toggle: 'CommandOrControl+Alt+P',
  simulator: 'CommandOrControl+Alt+S',
  names: 'CommandOrControl+Alt+C',
  conflicts: 'CommandOrControl+Alt+F',
}

// Registers each shortcut and returns the ones the system refused,
// which happens when another app already owns the combination.
export function registerShortcuts(handlers) {
  const failed = []
  for (const [action, accelerator] of Object.entries(SHORTCUTS)) {
    let ok = false
    try {
      ok = globalShortcut.register(accelerator, () => handlers[action]())
    } catch {
      ok = false
    }
    if (!ok) failed.push(accelerator.replace('CommandOrControl', process.platform === 'darwin' ? 'Cmd' : 'Ctrl'))
  }
  return failed
}

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { TYPES, clampSeverity, clampBoost } from '../engine/index.js'

export const DEFAULTS = { enabled: false, type: 'deutan', severity: 0.8, boost: 2 }

// Turns anything (a hand-edited file, a partial update) into valid settings.
export function sanitize(raw) {
  const input = raw && typeof raw === 'object' ? raw : {}
  const severity = Number(input.severity)
  return {
    enabled: input.enabled === true,
    type: TYPES.includes(input.type) ? input.type : DEFAULTS.type,
    severity: Number.isFinite(severity) ? clampSeverity(severity) : DEFAULTS.severity,
    boost: Number.isFinite(Number(input.boost)) && input.boost !== null ? clampBoost(input.boost) : DEFAULTS.boost,
  }
}

export function load(file) {
  try {
    return sanitize(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return { ...DEFAULTS }
  }
}

export function save(file, settings) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(sanitize(settings), null, 2))
  } catch (error) {
    console.error('Photon: could not save settings:', error.message)
  }
}

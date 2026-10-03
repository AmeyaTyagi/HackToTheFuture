import { photon, inBrowser, markPlatform, showBrowserBanner } from '../shared/api.js'

const $ = (id) => document.getElementById(id)
const mod = photon.platform === 'darwin' ? '⌘⌥' : 'Ctrl+Alt+'

markPlatform()
if (inBrowser) $('quit').hidden = true
showBrowserBanner()

// Size the window to the content.
if (!inBrowser) {
  const panel = document.querySelector('.panel')
  new ResizeObserver(() => photon.fit(panel.getBoundingClientRect().height)).observe(panel)
}

for (const kbd of document.querySelectorAll('kbd[data-key]')) kbd.textContent = mod + kbd.dataset.key
$('hint').textContent = `${mod}P turns correction on and off`

function render({ settings, status }) {
  $('enabled').checked = settings.enabled
  $('enabled').disabled = Boolean(status.backendError)
  $('subtitle').textContent = settings.enabled ? 'Color correction is on' : 'Color correction is off'

  for (const button of $('types').children) {
    button.setAttribute('aria-pressed', String(button.dataset.type === settings.type))
  }

  const percent = Math.round(settings.severity * 100)
  // Leave the slider alone while it is being dragged.
  if (document.activeElement !== $('severity')) $('severity').value = percent
  $('severity').style.setProperty('--fill-pct', `${percent}%`)
  $('severity-value').textContent = `${percent}%`

  $('names').setAttribute('aria-pressed', String(status.namesOn))
  $('names').querySelector('kbd').textContent = status.namesOn ? 'On' : `${mod}C`

  renderStatus(settings, status)
}

function renderStatus(settings, status) {
  const el = $('status')
  el.className = ''
  el.replaceChildren()
  const error = status.backendError ?? status.actionError
  if (error) {
    el.className = 'error'
    el.textContent = error + ' '
    if (photon.platform === 'darwin' && /Screen Recording/.test(error)) {
      const open = document.createElement('button')
      open.textContent = 'Open System Settings'
      open.onclick = () => photon.run('permissions')
      el.append(open)
    }
  } else if (status.shortcutErrors.length) {
    el.textContent = `Another app is using ${status.shortcutErrors.join(', ')}, so that shortcut is unavailable.`
  } else if (status.namesOn) {
    el.textContent = 'Color names is on. Rest the pointer on a color for 3 seconds to see its name.'
  } else if (settings.type === 'achroma') {
    el.textContent = 'Color cannot be restored for monochrome vision. Photon raises contrast instead; Color names tells you what a color is.'
  }
}

$('enabled').addEventListener('change', (event) => photon.setSettings({ enabled: event.target.checked }).then(render))

$('types').addEventListener('click', (event) => {
  const button = event.target.closest('button')
  if (button) photon.setSettings({ type: button.dataset.type }).then(render)
})

$('severity').addEventListener('input', (event) => {
  photon.setSettings({ severity: Number(event.target.value) / 100 }).then(render)
})

for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', () => photon.run(button.dataset.action))
}

$('quit').addEventListener('click', () => photon.quit())
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') photon.close()
})

photon.on('state:changed', render)
photon.getState().then(render)

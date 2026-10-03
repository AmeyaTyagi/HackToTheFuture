// Draws a stand-in "screenshot" for when Photon runs in a plain browser,
// which cannot capture the screen. It is full of the color pairs that
// color blind people commonly confuse.

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

export function makeSample(width = 1600, height = 1000) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#f2f2f7'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#1d1d1f'
  ctx.font = '600 34px system-ui, sans-serif'
  ctx.fillText('Quarterly results', 60, 80)

  // Bar chart: profit and loss told apart by color alone.
  ctx.fillStyle = '#fff'
  roundRect(ctx, 60, 120, 700, 380, 18)
  const bars = [120, -60, 180, 90, -110, 210, -40, 150]
  bars.forEach((v, i) => {
    ctx.fillStyle = v > 0 ? '#3fa34d' : '#d1453b'
    const h = Math.abs(v)
    ctx.fillRect(110 + i * 78, v > 0 ? 330 - h : 330, 48, h)
  })
  ctx.fillStyle = '#6e6e73'
  ctx.font = '20px system-ui, sans-serif'
  ctx.fillText('Profit (green) and loss (red) by month', 100, 470)

  // Line chart with red, green, orange and brown series.
  ctx.fillStyle = '#fff'
  roundRect(ctx, 800, 120, 740, 380, 18)
  const series = [
    ['#e03131', [300, 260, 280, 200, 220, 160]],
    ['#2f9e44', [330, 300, 240, 250, 190, 200]],
    ['#f08c00', [220, 240, 200, 180, 170, 150]],
    ['#8d5524', [380, 360, 370, 330, 320, 300]],
  ]
  ctx.lineWidth = 6
  ctx.lineJoin = 'round'
  for (const [color, ys] of series) {
    ctx.strokeStyle = color
    ctx.beginPath()
    ys.forEach((y, i) => (i ? ctx.lineTo(860 + i * 125, y + 60) : ctx.moveTo(860, y + 60)))
    ctx.stroke()
  }

  // Status badges.
  ctx.fillStyle = '#fff'
  roundRect(ctx, 60, 540, 700, 400, 18)
  const rows = [
    ['Build', '#2f9e44', 'Passed'],
    ['Tests', '#e03131', 'Failed'],
    ['Deploy', '#f08c00', 'Waiting'],
    ['Review', '#2f9e44', 'Approved'],
  ]
  rows.forEach(([name, color, text], i) => {
    const y = 600 + i * 84
    ctx.fillStyle = '#1d1d1f'
    ctx.font = '26px system-ui, sans-serif'
    ctx.fillText(name, 100, y + 10)
    ctx.fillStyle = color
    roundRect(ctx, 520, y - 26, 200, 52, 26)
  })

  // Pie chart with blue-purple and pink-gray pairs.
  ctx.fillStyle = '#fff'
  roundRect(ctx, 800, 540, 740, 400, 18)
  const slices = ['#4263eb', '#7950f2', '#f783ac', '#adb5bd', '#12b886', '#fab005']
  slices.forEach((color, i) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(1000, 740)
    ctx.arc(1000, 740, 160, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2)
    ctx.fill()
  })
  // Traffic light.
  ctx.fillStyle = '#2b2b2e'
  roundRect(ctx, 1300, 590, 120, 300, 30)
  ;['#e03131', '#f5c400', '#2f9e44'].forEach((color, i) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(1360, 650 + i * 90, 34, 0, Math.PI * 2)
    ctx.fill()
  })

  return canvas
}

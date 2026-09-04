import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { deflateSync } from 'node:zlib'

const colors = {
  transparent: [0, 0, 0, 0],
  ink: '#05070D',
  outline: '#080B14',
  graphite: '#07090F',
  navy: '#12182E',
  panel: '#17213A',
  screen: '#07101F',
  line: '#2C3A5F',
  brightLine: '#536184',
  muted: '#A8B2CB',
  cyan: '#42D9F4',
  blue: '#5A82FF',
  purple: '#7F67D8',
  green: '#69E697',
  gold: '#F3CF64',
  amber: '#FFD36F',
  daySkyTop: '#78B9D8',
  daySkyMid: '#9DD4E8',
  dayHorizon: '#D0F1F7',
  nightSkyTop: '#080D1F',
  nightSkyMid: '#121A3A',
  nightHorizon: '#1C2E57',
}

function rgba(hex, alpha = 255) {
  const value = hex.replace('#', '')
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16), alpha]
}

function makeCanvas(width, height) {
  return { width, height, pixels: new Uint8Array(width * height * 4) }
}

function rect(canvas, x, y, width, height, color, alpha = 255) {
  const [r, g, b, a] = typeof color === 'string' ? rgba(color, alpha) : color
  for (let yy = Math.max(0, y); yy < Math.min(canvas.height, y + height); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(canvas.width, x + width); xx++) {
      const index = (yy * canvas.width + xx) * 4
      canvas.pixels[index] = r
      canvas.pixels[index + 1] = g
      canvas.pixels[index + 2] = b
      canvas.pixels[index + 3] = a
    }
  }
}

function hline(canvas, x, y, width, color, alpha = 255) {
  rect(canvas, x, y, width, 1, color, alpha)
}

function vline(canvas, x, y, height, color, alpha = 255) {
  rect(canvas, x, y, 1, height, color, alpha)
}

function gradientRows(canvas, stops) {
  for (let y = 0; y < canvas.height; y++) {
    const t = y / Math.max(1, canvas.height - 1)
    const before = stops.findLast((stop) => stop.at <= t) ?? stops[0]
    const after = stops.find((stop) => stop.at >= t) ?? stops.at(-1)
    const span = Math.max(0.0001, after.at - before.at)
    const local = Math.max(0, Math.min(1, (t - before.at) / span))
    const a = rgba(before.color)
    const b = rgba(after.color)
    const color = [
      Math.round(a[0] + (b[0] - a[0]) * local),
      Math.round(a[1] + (b[1] - a[1]) * local),
      Math.round(a[2] + (b[2] - a[2]) * local),
      255,
    ]
    rect(canvas, 0, y, canvas.width, 1, color)
  }
}

function drawSky(isNight) {
  const canvas = makeCanvas(960, 540)
  gradientRows(canvas, isNight
    ? [
        { at: 0, color: colors.nightSkyTop },
        { at: 0.5, color: colors.nightSkyMid },
        { at: 1, color: colors.nightHorizon },
      ]
    : [
        { at: 0, color: colors.daySkyTop },
        { at: 0.58, color: colors.daySkyMid },
        { at: 1, color: colors.dayHorizon },
      ])

  if (isNight) {
    const stars = [
      [78, 40, 2], [126, 88, 1], [194, 54, 1], [278, 120, 2], [348, 68, 1], [434, 92, 1],
      [520, 38, 2], [602, 134, 1], [686, 72, 1], [760, 118, 2], [846, 54, 1], [914, 94, 1],
    ]
    stars.forEach(([x, y, size], index) => rect(canvas, x, y, size, size, index % 3 === 0 ? colors.gold : '#C9D8FF', 210))
    rect(canvas, 788, 54, 34, 34, '#EAF1FF', 225)
    rect(canvas, 802, 51, 24, 36, colors.nightSkyMid, 220)
    rect(canvas, 760, 72, 100, 4, '#A8B2CB', 45)
  } else {
    rect(canvas, 774, 56, 46, 46, '#FFE28A', 230)
    rect(canvas, 748, 75, 96, 6, '#FFF0B0', 55)
    drawCloud(canvas, 110, 92, 130, 25)
    drawCloud(canvas, 385, 126, 154, 18)
    drawCloud(canvas, 676, 112, 132, 18)
  }

  return canvas
}

function drawCloud(canvas, x, y, width, alpha) {
  rect(canvas, x, y + 10, width, 16, '#FFFFFF', alpha)
  rect(canvas, x + 18, y + 2, 44, 22, '#FFFFFF', alpha)
  rect(canvas, x + 56, y, 58, 24, '#FFFFFF', alpha)
  rect(canvas, x + width - 42, y + 8, 38, 15, '#FFFFFF', Math.round(alpha * 0.75))
}

const buildingSets = {
  far: [
    [28, 114, 48, 126], [104, 90, 56, 150], [188, 128, 72, 112], [306, 100, 58, 140],
    [418, 124, 76, 116], [546, 96, 58, 144], [660, 118, 70, 122], [790, 84, 62, 156],
    [916, 126, 76, 114], [1052, 104, 62, 136], [1160, 122, 54, 118],
  ],
  mid: [
    [8, 92, 74, 178], [122, 64, 84, 206], [258, 112, 104, 158], [420, 76, 88, 194],
    [584, 108, 96, 162], [742, 70, 104, 200], [924, 104, 98, 166], [1094, 78, 86, 192],
  ],
  near: [
    [24, 102, 94, 208], [166, 58, 106, 252], [352, 120, 112, 190], [532, 70, 112, 240],
    [720, 116, 120, 194], [920, 68, 106, 242], [1088, 112, 96, 198],
  ],
}

function drawCityLayer(layer, isNight) {
  const heights = { far: 240, mid: 270, near: 310 }
  const canvas = makeCanvas(1200, heights[layer])
  const palette = {
    far: isNight ? ['#101A36', '#152044', '#0E1730'] : ['#5F8CA9', '#6D9BB5', '#557F9E'],
    mid: isNight ? ['#0D1730', '#122041', '#0B142A'] : ['#416D8D', '#4F7F9C', '#365F7C'],
    near: isNight ? ['#0A1226', '#111A31', '#080F21'] : ['#30536F', '#3B647F', '#294B66'],
  }[layer]
  const alpha = { far: 175, mid: 220, near: 245 }[layer]
  const floor = heights[layer]

  buildingSets[layer].forEach(([x, y, width, height], index) => {
    const color = palette[index % palette.length]
    rect(canvas, x, y, width, height, color, alpha)
    rect(canvas, x + 8, y - 8, width - 16, 8, color, alpha)
    if (index % 2 === 0) {
      rect(canvas, x + Math.floor(width * 0.62), y - 28, 3, 28, isNight ? colors.cyan : '#2B5570', isNight ? 145 : 90)
      rect(canvas, x + Math.floor(width * 0.62) - 5, y - 30, 13, 3, isNight ? colors.cyan : '#2B5570', isNight ? 110 : 70)
    }
    hline(canvas, x + 5, y + 7, width - 10, '#7EA7BF', layer === 'far' ? 45 : 70)
    rect(canvas, x + width - 7, y + 14, 3, height - 20, colors.ink, layer === 'near' ? 75 : 42)

    const columns = Math.max(2, Math.floor(width / (layer === 'near' ? 16 : 14)))
    const rows = Math.max(2, Math.floor(height / (layer === 'near' ? 24 : 22)))
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const lit = ((row * 7 + col * 5 + index * 3) % (isNight ? 4 : 7)) !== 0
        if (!lit) continue
        const wx = x + 10 + col * Math.floor((width - 18) / columns)
        const wy = y + 18 + row * Math.floor((height - 28) / rows)
        const windowColor = isNight
          ? (row + col + index) % 5 === 0 ? colors.gold : colors.cyan
          : '#B7E9FF'
        const windowAlpha = isNight ? (layer === 'near' ? 180 : 135) : (layer === 'near' ? 95 : 70)
        rect(canvas, wx, wy, layer === 'near' ? 6 : 5, layer === 'near' ? 9 : 7, windowColor, windowAlpha)
      }
    }
  })

  rect(canvas, 0, floor - 2, 1200, 2, colors.line, layer === 'far' ? 60 : 100)
  return canvas
}

function drawWindowFrame() {
  const canvas = makeCanvas(560, 286)
  rect(canvas, 18, 14, 524, 258, colors.outline)
  rect(canvas, 24, 20, 512, 246, '#2B3558')
  rect(canvas, 36, 32, 488, 222, colors.transparent)
  rect(canvas, 26, 22, 508, 7, colors.brightLine, 215)
  rect(canvas, 32, 30, 4, 222, '#51678F', 200)
  rect(canvas, 520, 30, 4, 222, '#17213A', 230)
  rect(canvas, 276, 22, 8, 238, '#3F557A', 235)
  rect(canvas, 34, 138, 492, 8, '#3F557A', 235)
  rect(canvas, 42, 40, 228, 4, '#D7F2FF', 55)
  rect(canvas, 292, 42, 208, 3, '#D7F2FF', 45)
  rect(canvas, 48, 206, 458, 24, '#D7F2FF', 30)
  rect(canvas, 34, 252, 492, 12, colors.ink, 80)
  rect(canvas, 0, 0, 560, 8, colors.cyan, 80)
  return canvas
}

function drawWall() {
  const canvas = makeCanvas(960, 420)
  rect(canvas, 0, 0, 960, 420, colors.navy)
  rect(canvas, 0, 0, 960, 78, '#1C2A48')
  rect(canvas, 0, 372, 960, 48, '#111827')
  rect(canvas, 0, 402, 960, 14, '#2A3555')
  rect(canvas, 0, 116, 960, 4, colors.gold, 150)
  rect(canvas, 84, 188, 140, 188, '#172746')
  rect(canvas, 88, 192, 132, 180, colors.panel)
  hline(canvas, 102, 210, 98, colors.cyan, 165)
  hline(canvas, 110, 250, 76, colors.gold, 160)
  hline(canvas, 100, 292, 108, colors.cyan, 150)
  rect(canvas, 108, 326, 88, 42, colors.screen)
  hline(canvas, 118, 340, 34, colors.cyan, 150)
  hline(canvas, 158, 354, 42, colors.purple, 145)
  rect(canvas, 736, 92, 158, 88, '#111C2F')
  rect(canvas, 744, 100, 38, 68, '#101827')
  rect(canvas, 794, 92, 48, 76, '#101827')
  hline(canvas, 754, 110, 18, colors.green, 210)
  hline(canvas, 802, 104, 22, colors.cyan, 180)
  rect(canvas, 820, 192, 150, 12, '#2A3555')
  rect(canvas, 186, 362, 38, 34, colors.panel)
  rect(canvas, 198, 374, 14, 6, colors.green, 180)

  for (let x = 42; x < 930; x += 86) {
    rect(canvas, x, 392, 36, 4, x % 172 === 42 ? '#1D2743' : '#24304F')
  }

  rect(canvas, 242, 77, 556, 286, colors.transparent)

  return canvas
}

function drawFloor() {
  const canvas = makeCanvas(960, 156)
  rect(canvas, 0, 0, 960, 156, '#111525')
  rect(canvas, 0, 0, 960, 16, '#2A3555')
  rect(canvas, 0, 16, 960, 6, '#0B1020', 180)

  for (let y = 36; y < 156; y += 26) {
    hline(canvas, 0, y, 960, '#263656', 130)
  }

  for (let x = -28; x < 960; x += 58) {
    for (let y = 20; y < 156; y += 26) {
      hline(canvas, x - Math.floor(y * 0.42), y, 36, '#1D2743', 130)
    }
  }

  rect(canvas, 328, 28, 250, 42, colors.ink, 55)
  rect(canvas, 682, 24, 140, 28, colors.ink, 70)
  rect(canvas, 0, 142, 960, 14, '#080B14', 120)
  return canvas
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(canvas) {
  const raw = Buffer.alloc((canvas.width * 4 + 1) * canvas.height)
  for (let y = 0; y < canvas.height; y++) {
    const rowStart = y * (canvas.width * 4 + 1)
    raw[rowStart] = 0
    Buffer.from(canvas.pixels.buffer, y * canvas.width * 4, canvas.width * 4).copy(raw, rowStart + 1)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(canvas.width, 0)
  ihdr.writeUInt32BE(canvas.height, 4)
  ihdr[8] = 8
  ihdr[9] = 6

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND'),
  ])
}

async function writePng(path, canvas) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, encodePng(canvas))
  console.log(`${path} ${canvas.width}x${canvas.height}`)
}

await writePng('public/assets/environment/sky-day.png', drawSky(false))
await writePng('public/assets/environment/sky-night.png', drawSky(true))
await writePng('public/assets/environment/city-far-day.png', drawCityLayer('far', false))
await writePng('public/assets/environment/city-far-night.png', drawCityLayer('far', true))
await writePng('public/assets/environment/city-mid-day.png', drawCityLayer('mid', false))
await writePng('public/assets/environment/city-mid-night.png', drawCityLayer('mid', true))
await writePng('public/assets/environment/city-near-day.png', drawCityLayer('near', false))
await writePng('public/assets/environment/city-near-night.png', drawCityLayer('near', true))
await writePng('public/assets/environment/window-frame.png', drawWindowFrame())
await writePng('public/assets/environment/wall.png', drawWall())
await writePng('public/assets/environment/floor.png', drawFloor())

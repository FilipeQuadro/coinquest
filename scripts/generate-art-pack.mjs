import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { deflateSync } from 'node:zlib'

const colors = {
  transparent: [0, 0, 0, 0],
  ink: '#05070D',
  outline: '#080B14',
  shadow: '#07090F',
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
  red: '#FF786F',
  orange: '#FFA45B',
  skinHi: '#F0B78A',
  skin: '#D79C73',
  skinShadow: '#A86C55',
  skinDark: '#6F3F38',
  hairDark: '#0D0A12',
  hair: '#16121C',
  hairMid: '#21192A',
  hairHi: '#3A284E',
  jacketDark: '#141A36',
  jacket: '#27315F',
  jacketHi: '#31427C',
  pants: '#171B2E',
  pantsHi: '#263656',
  metalDark: '#0C1221',
  metal: '#202846',
  metalHi: '#536184',
}

function rgba(hex, alpha = 255) {
  const value = hex.replace('#', '')
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16), alpha]
}

function makeCanvas(width, height) {
  return {
    width,
    height,
    pixels: new Uint8Array(width * height * 4),
  }
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

function drawProgrammerFrame(canvas, frame, row, pose) {
  const ox = frame * 48
  const oy = row * 64
  const breathe = pose.breathe ?? 0
  const headShift = pose.headShift ?? 0
  const arm = pose.arm ?? 0
  const glance = pose.glance ?? 0
  const mode = pose.mode ?? (pose.typing ? 'typing' : 'idle')
  const typing = mode === 'typing'
  const income = mode === 'income'
  const expense = mode === 'expense'
  const walking = mode === 'walk'
  const lean = typing ? 1 : 0
  const torsoY = 26 - breathe + lean
  const hx = ox + headShift + (typing ? 1 : 0)
  const headY = oy + 10 - breathe + lean
  const step = pose.step ?? 0
  const lift = pose.lift ?? 0

  rect(canvas, ox + 9, oy + 59, 30, 3, colors.ink, 120)

  const leftLegX = walking ? 14 - step : 14
  const rightLegX = walking ? 28 + step : 28
  const leftFootX = walking ? 13 - step * 2 : 14
  const rightFootX = walking ? 28 + step * 2 : 28
  const leftFootY = walking && step > 0 ? 52 - lift : 51
  const rightFootY = walking && step < 0 ? 52 - lift : 51
  rect(canvas, ox + leftFootX - 2, oy + leftFootY + 2, 12, 3, colors.outline)
  rect(canvas, ox + leftFootX, oy + leftFootY, 9, 5, colors.cyan)
  rect(canvas, ox + leftFootX - 1, oy + 56, 12, 2, '#0B1020')
  rect(canvas, ox + rightFootX - 1, oy + rightFootY + 2, 13, 3, colors.outline)
  rect(canvas, ox + rightFootX, oy + rightFootY, 10, 5, colors.purple)
  rect(canvas, ox + rightFootX - 1, oy + 56, 13, 2, '#0B1020')

  rect(canvas, ox + leftLegX, oy + 41, 8, 13, colors.outline)
  rect(canvas, ox + leftLegX + 1, oy + 40, 6, 14, colors.pants)
  rect(canvas, ox + leftLegX + 3, oy + 43, 3, 8, colors.pantsHi)
  rect(canvas, ox + rightLegX - 1, oy + 41, 8, 13, colors.outline)
  rect(canvas, ox + rightLegX, oy + 40, 6, 14, colors.pants)
  rect(canvas, ox + rightLegX + 1, oy + 45, 3, 7, colors.pantsHi)
  rect(canvas, ox + 23, oy + 40, 2, 16, '#0D1225')

  rect(canvas, ox + 11, torsoY, 27, 18 + breathe, colors.outline)
  rect(canvas, ox + 10, torsoY + 4, 29, 13 + breathe, colors.outline)
  rect(canvas, ox + 13, torsoY, 23, 19 + breathe, colors.jacket)
  rect(canvas, ox + 13, torsoY, 23, 4, colors.jacketHi)
  rect(canvas, ox + 13, torsoY + 13, 5, 5, colors.jacketDark)
  rect(canvas, ox + 31, torsoY + 12, 5, 6, colors.jacketDark)
  rect(canvas, ox + 23, torsoY + 2, 2, 18 + breathe, colors.cyan)
  rect(canvas, ox + 25, torsoY + 5, 1, 14, colors.purple)
  rect(canvas, ox + 19, torsoY - 1, 10, 5, '#1D254B')
  vline(canvas, ox + 20, torsoY + 8, 9, colors.green)
  vline(canvas, ox + 29, torsoY + 8, 9, colors.purple)

  if (income) {
    const raise = pose.raise ?? 0
    rect(canvas, ox + 7, oy + 26 - raise, 8, 13, colors.outline)
    rect(canvas, ox + 9, oy + 26 - raise, 5, 12, colors.jacket)
    rect(canvas, ox + 5, oy + 24 - raise, 9, 5, colors.skinHi)
    rect(canvas, ox + 34, oy + 26 - raise, 8, 13, colors.outline)
    rect(canvas, ox + 35, oy + 26 - raise, 5, 12, colors.jacket)
    rect(canvas, ox + 36, oy + 24 - raise, 9, 5, colors.skinHi)
    hline(canvas, ox + 8, oy + 36 - raise, 7, colors.cyan)
    hline(canvas, ox + 34, oy + 36 - raise, 7, colors.purple)
    rect(canvas, ox + 6, oy + 16 - raise, 3, 3, colors.gold)
    rect(canvas, ox + 39, oy + 17 - raise, 3, 3, colors.green)
  } else if (expense) {
    const dip = pose.dip ?? 0
    rect(canvas, ox + 8, oy + 32 + dip, 8, 13, colors.outline)
    rect(canvas, ox + 10, oy + 32 + dip, 5, 12, colors.jacket)
    rect(canvas, ox + 12, oy + 43 + dip, 8, 5, colors.skin)
    rect(canvas, ox + 32, oy + 29 + dip, 8, 15, colors.outline)
    rect(canvas, ox + 33, oy + 29 + dip, 5, 14, colors.jacket)
    rect(canvas, ox + 31, oy + 38 + dip, 8, 5, colors.skinHi)
    hline(canvas, ox + 8, oy + 42 + dip, 7, colors.amber)
    hline(canvas, ox + 33, oy + 37 + dip, 7, colors.purple)
  } else if (typing) {
    const tap = arm < 0 ? -1 : 1
    rect(canvas, ox + 8, oy + 33 + tap, 8, 8, colors.outline)
    rect(canvas, ox + 10, oy + 33 + tap, 6, 8, colors.jacket)
    rect(canvas, ox + 15, oy + 39, 9, 5, colors.outline)
    rect(canvas, ox + 16, oy + 39, 8, 4, colors.jacketHi)
    rect(canvas, ox + 20 + Math.min(0, arm), oy + 43 + (tap < 0 ? 1 : 0), 7, 4, colors.skin)
    rect(canvas, ox + 32, oy + 34 - tap, 7, 8, colors.outline)
    rect(canvas, ox + 32, oy + 34 - tap, 5, 8, colors.jacket)
    rect(canvas, ox + 25, oy + 40, 10, 5, colors.outline)
    rect(canvas, ox + 25, oy + 40, 9, 4, colors.jacketHi)
    rect(canvas, ox + 23 + Math.max(0, arm), oy + 44 + (tap > 0 ? 1 : 0), 7, 4, colors.skinHi)
    hline(canvas, ox + 17, oy + 38, 7, colors.cyan)
    hline(canvas, ox + 28, oy + 39, 7, colors.purple)
  } else if (walking) {
    const swing = Math.sign(step || 1)
    rect(canvas, ox + 8, oy + 30 - swing, 8, 17, colors.outline)
    rect(canvas, ox + 9, oy + 30 - swing, 5, 16, colors.jacket)
    rect(canvas, ox + 8, oy + 45 - swing, 8, 5, colors.skin)
    hline(canvas, ox + 8, oy + 43 - swing, 7, colors.cyan)
    rect(canvas, ox + 34, oy + 30 + swing, 8, 17, colors.outline)
    rect(canvas, ox + 35, oy + 30 + swing, 5, 16, colors.jacket)
    rect(canvas, ox + 35, oy + 45 + swing, 8, 5, colors.skinHi)
    hline(canvas, ox + 34, oy + 43 + swing, 7, colors.purple)
  } else {
    rect(canvas, ox + 7, oy + 30 - breathe, 8, 17 + breathe, colors.outline)
    rect(canvas, ox + 9, oy + 30 - breathe, 5, 16 + breathe, colors.jacket)
    rect(canvas, ox + 7, oy + 45, 8, 5, colors.skin)
    hline(canvas, ox + 8, oy + 43, 7, colors.cyan)
    rect(canvas, ox + 34, oy + 30 - breathe, 8, 17 + breathe, colors.outline)
    rect(canvas, ox + 35, oy + 30 - breathe, 5, 16 + breathe, colors.jacket)
    rect(canvas, ox + 35, oy + 45, 8, 5, colors.skinHi)
    hline(canvas, ox + 34, oy + 43, 7, colors.purple)
  }

  rect(canvas, hx + 14, headY + 2, 20, 16, colors.outline)
  rect(canvas, hx + 16, headY + 1, 16, 17, colors.skin)
  rect(canvas, hx + 17, headY + 2, 8, 4, colors.skinHi)
  rect(canvas, hx + 29, headY + 6, 3, 9, colors.skinShadow)
  rect(canvas, hx + 13, headY + 6, 3, 7, colors.skinShadow)
  rect(canvas, hx + 32, headY + 7, 3, 7, colors.skinShadow)
  rect(canvas, hx + 14, headY - 3, 18, 6, colors.hair)
  rect(canvas, hx + 17, headY - 5, 13, 4, colors.hairMid)
  rect(canvas, hx + 12, headY + 1, 9, 5, colors.hairDark)
  rect(canvas, hx + 29, headY + 1, 5, 9, colors.hairDark)
  rect(canvas, hx + 18, headY + 2, 7, 3, colors.hairMid)
  hline(canvas, hx + 19, headY - 4, 9, colors.hairHi)

  hline(canvas, hx + 18, headY + 9, 5, colors.cyan)
  hline(canvas, hx + 26, headY + 9, 5, colors.cyan)
  rect(canvas, hx + 20 + glance, headY + 10, 2, 1, colors.screen)
  rect(canvas, hx + 28 + glance, headY + 10, 2, 1, colors.screen)
  hline(canvas, hx + 23, headY + 10, 3, colors.skinDark)
  rect(canvas, hx + 24, headY + 13, 2, 2, colors.skinShadow)
  if (income) {
    hline(canvas, hx + 22, headY + 17, 7, colors.green)
  } else if (expense) {
    hline(canvas, hx + 22, headY + 16, 6, colors.skinDark)
    hline(canvas, hx + 24, headY + 15, 3, colors.amber)
  } else {
    hline(canvas, hx + 22, headY + 17, 6, colors.skinDark)
  }

  hline(canvas, hx + 16, headY - 3, 17, colors.cyan)
  rect(canvas, hx + 34, headY + 5, 3, 9, colors.cyan)
  rect(canvas, hx + 35, headY + 8, 2, 4, colors.blue)
  hline(canvas, hx + 36, headY + 14, 5, colors.cyan)
  rect(canvas, hx + 40, headY + 15, 2, 1, colors.cyan)
}

function drawProgrammer() {
  const canvas = makeCanvas(48 * 28, 64)
  const idle = [
    { breathe: 0, arm: 0, glance: 0 },
    { breathe: 1, arm: 0, glance: 0 },
    { breathe: 1, arm: 0, glance: 1 },
    { breathe: 0, arm: 0, glance: 0 },
  ]
  const typing = [
    { breathe: 0, arm: -3, headShift: -1, glance: 0, mode: 'typing' },
    { breathe: 0, arm: 3, headShift: 0, glance: 1, mode: 'typing' },
    { breathe: 1, arm: -2, headShift: 0, glance: 0, mode: 'typing' },
    { breathe: 1, arm: 3, headShift: 1, glance: 1, mode: 'typing' },
    { breathe: 0, arm: -3, headShift: 0, glance: 0, mode: 'typing' },
    { breathe: 0, arm: 2, headShift: 0, glance: 1, mode: 'typing' },
  ]
  const income = [
    { breathe: 0, raise: 0, glance: 0, mode: 'income' },
    { breathe: 1, raise: 2, glance: 0, mode: 'income' },
    { breathe: 1, raise: 5, glance: 1, mode: 'income' },
    { breathe: 0, raise: 6, glance: 1, mode: 'income' },
    { breathe: 1, raise: 3, glance: 0, mode: 'income' },
    { breathe: 0, raise: 0, glance: 0, mode: 'income' },
  ]
  const expense = [
    { breathe: 0, dip: 0, headShift: 0, glance: 1, mode: 'expense' },
    { breathe: 1, dip: 1, headShift: 1, glance: 1, mode: 'expense' },
    { breathe: 1, dip: 2, headShift: 1, glance: 1, mode: 'expense' },
    { breathe: 0, dip: 0, headShift: 0, glance: 0, mode: 'expense' },
  ]
  const walk = [
    { breathe: 0, step: 0, lift: 0, glance: 0, mode: 'walk' },
    { breathe: 1, step: 1, lift: 1, glance: 0, mode: 'walk' },
    { breathe: 1, step: 2, lift: 2, glance: 0, mode: 'walk' },
    { breathe: 0, step: 1, lift: 1, glance: 1, mode: 'walk' },
    { breathe: 0, step: 0, lift: 0, glance: 1, mode: 'walk' },
    { breathe: 1, step: -1, lift: 1, glance: 0, mode: 'walk' },
    { breathe: 1, step: -2, lift: 2, glance: 0, mode: 'walk' },
    { breathe: 0, step: -1, lift: 1, glance: 0, mode: 'walk' },
  ]

  idle.forEach((pose, index) => drawProgrammerFrame(canvas, index, 0, pose))
  typing.forEach((pose, index) => drawProgrammerFrame(canvas, index + 4, 0, pose))
  income.forEach((pose, index) => drawProgrammerFrame(canvas, index + 10, 0, pose))
  expense.forEach((pose, index) => drawProgrammerFrame(canvas, index + 16, 0, pose))
  walk.forEach((pose, index) => drawProgrammerFrame(canvas, index + 20, 0, pose))
  return canvas
}

function drawWorkstation() {
  const canvas = makeCanvas(320, 174)
  rect(canvas, 14, 142, 292, 12, colors.ink, 105)

  rect(canvas, 48, 68, 58, 70, colors.outline)
  rect(canvas, 51, 65, 51, 72, colors.metal)
  rect(canvas, 55, 69, 42, 14, '#303A62')
  rect(canvas, 57, 86, 37, 35, '#151B32')
  hline(canvas, 58, 72, 33, colors.metalHi)
  rect(canvas, 58, 126, 38, 7, '#0B1020')
  rect(canvas, 67, 132, 20, 10, colors.metalDark)

  rect(canvas, 26, 94, 30, 25, colors.outline)
  rect(canvas, 29, 89, 24, 28, colors.purple)
  hline(canvas, 31, 92, 18, '#A58AF0')
  rect(canvas, 32, 54, 7, 62, colors.outline)
  rect(canvas, 34, 54, 4, 59, '#3C4A72')
  rect(canvas, 12, 38, 42, 18, colors.outline)
  rect(canvas, 14, 40, 38, 13, colors.cyan, 185)
  hline(canvas, 16, 42, 28, '#B8F7FF', 150)

  rect(canvas, 96, 20, 148, 83, colors.outline)
  rect(canvas, 101, 18, 138, 79, '#2A3558')
  rect(canvas, 107, 24, 126, 67, colors.screen)
  hline(canvas, 108, 24, 124, colors.metalHi)
  vline(canvas, 107, 25, 64, '#1B2C48')
  rect(canvas, 112, 28, 116, 59, '#091322')
  rect(canvas, 162, 98, 20, 19, colors.outline)
  rect(canvas, 166, 98, 13, 18, '#35405F')
  rect(canvas, 124, 112, 96, 9, colors.outline)
  rect(canvas, 127, 112, 90, 6, colors.metal)

  rect(canvas, 220, 47, 42, 55, colors.outline)
  rect(canvas, 223, 49, 36, 49, '#202A48')
  rect(canvas, 228, 55, 27, 36, colors.screen)
  hline(canvas, 229, 55, 25, colors.metalHi)
  rect(canvas, 244, 101, 10, 13, colors.outline)
  rect(canvas, 246, 101, 6, 12, '#35405F')

  rect(canvas, 15, 118, 268, 20, colors.outline)
  rect(canvas, 18, 115, 262, 19, '#30385F')
  hline(canvas, 18, 115, 262, colors.metalHi)
  hline(canvas, 19, 132, 260, '#1D2542')
  rect(canvas, 124, 123, 78, 7, colors.outline)
  rect(canvas, 127, 123, 72, 4, '#0B1020')
  rect(canvas, 207, 121, 25, 9, colors.outline)
  rect(canvas, 210, 121, 19, 5, '#151B32')

  rect(canvas, 232, 34, 52, 84, colors.outline)
  rect(canvas, 235, 37, 46, 77, '#111827')
  hline(canvas, 240, 42, 34, colors.green)
  rect(canvas, 241, 55, 9, 48, '#263656')
  rect(canvas, 256, 55, 9, 48, '#2F3E68')
  rect(canvas, 270, 62, 5, 35, colors.purple)
  rect(canvas, 275, 105, 3, 4, colors.cyan)
  hline(canvas, 237, 110, 41, colors.metalHi)

  rect(canvas, 42, 134, 14, 36, '#1D2542')
  hline(canvas, 42, 134, 14, colors.brightLine)
  rect(canvas, 238, 134, 14, 36, '#1D2542')
  hline(canvas, 238, 134, 14, colors.brightLine)
  rect(canvas, 286, 112, 10, 4, colors.cyan)
  rect(canvas, 214, 132, 70, 3, colors.line)
  rect(canvas, 284, 132, 18, 3, colors.line)
  return canvas
}

function drawVault() {
  const canvas = makeCanvas(120, 108)
  rect(canvas, 14, 90, 92, 7, colors.ink, 120)
  rect(canvas, 8, 73, 104, 19, colors.outline)
  rect(canvas, 12, 70, 96, 18, colors.metalDark)
  hline(canvas, 14, 70, 92, colors.metalHi)
  hline(canvas, 18, 86, 84, '#0B1020')

  rect(canvas, 17, 19, 86, 64, colors.outline)
  rect(canvas, 23, 15, 74, 10, colors.outline)
  rect(canvas, 25, 15, 70, 7, colors.metalHi)
  rect(canvas, 23, 23, 74, 56, '#172033')
  rect(canvas, 25, 25, 69, 8, '#263656')
  rect(canvas, 25, 67, 69, 10, '#0F1728')
  rect(canvas, 17, 31, 12, 43, '#25345A')
  hline(canvas, 19, 33, 8, colors.metalHi)
  rect(canvas, 91, 31, 12, 43, '#25345A')
  hline(canvas, 93, 33, 8, colors.metalHi)

  rect(canvas, 34, 33, 52, 39, colors.outline)
  rect(canvas, 37, 35, 46, 34, colors.screen)
  hline(canvas, 40, 38, 40, colors.metalHi)
  hline(canvas, 40, 66, 40, '#1B2C48')
  vline(canvas, 37, 41, 23, '#1B2C48')
  vline(canvas, 82, 41, 23, '#1B2C48')

  rect(canvas, 51, 76, 19, 12, colors.outline)
  rect(canvas, 54, 76, 14, 9, '#4D5F8B')
  hline(canvas, 55, 78, 12, colors.gold)
  rect(canvas, 56, 8, 8, 12, '#42557F')
  rect(canvas, 49, 4, 22, 7, colors.outline)
  rect(canvas, 52, 4, 16, 5, colors.green)
  rect(canvas, 6, 52, 8, 18, '#22345A')
  rect(canvas, 106, 52, 8, 18, '#2A2856')
  rect(canvas, 27, 27, 7, 7, colors.metalHi)
  rect(canvas, 86, 27, 7, 7, colors.metalHi)
  rect(canvas, 28, 75, 10, 4, colors.line)
  rect(canvas, 81, 75, 10, 4, colors.line)
  rect(canvas, 31, 42, 3, 16, '#0B1020')
  rect(canvas, 86, 42, 3, 16, '#0B1020')
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
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

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

await writePng('public/assets/characters/programmer.png', drawProgrammer())
await writePng('public/assets/furniture/workstation-base.png', drawWorkstation())
await writePng('public/assets/tech/digital-vault-shell.png', drawVault())

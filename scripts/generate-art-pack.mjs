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

// Character sheet and vault shell come from generate-cozy-base-pack.mjs (V2.2D).
await writePng('public/assets/furniture/workstation-base.png', drawWorkstation())

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { inflateSync, deflateSync } from 'node:zlib'
import { chromium } from 'playwright'

const baseUrl = 'http://127.0.0.1:5173/'
const outputDir = 'test-results/screenshots'
const spriteSheetPath = 'public/assets/characters/programmer.png'
const animations = [
  { name: 'idle', start: 0, count: 4 },
  { name: 'typing', start: 4, count: 6 },
  { name: 'income', start: 10, count: 6 },
  { name: 'expense', start: 16, count: 4 },
  { name: 'walk', start: 20, count: 8 },
]

await mkdir(outputDir, { recursive: true })
const paths = []

function parsePng(buffer) {
  let offset = 8
  let width = 0
  let height = 0
  const chunks = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
    }

    if (type === 'IDAT') chunks.push(data)
    if (type === 'IEND') break
  }

  const inflated = inflateSync(Buffer.concat(chunks))
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const source = y * (width * 4 + 1) + 1
    inflated.copy(pixels, y * width * 4, source, source + width * 4)
  }

  return { width, height, pixels }
}

function makeCanvas(width, height) {
  return { width, height, pixels: new Uint8Array(width * height * 4) }
}

function fill(canvas, color) {
  for (let index = 0; index < canvas.pixels.length; index += 4) {
    canvas.pixels[index] = color[0]
    canvas.pixels[index + 1] = color[1]
    canvas.pixels[index + 2] = color[2]
    canvas.pixels[index + 3] = color[3]
  }
}

function blitScaled(source, target, sourceX, sourceY, sourceWidth, sourceHeight, scale, targetX, targetY) {
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const sourceIndex = ((sourceY + y) * source.width + sourceX + x) * 4
      for (let yy = 0; yy < scale; yy++) {
        for (let xx = 0; xx < scale; xx++) {
          const targetIndex = ((targetY + y * scale + yy) * target.width + targetX + x * scale + xx) * 4
          target.pixels[targetIndex] = source.pixels[sourceIndex]
          target.pixels[targetIndex + 1] = source.pixels[sourceIndex + 1]
          target.pixels[targetIndex + 2] = source.pixels[sourceIndex + 2]
          target.pixels[targetIndex + 3] = source.pixels[sourceIndex + 3]
        }
      }
    }
  }
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

async function writeAnimationPreview(sheet, animation) {
  const scale = 5
  const gap = 6
  const target = makeCanvas(animation.count * 48 * scale + (animation.count - 1) * gap, 64 * scale)
  fill(target, [7, 9, 15, 255])

  for (let index = 0; index < animation.count; index++) {
    blitScaled(sheet, target, (animation.start + index) * 48, 0, 48, 64, scale, index * (48 * scale + gap), 0)
  }

  const path = `${outputDir}/character-pack-${animation.name}.png`
  await writeFile(path, encodePng(target))
  paths.push(path)
}

async function captureSceneScreenshots() {
  const browser = await chromium.launch()
  const shots = [
    { name: 'desktop-1440', width: 1440, height: 1100 },
    { name: 'iphone-390', width: 390, height: 844 },
  ]

  for (const shot of shots) {
    const context = await browser.newContext({ viewport: { width: shot.width, height: shot.height } })
    const page = await context.newPage()
    await page.goto(baseUrl)
    await page.locator('.game-canvas canvas').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(700)
    await page.locator('.pwa-toast .icon-button').click({ timeout: 1500 }).catch(() => {})
    await page.evaluate(() => window.scrollTo(0, 0))

    const path = `${outputDir}/character-pack-${shot.name}.png`
    await page.screenshot({ path, fullPage: true })
    paths.push(path)
    await context.close()
  }

  await browser.close()
}

const sheet = parsePng(await readFile(spriteSheetPath))
for (const animation of animations) {
  await writeAnimationPreview(sheet, animation)
}

await writeAnimationPreview(sheet, { name: 'spritesheet-preview', start: 0, count: 28 })
await captureSceneScreenshots()

console.log(paths.join('\n'))

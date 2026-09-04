import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { inflateSync, deflateSync } from 'node:zlib'
import { chromium } from 'playwright'

const baseUrl = 'http://127.0.0.1:5173/'
const outputDir = 'test-results/screenshots'
const sceneShots = [
  { path: 'environment-day-desktop-1440.png', width: 1440, height: 1100, timeOfDay: 'day', fullPage: true },
  { path: 'environment-night-desktop-1440.png', width: 1440, height: 1100, timeOfDay: 'night', fullPage: true },
  { path: 'environment-day-iphone-390.png', width: 390, height: 844, timeOfDay: 'day', fullPage: true },
  { path: 'environment-night-iphone-390.png', width: 390, height: 844, timeOfDay: 'night', fullPage: true },
  { path: 'environment-laptop-1024.png', width: 1024, height: 980, timeOfDay: 'day', fullPage: true },
  { path: 'environment-tablet-768.png', width: 768, height: 960, timeOfDay: 'night', fullPage: true },
  { path: 'environment-room-close.png', width: 1024, height: 760, timeOfDay: 'night', fullPage: false },
]

await mkdir(outputDir, { recursive: true })
const paths = []

async function assertCanvasEdgesAreCovered(page, name) {
  const exposedRatio = await page.evaluate(() => {
    const canvas = document.querySelector('.game-canvas canvas')
    if (!(canvas instanceof HTMLCanvasElement)) return 1
    const context = canvas.getContext('2d')
    if (!context) return 1

    const { width, height } = canvas
    const data = context.getImageData(0, 0, width, height).data
    const samples = []

    for (let x = 0; x < width; x += 6) {
      samples.push(x * 4, ((height - 1) * width + x) * 4)
    }

    for (let y = 0; y < height; y += 6) {
      samples.push((y * width) * 4, (y * width + width - 1) * 4)
    }

    const isClearColor = (index) => {
      const r = data[index]
      const g = data[index + 1]
      const b = data[index + 2]
      const isDayClear = Math.abs(r - 120) <= 1 && Math.abs(g - 185) <= 1 && Math.abs(b - 216) <= 1
      const isNightClear = Math.abs(r - 9) <= 1 && Math.abs(g - 17) <= 1 && Math.abs(b - 37) <= 1
      return isDayClear || isNightClear
    }

    return samples.filter(isClearColor).length / samples.length
  })

  if (exposedRatio > 0.05) {
    throw new Error(`Possible uncovered camera edge at ${name}: ${Math.round(exposedRatio * 100)}% clear-color edge samples`)
  }
}

const browser = await chromium.launch()

for (const shot of sceneShots) {
  const context = await browser.newContext({ viewport: { width: shot.width, height: shot.height } })
  const page = await context.newPage()
  await page.goto(`${baseUrl}?timeOfDay=${shot.timeOfDay}`)
  await page.locator('.game-canvas canvas').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.pwa-toast .icon-button').click({ timeout: 1500 }).catch(() => {})
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(600)

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  if (hasHorizontalOverflow) throw new Error(`Horizontal overflow detected at ${shot.path}`)
  await assertCanvasEdgesAreCovered(page, shot.path)

  const path = `${outputDir}/${shot.path}`
  if (shot.fullPage) {
    await page.screenshot({ path, fullPage: true })
  } else {
    await page.locator('.game-canvas').screenshot({ path })
  }
  paths.push(path)
  await context.close()
}

await browser.close()

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

function blit(source, target, targetX, targetY) {
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const sourceIndex = (y * source.width + x) * 4
      const alpha = source.pixels[sourceIndex + 3]
      if (alpha === 0) continue

      const xx = targetX + x
      const yy = targetY + y
      if (xx < 0 || yy < 0 || xx >= target.width || yy >= target.height) continue

      const targetIndex = (yy * target.width + xx) * 4
      target.pixels[targetIndex] = source.pixels[sourceIndex]
      target.pixels[targetIndex + 1] = source.pixels[sourceIndex + 1]
      target.pixels[targetIndex + 2] = source.pixels[sourceIndex + 2]
      target.pixels[targetIndex + 3] = alpha
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

async function createCityLayerPreview() {
  const preview = makeCanvas(1200, 360)
  fill(preview, [8, 13, 31, 255])
  blit(parsePng(await readFile('public/assets/environment/sky-night.png')), preview, 0, -180)
  blit(parsePng(await readFile('public/assets/environment/city-far-night.png')), preview, 0, 120)
  blit(parsePng(await readFile('public/assets/environment/city-mid-night.png')), preview, 0, 90)
  blit(parsePng(await readFile('public/assets/environment/city-near-night.png')), preview, 0, 50)
  const path = `${outputDir}/environment-city-layers.png`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, encodePng(preview))
  paths.push(path)
}

await createCityLayerPreview()
console.log(paths.join('\n'))

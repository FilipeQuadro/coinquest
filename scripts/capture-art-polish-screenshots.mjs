import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { inflateSync, deflateSync } from 'node:zlib'
import { chromium } from 'playwright'

const baseUrl = 'http://127.0.0.1:5173/'
const outputDir = 'test-results/screenshots'
const viewports = [
  { name: 'desktop-1440', width: 1440, height: 1100, capture: true },
  { name: 'laptop-1024', width: 1024, height: 980, capture: true },
  { name: 'tablet-768', width: 768, height: 960, capture: false },
  { name: 'iphone-430', width: 430, height: 932, capture: true },
  { name: 'iphone-390', width: 390, height: 844, capture: true },
]
const entries = ['recebi 1000 de pagamento', 'gastei 180 no mercado no pix']

await mkdir(outputDir, { recursive: true })

async function quickEntry(page, phrase, expectedCount) {
  await page.getByTestId('quick-entry-input').fill(phrase)
  await page.getByTestId('quick-entry-analyze').click()
  await page.getByTestId('quick-entry-confirm').waitFor({ state: 'visible', timeout: 8_000 })
  await page.getByTestId('quick-entry-confirm').click()
  await page.getByTestId('history-item').nth(expectedCount - 1).waitFor({ state: 'visible', timeout: 8_000 })
}

async function assertCanvasEdgesAreCovered(page, viewportName) {
  const exposedRatio = await page.evaluate(() => {
    const canvas = document.querySelector('.game-canvas canvas')
    if (!(canvas instanceof HTMLCanvasElement)) return 1
    const context = canvas.getContext('2d')
    if (!context) return 1

    const { width, height } = canvas
    const data = context.getImageData(0, 0, width, height).data
    const samples = []

    for (let x = 0; x < width; x += 4) {
      samples.push((x * 4), ((height - 1) * width + x) * 4)
    }

    for (let y = 0; y < height; y += 4) {
      samples.push((y * width) * 4, (y * width + width - 1) * 4)
    }

    const isClearColor = (index) => {
      const r = data[index]
      const g = data[index + 1]
      const b = data[index + 2]
      const isDayClear = Math.abs(r - 120) < 3 && Math.abs(g - 185) < 3 && Math.abs(b - 216) < 3
      const isNightClear = Math.abs(r - 9) < 3 && Math.abs(g - 17) < 3 && Math.abs(b - 37) < 3
      return isDayClear || isNightClear
    }

    const exposed = samples.filter(isClearColor).length
    return exposed / samples.length
  })

  if (exposedRatio > 0.05) {
    throw new Error(`Possible uncovered camera edge at ${viewportName}: ${Math.round(exposedRatio * 100)}% clear-color edge samples`)
  }
}

const browser = await chromium.launch()
const paths = []

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
  const page = await context.newPage()
  await page.goto(baseUrl)
  await page.locator('.game-canvas canvas').first().waitFor({ state: 'visible', timeout: 15_000 })

  for (const [entryIndex, entry] of entries.entries()) {
    await quickEntry(page, entry, entryIndex + 1)
  }

  await page.locator('.pwa-toast .icon-button').click({ timeout: 1500 }).catch(() => {})
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  if (hasHorizontalOverflow) {
    throw new Error(`Horizontal overflow detected at ${viewport.name}`)
  }

  await assertCanvasEdgesAreCovered(page, viewport.name)

  if (viewport.capture) {
    const path = `${outputDir}/art-polish-${viewport.name}.png`
    await page.screenshot({ path, fullPage: true })
    paths.push(path)
  }

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

async function writePreview(path, sourcePath, scale, frame = null) {
  const source = parsePng(await readFile(sourcePath))
  const sourceX = frame === null ? 0 : frame * 48
  const sourceWidth = frame === null ? source.width : 48
  const sourceHeight = frame === null ? source.height : 64
  const preview = makeCanvas(sourceWidth * scale, sourceHeight * scale)
  fill(preview, [7, 9, 15, 255])
  blitScaled(source, preview, sourceX, 0, sourceWidth, sourceHeight, scale, 0, 0)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, encodePng(preview))
  paths.push(path)
}

await writePreview(`${outputDir}/art-polish-programmer-idle.png`, 'public/assets/characters/programmer.png', 6, 0)
await writePreview(`${outputDir}/art-polish-programmer-typing.png`, 'public/assets/characters/programmer.png', 6, 4)
await writePreview(`${outputDir}/art-polish-workstation.png`, 'public/assets/furniture/workstation-base.png', 3)
await writePreview(`${outputDir}/art-polish-vault.png`, 'public/assets/tech/digital-vault-shell.png', 5)

console.log(paths.join('\n'))

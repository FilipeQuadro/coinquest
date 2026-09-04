import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = 'http://127.0.0.1:5173/'
const outputDir = 'test-results/screenshots'
const viewports = [
  { name: 'desktop-1440', width: 1440, height: 1100 },
  { name: 'laptop-1024', width: 1024, height: 980 },
  { name: 'tablet-768', width: 768, height: 980 },
  { name: 'iphone-430', width: 430, height: 932 },
  { name: 'iphone-390', width: 390, height: 844 },
]
const entries = ['recebi 1000 de pagamento', 'gastei 180 no mercado no pix']

await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch()
const paths = []

async function quickEntry(page, phrase, expectedCount) {
  await page.getByTestId('quick-entry-input').fill(phrase)
  await page.getByTestId('quick-entry-analyze').click()
  await page.getByTestId('quick-entry-confirm').waitFor({ state: 'visible', timeout: 8_000 })
  await page.getByTestId('quick-entry-confirm').click()
  await page.getByTestId('history-item').nth(expectedCount - 1).waitFor({ state: 'visible', timeout: 8_000 })
}

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
  const page = await context.newPage()
  await page.goto(baseUrl)
  await page.locator('.game-canvas canvas').waitFor({ state: 'visible', timeout: 15_000 })

  for (const [entryIndex, entry] of entries.entries()) {
    await quickEntry(page, entry, entryIndex + 1)
  }

  await page.locator('.pwa-toast .icon-button').click({ timeout: 1500 }).catch(() => {})
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(250)

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  if (hasHorizontalOverflow) {
    throw new Error(`Horizontal overflow detected at ${viewport.name}`)
  }

  const path = `${outputDir}/visual-overhaul-${viewport.name}.png`
  await page.screenshot({ path, fullPage: true })
  paths.push(path)
  await context.close()
}

await browser.close()
console.log(paths.join('\n'))

import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = 'http://127.0.0.1:5173/?timeOfDay=night'
const outputDir = 'test-results/screenshots'
const paths = []

await mkdir(outputDir, { recursive: true })

async function quickEntry(page, phrase, expectedCount) {
  await page.getByTestId('quick-entry-input').fill(phrase)
  await page.getByTestId('quick-entry-analyze').click()
  await page.getByTestId('quick-entry-confirm').click()
  await page.getByTestId('history-item').nth(expectedCount - 1).waitFor({ state: 'visible', timeout: 8_000 })
}

async function saveBudget(page, value) {
  await page.getByTestId('budget-total-input').fill(value)
  await page.getByTestId('budget-save').click()
  await page.getByTestId('budget-card').waitFor({ state: 'visible', timeout: 8_000 })
}

async function prepare(page) {
  await page.goto(baseUrl)
  await page.locator('.game-canvas canvas').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.pwa-toast .icon-button').click({ timeout: 1500 }).catch(() => {})
  await page.evaluate(() => window.scrollTo(0, 0))
}

async function screenshot(page, filename, fullPage = true) {
  const path = `${outputDir}/${filename}`
  await page.screenshot({ path, fullPage })
  paths.push(path)
}

const browser = await chromium.launch()

const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const desktopPage = await desktop.newPage()
await prepare(desktopPage)
await screenshot(desktopPage, 'budget-empty.png')
await saveBudget(desktopPage, '1000')
await quickEntry(desktopPage, 'recebi 2000 de pagamento', 1)
await quickEntry(desktopPage, 'gastei 250 no mercado no pix', 2)
await screenshot(desktopPage, 'budget-normal.png')
await quickEntry(desktopPage, 'gastei 900 com transporte', 3)
await screenshot(desktopPage, 'budget-over-limit.png')
await screenshot(desktopPage, 'budget-desktop-1440.png')
await desktop.close()

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mobilePage = await mobile.newPage()
await prepare(mobilePage)
await saveBudget(mobilePage, '1000')
await quickEntry(mobilePage, 'recebi 2000 de pagamento', 1)
await quickEntry(mobilePage, 'gastei 250 no mercado no pix', 2)
await screenshot(mobilePage, 'budget-iphone-390.png')
await mobile.close()

await browser.close()

console.log(paths.join('\n'))

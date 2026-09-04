import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = 'http://127.0.0.1:5173/?timeOfDay=night'
const outputDir = 'test-results/screenshots'
const paths = []

await mkdir(outputDir, { recursive: true })

function selectedMonthFromDate(date = new Date()) {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
  }
}

function dateInputForMonth(month, day = 20) {
  return [
    month.year,
    String(month.month + 1).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

async function prepare(page) {
  await page.goto(baseUrl)
  await page.locator('.game-canvas canvas').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.pwa-toast .icon-button').click({ timeout: 1500 }).catch(() => {})
  await page.evaluate(() => window.scrollTo(0, 0))
}

async function createCard(page) {
  await page.getByTestId('toggle-card-form').click()
  await page.getByTestId('card-name').fill('Nubank')
  await page.getByTestId('card-limit').fill('3000')
  await page.getByTestId('card-closing-day').fill('25')
  await page.getByTestId('card-due-day').fill('2')
  await page.getByTestId('save-card').click()
}

async function openPurchasePreview(page) {
  const month = selectedMonthFromDate()
  await page.getByTestId('toggle-purchase-form').click()
  await page.getByTestId('purchase-amount').fill('1200')
  await page.getByTestId('purchase-description').fill('Notebook')
  await page.getByTestId('purchase-category').selectOption('Compras')
  await page.getByTestId('purchase-date').fill(dateInputForMonth(month, 20))
  await page.getByTestId('purchase-installments').fill('4')
  await page.getByTestId('purchase-preview').waitFor({ state: 'visible', timeout: 8_000 })
}

async function savePurchaseFromPreview(page) {
  await page.getByTestId('save-purchase').click()
  await page.getByTestId('card-invoice').waitFor({ state: 'visible', timeout: 8_000 })
}

async function payInvoice(page) {
  await page.getByTestId('pay-invoice').click()
  await page.getByTestId('confirm-pay-invoice').click()
  await page.getByTestId('card-invoice').filter({ hasText: 'Paga' }).waitFor({ state: 'visible', timeout: 8_000 })
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
await createCard(desktopPage)
await openPurchasePreview(desktopPage)
await screenshot(desktopPage, 'card-purchase-preview.png')
await savePurchaseFromPreview(desktopPage)
await screenshot(desktopPage, 'card-invoice-open.png')
await screenshot(desktopPage, 'credit-cards-desktop.png')
await payInvoice(desktopPage)
await screenshot(desktopPage, 'card-invoice-paid.png')
await desktop.close()

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mobilePage = await mobile.newPage()
await prepare(mobilePage)
await createCard(mobilePage)
await openPurchasePreview(mobilePage)
await savePurchaseFromPreview(mobilePage)
await screenshot(mobilePage, 'credit-cards-iphone-390.png')
await mobile.close()

await browser.close()

console.log(paths.join('\n'))

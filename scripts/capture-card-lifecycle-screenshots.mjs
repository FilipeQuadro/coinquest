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

async function createPurchase(page) {
  const month = selectedMonthFromDate()
  await page.getByTestId('toggle-purchase-form').click()
  await page.getByTestId('purchase-amount').fill('1200')
  await page.getByTestId('purchase-description').fill('Notebook')
  await page.getByTestId('purchase-category').selectOption('Compras')
  await page.getByTestId('purchase-date').fill(dateInputForMonth(month, 20))
  await page.getByTestId('purchase-installments').fill('4')
  await page.getByTestId('save-purchase').click()
  await page.getByTestId('card-invoice').waitFor({ state: 'visible', timeout: 8_000 })
}

async function seedCardState(page) {
  await prepare(page)
  await createCard(page)
  await createPurchase(page)
}

async function screenshot(page, filename, fullPage = true) {
  const path = `${outputDir}/${filename}`
  await page.screenshot({ path, fullPage })
  paths.push(path)
}

const browser = await chromium.launch()

const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const desktopPage = await desktop.newPage()
await seedCardState(desktopPage)
await desktopPage.getByTestId('pay-invoice').click()
await desktopPage.getByTestId('invoice-payment-box').waitFor({ state: 'visible', timeout: 8_000 })
await screenshot(desktopPage, 'invoice-payment-date-desktop.png')

await desktopPage.getByTestId('confirm-pay-invoice').click()
await desktopPage.getByTestId('correct-invoice-payment').waitFor({ state: 'visible', timeout: 8_000 })
await desktopPage.getByTestId('edit-card').click()
await desktopPage.getByTestId('card-form').waitFor({ state: 'visible', timeout: 8_000 })
await screenshot(desktopPage, 'card-edit.png')

await desktopPage.getByTestId('toggle-card-form').click()
await desktopPage.getByTestId('toggle-card-active').click()
await desktopPage.getByTestId('credit-card-chip').filter({ hasText: 'Inativo' }).waitFor({ state: 'visible', timeout: 8_000 })
await screenshot(desktopPage, 'card-disabled.png')
await desktop.close()

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mobilePage = await mobile.newPage()
await seedCardState(mobilePage)
await mobilePage.getByTestId('pay-invoice').click()
await mobilePage.getByTestId('invoice-payment-box').waitFor({ state: 'visible', timeout: 8_000 })
await screenshot(mobilePage, 'invoice-payment-date-iphone-390.png')
await mobile.close()

await browser.close()

console.log(paths.join('\n'))

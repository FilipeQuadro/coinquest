import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = 'http://127.0.0.1:5173/?timeOfDay=night'
const outputDir = 'test-results/screenshots'
const paths = []

await mkdir(outputDir, { recursive: true })

async function prepare(page) {
  await page.goto(baseUrl)
  await page.locator('.game-canvas canvas').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.pwa-toast .icon-button').click({ timeout: 1500 }).catch(() => {})
  await page.evaluate(() => window.scrollTo(0, 0))
}

async function manualEntry(page, amount, description, category, date) {
  await page.getByTestId('manual-amount-input').fill(amount)
  await page.getByTestId('manual-description-input').fill(description)
  await page.getByTestId('manual-category-select').selectOption(category)
  await page.getByTestId('manual-date-input').fill(date)
  await page.getByTestId('manual-submit').click()
  await page.getByTestId('history-item').first().waitFor({ state: 'visible', timeout: 8_000 })
}

async function saveBudget(page, value) {
  await page.getByTestId('budget-total-input').fill(value)
  await page.getByTestId('budget-save').click()
  await page.getByTestId('budget-card').waitFor({ state: 'visible', timeout: 8_000 })
}

async function screenshot(page, filename, fullPage = true) {
  const path = `${outputDir}/${filename}`
  await page.screenshot({ path, fullPage })
  paths.push(path)
}

function selectedMonthFromDate(date = new Date()) {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
  }
}

function previousMonth(month) {
  return month.month === 0 ? { year: month.year - 1, month: 11 } : { year: month.year, month: month.month - 1 }
}

function dateInputForMonth(month, day = 15) {
  return [
    month.year,
    String(month.month + 1).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

async function setupMonthFlow(page) {
  const sourceMonth = previousMonth(selectedMonthFromDate())
  await prepare(page)
  await page.getByTestId('month-prev').click()
  await saveBudget(page, '1000')
  await manualEntry(page, '250', 'mercado', 'Alimentacao', dateInputForMonth(sourceMonth))
}

const browser = await chromium.launch()

const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const desktopPage = await desktop.newPage()
await setupMonthFlow(desktopPage)
await desktopPage.getByTestId('month-next').click()
await screenshot(desktopPage, 'month-nav-desktop.png')
await desktopPage.getByTestId('month-prev').click()
await desktopPage.getByTestId('edit-transaction').first().click()
await screenshot(desktopPage, 'transaction-edit-desktop.png')
await desktop.close()

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mobilePage = await mobile.newPage()
await setupMonthFlow(mobilePage)
await mobilePage.getByTestId('month-next').click()
await screenshot(mobilePage, 'month-nav-iphone-390.png')
await mobilePage.getByTestId('month-prev').click()
await mobilePage.getByTestId('edit-transaction').first().click()
await screenshot(mobilePage, 'transaction-edit-iphone-390.png')
await mobile.close()

await browser.close()

console.log(paths.join('\n'))

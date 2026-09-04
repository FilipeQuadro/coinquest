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

async function createRecurringRule(page, input) {
  await page.getByTestId('recurring-toggle-form').click()
  await page.getByTestId('recurring-type').selectOption(input.type ?? 'expense')
  await page.getByTestId('recurring-amount').fill(input.amount)
  await page.getByTestId('recurring-description').fill(input.description)
  await page.getByTestId('recurring-category').selectOption(input.category)
  await page.getByTestId('recurring-payment').selectOption(input.paymentMethod ?? 'pix')
  await page.getByTestId('recurring-day').fill(input.day)
  await page.getByTestId('recurring-save').click()
}

async function seedRecurring(page) {
  await createRecurringRule(page, {
    type: 'income',
    amount: '1500',
    description: 'salario',
    category: 'Renda',
    paymentMethod: 'transfer',
    day: '5',
  })
  await createRecurringRule(page, {
    type: 'expense',
    amount: '120',
    description: 'internet',
    category: 'Casa',
    paymentMethod: 'pix',
    day: '10',
  })
  await createRecurringRule(page, {
    type: 'expense',
    amount: '21,90',
    description: 'spotify',
    category: 'Assinaturas',
    paymentMethod: 'credit',
    day: '15',
  })
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
await seedRecurring(desktopPage)
await screenshot(desktopPage, 'recurring-desktop.png')
await desktopPage.getByTestId('month-next').click()
await screenshot(desktopPage, 'recurring-future-month.png')
await desktopPage.getByTestId('recurring-occurrence').filter({ hasText: 'internet' }).getByTestId('confirm-occurrence').click()
await desktopPage.getByTestId('confirm-occurrence-actual').click()
await screenshot(desktopPage, 'recurring-realized.png')
await desktop.close()

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mobilePage = await mobile.newPage()
await prepare(mobilePage)
await seedRecurring(mobilePage)
await mobilePage.getByTestId('month-next').click()
await screenshot(mobilePage, 'recurring-iphone-390.png')
await mobile.close()

await browser.close()

console.log(paths.join('\n'))

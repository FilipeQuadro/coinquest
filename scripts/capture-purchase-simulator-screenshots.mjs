import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = 'http://127.0.0.1:5173/?timeOfDay=night'
const outputDir = 'test-results/screenshots'
const paths = []

await mkdir(outputDir, { recursive: true })

const timeout = setTimeout(() => {
  console.error('Purchase simulator screenshot capture timed out.')
  process.exit(1)
}, 300_000)

function selectedMonthFromDate(date = new Date()) {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
  }
}

function dateInputForMonth(month, day = 15) {
  return [
    month.year,
    String(month.month + 1).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

async function prepare(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.getByTestId('purchase-simulator-panel').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.pwa-toast .icon-button').click({ timeout: 1500 }).catch(() => {})
}

async function seed(page) {
  const month = selectedMonthFromDate()
  const now = new Date(month.year, month.month, 2, 12, 0, 0).toISOString()
  const storesToClear = [
    'transactions',
    'recurringRules',
    'recurringOccurrenceOverrides',
    'creditCards',
    'cardPurchases',
    'cardInvoicePayments',
    'monthlyBudgets',
    'categoryBudgets',
    'goals',
    'goalContributions',
  ]
  const data = {
    transactions: [{
      id: 'income-actual',
      type: 'income',
      kind: 'standard',
      amount: 800,
      description: 'pagamento',
      category: 'Renda',
      paymentMethod: 'transfer',
      occurredAt: now,
      createdAt: now,
    }],
    recurringRules: [],
    recurringOccurrenceOverrides: [],
    creditCards: [{
      id: 'card-inter',
      name: 'Inter',
      creditLimit: 2000,
      closingDay: 25,
      dueDay: 2,
      active: true,
      createdAt: now,
      updatedAt: now,
    }],
    cardPurchases: [],
    cardInvoicePayments: [],
    monthlyBudgets: [],
    categoryBudgets: [],
    goals: [{
      id: 'goal-pc',
      name: 'Novo PC',
      targetAmount: 5000,
      status: 'active',
      priority: 'high',
      createdAt: now,
      updatedAt: now,
    }],
    goalContributions: [{
      id: 'goal-pc-allocation',
      goalId: 'goal-pc',
      amount: 2000,
      date: now,
      note: 'Reserva inicial',
      createdAt: now,
    }],
  }

  await page.evaluate(({ storesToClear, data }) => new Promise((resolve, reject) => {
    const request = indexedDB.open('coinquest-db')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(storesToClear, 'readwrite')
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => {
        database.close()
        resolve(null)
      }

      for (const storeName of storesToClear) {
        const store = transaction.objectStore(storeName)
        store.clear()
        for (const record of data[storeName] ?? []) store.put(record)
      }
    }
  }), { storesToClear, data })

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.getByTestId('purchase-simulator-panel').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.pwa-toast .icon-button').click({ timeout: 1500 }).catch(() => {})
  await page.getByTestId('purchase-simulator-panel').scrollIntoViewIfNeeded()
  await page.getByTestId('sim-name').fill('Notebook dev')
  await page.getByTestId('sim-amount').fill('3600')
  await page.getByTestId('sim-date').fill(dateInputForMonth(month, 20))
  await page.getByTestId('sim-goal').selectOption('goal-pc')
}

async function simulateInstallments(page, horizon = '6', installments = '6') {
  await page.getByTestId('sim-horizon').selectOption(horizon)
  await page.getByTestId('sim-installments').selectOption(installments)
  await page.getByTestId('sim-submit').click()
  await page.getByTestId('sim-results').waitFor({ state: 'visible', timeout: 8_000 })
}

async function simulateOutsideHorizon(page) {
  await page.getByTestId('sim-horizon').selectOption('3')
  await page.getByTestId('sim-method-cash').uncheck()
  await page.getByTestId('sim-method-card-one').uncheck()
  await page.getByTestId('sim-method-card-installments').check()
  await page.getByTestId('sim-installments').selectOption('12')
  await page.getByTestId('sim-submit').click()
  await page.getByTestId('sim-impact-outside').waitFor({ state: 'visible', timeout: 8_000 })
}

async function screenshot(locator, filename) {
  const path = `${outputDir}/${filename}`
  await locator.screenshot({ path })
  paths.push(path)
}

async function pageScreenshot(page, filename) {
  const path = `${outputDir}/${filename}`
  await page.screenshot({ path, fullPage: true })
  paths.push(path)
}

const browser = await chromium.launch({ args: ['--disable-webgl'] })

const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const desktopPage = await desktop.newPage()
await prepare(desktopPage)
await seed(desktopPage)
await simulateInstallments(desktopPage)
await screenshot(desktopPage.getByTestId('purchase-simulator-panel'), 'purchase-simulator-desktop.png')
await screenshot(desktopPage.getByTestId('sim-detail'), 'purchase-simulator-comparison.png')
await desktop.close()

const outside = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const outsidePage = await outside.newPage()
await prepare(outsidePage)
await seed(outsidePage)
await simulateOutsideHorizon(outsidePage)
await screenshot(outsidePage.getByTestId('sim-detail'), 'purchase-simulator-outside-horizon.png')
await outside.close()

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mobilePage = await mobile.newPage()
await prepare(mobilePage)
await seed(mobilePage)
await simulateInstallments(mobilePage, '3', '12')
await mobilePage.getByTestId('purchase-simulator-panel').scrollIntoViewIfNeeded()
await pageScreenshot(mobilePage, 'purchase-simulator-iphone-390.png')
await mobile.close()

await browser.close()
clearTimeout(timeout)

console.log(paths.join('\n'))

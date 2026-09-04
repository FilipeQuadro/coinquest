import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = 'http://127.0.0.1:5173/?timeOfDay=night'
const outputDir = 'test-results/screenshots'
const paths = []

await mkdir(outputDir, { recursive: true })

const timeout = setTimeout(() => {
  console.error('Projection screenshot capture timed out.')
  process.exit(1)
}, 180_000)

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

function isoForMonth(month, day = 15) {
  return new Date(month.year, month.month, day, 12, 0, 0).toISOString()
}

async function prepare(page) {
  console.log('prepare: goto')
  await page.goto(baseUrl)
  console.log('prepare: canvas')
  await page.locator('.game-canvas canvas').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.pwa-toast .icon-button').click({ timeout: 1500 }).catch(() => {})
  console.log('prepare: ready')
}

async function quickEntry(page, phrase) {
  console.log(`quick: ${phrase}`)
  await page.getByTestId('quick-entry-input').fill(phrase)
  await page.getByTestId('quick-entry-analyze').click()
  await page.getByTestId('quick-entry-confirm').click()
  console.log(`quick done: ${phrase}`)
}

async function recurringRule(page, input) {
  console.log(`recurring: ${input.description}`)
  await page.getByTestId('recurring-toggle-form').click()
  await page.getByTestId('recurring-type').selectOption(input.type)
  await page.getByTestId('recurring-amount').fill(input.amount)
  await page.getByTestId('recurring-description').fill(input.description)
  await page.getByTestId('recurring-category').selectOption(input.category)
  await page.getByTestId('recurring-payment').selectOption(input.paymentMethod)
  await page.getByTestId('recurring-day').fill(input.day)
  await page.getByTestId('recurring-save').click()
  console.log(`recurring done: ${input.description}`)
}

async function createCard(page) {
  const month = selectedMonthFromDate()
  console.log('card: start')

  await page.getByTestId('toggle-card-form').scrollIntoViewIfNeeded()
  await page.getByTestId('toggle-card-form').click()
  console.log('card: form open')
  await page.getByTestId('card-name').fill('Inter')
  await page.getByTestId('card-limit').fill('4000')
  await page.getByTestId('card-closing-day').fill('25')
  await page.getByTestId('card-due-day').fill('2')
  await page.getByTestId('save-card').click()
  console.log('card: saved')
  await page.getByTestId('credit-card-chip').filter({ hasText: 'Inter' }).waitFor({ state: 'visible', timeout: 8_000 })

  const purchaseButton = page.getByTestId('toggle-purchase-form')
  await purchaseButton.waitFor({ state: 'visible', timeout: 8_000 })
  console.log('card: purchase button ready')
  await purchaseButton.click({ timeout: 8_000 })
  console.log('card: purchase form open')
  await page.getByTestId('purchase-amount').fill('1200')
  await page.getByTestId('purchase-description').fill('Notebook')
  await page.getByTestId('purchase-category').selectOption('Compras')
  await page.getByTestId('purchase-date').fill(dateInputForMonth(month, 20))
  await page.getByTestId('purchase-installments').fill('4')
  await page.getByTestId('purchase-preview').waitFor({ state: 'visible', timeout: 8_000 })
  console.log('card: purchase preview')
  await page.getByTestId('save-purchase').click()
  console.log('card: done')
}

async function seedProjection(page) {
  console.log('seedProjection: start')
  await quickEntry(page, 'recebi 2000 de pagamento')
  await recurringRule(page, {
    type: 'income',
    amount: '1500',
    description: 'salario',
    category: 'Renda',
    paymentMethod: 'transfer',
    day: '5',
  })
  await recurringRule(page, {
    type: 'expense',
    amount: '120',
    description: 'internet',
    category: 'Casa',
    paymentMethod: 'pix',
    day: '10',
  })
  await recurringRule(page, {
    type: 'expense',
    amount: '200',
    description: 'curso',
    category: 'Estudos',
    paymentMethod: 'pix',
    day: '12',
  })
  await createCard(page)
  await page.getByTestId('projection-panel').waitFor({ state: 'visible', timeout: 8_000 })
  await page.getByTestId('projection-horizon').selectOption('6')
  console.log('seedProjection: done')
}

async function seedProjectionData(page, options = {}) {
  const currentMonth = selectedMonthFromDate()
  const now = isoForMonth(currentMonth, 2)
  const storesToClear = [
    'transactions',
    'monthlyBudgets',
    'categoryBudgets',
    'recurringRules',
    'recurringOccurrenceOverrides',
    'creditCards',
    'cardPurchases',
    'cardInvoicePayments',
  ]
  const data = options.negative
    ? {
        transactions: [],
        recurringRules: [
          {
            id: 'heavy-infra',
            type: 'expense',
            description: 'infra pesada',
            amount: 900,
            category: 'Casa',
            paymentMethod: 'pix',
            cadence: 'monthly',
            dayOfMonth: 10,
            startYear: currentMonth.year,
            startMonth: currentMonth.month,
            active: true,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }
    : {
        transactions: [
          {
            id: 'actual-income',
            type: 'income',
            kind: 'standard',
            amount: 2000,
            description: 'pagamento',
            category: 'Renda',
            paymentMethod: 'transfer',
            occurredAt: now,
            createdAt: now,
          },
        ],
        recurringRules: [
          {
            id: 'salary',
            type: 'income',
            description: 'salario',
            amount: 1500,
            category: 'Renda',
            paymentMethod: 'transfer',
            cadence: 'monthly',
            dayOfMonth: 5,
            startYear: currentMonth.year,
            startMonth: currentMonth.month,
            active: true,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'internet',
            type: 'expense',
            description: 'internet',
            amount: 120,
            category: 'Casa',
            paymentMethod: 'pix',
            cadence: 'monthly',
            dayOfMonth: 10,
            startYear: currentMonth.year,
            startMonth: currentMonth.month,
            active: true,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'course',
            type: 'expense',
            description: 'curso',
            amount: 200,
            category: 'Estudos',
            paymentMethod: 'pix',
            cadence: 'monthly',
            dayOfMonth: 12,
            startYear: currentMonth.year,
            startMonth: currentMonth.month,
            active: true,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }

  data.creditCards = [
    {
      id: 'card-inter',
      name: 'Inter',
      creditLimit: 4000,
      closingDay: 25,
      dueDay: 2,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  ]
  data.cardPurchases = [
    {
      id: 'purchase-notebook',
      cardId: 'card-inter',
      description: 'Notebook',
      category: 'Compras',
      totalAmount: 1200,
      purchaseDate: isoForMonth(currentMonth, 20),
      installmentCount: 4,
      createdAt: now,
      updatedAt: now,
    },
  ]
  data.cardInvoicePayments = []
  data.monthlyBudgets = []
  data.categoryBudgets = []
  data.recurringOccurrenceOverrides = []

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
        const records = data[storeName] ?? []
        for (const record of records) store.put(record)
      }
    }
  }), { storesToClear, data })

  await page.reload()
  await page.locator('.game-canvas canvas').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.pwa-toast .icon-button').click({ timeout: 1500 }).catch(() => {})
  await page.getByTestId('projection-panel').waitFor({ state: 'visible', timeout: 8_000 })
}

async function seedNegativeProjection(page) {
  await recurringRule(page, {
    type: 'expense',
    amount: '900',
    description: 'infra pesada',
    category: 'Casa',
    paymentMethod: 'pix',
    day: '10',
  })
  await createCard(page)
  await page.getByTestId('projection-panel').waitFor({ state: 'visible', timeout: 8_000 })
  await page.getByTestId('projection-horizon').selectOption('3')
}

async function screenshot(page, filename, options = {}) {
  const path = `${outputDir}/${filename}`
  await page.getByTestId('projection-panel').screenshot({ path, ...options })
  paths.push(path)
}

const browser = await chromium.launch()
console.log('browser launched')

const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const desktopPage = await desktop.newPage()
console.log('desktop start')
await prepare(desktopPage)
await seedProjectionData(desktopPage)
await desktopPage.getByTestId('projection-panel').scrollIntoViewIfNeeded()
await screenshot(desktopPage, 'projection-final-desktop.png')
await desktopPage.getByTestId('projection-horizon').selectOption('12')
await desktopPage.getByTestId('projection-panel').scrollIntoViewIfNeeded()
await screenshot(desktopPage, 'projection-final-12-months.png')
await desktop.close()
console.log('desktop done')

const negative = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const negativePage = await negative.newPage()
console.log('negative start')
await prepare(negativePage)
await seedProjectionData(negativePage, { negative: true })
await negativePage.getByTestId('projection-panel').scrollIntoViewIfNeeded()
await screenshot(negativePage, 'projection-final-negative-month.png')
await negative.close()
console.log('negative done')

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mobilePage = await mobile.newPage()
console.log('mobile start')
await prepare(mobilePage)
await seedProjectionData(mobilePage)
await mobilePage.getByTestId('projection-panel').scrollIntoViewIfNeeded()
await screenshot(mobilePage, 'projection-final-iphone-390.png')
await mobile.close()
console.log('mobile done')

await browser.close()
clearTimeout(timeout)

console.log(paths.join('\n'))

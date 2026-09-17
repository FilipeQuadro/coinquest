import { expect, test, type Page } from '@playwright/test'

async function quickEntry(page: Page, phrase: string) {
  await page.getByTestId('quick-entry-input').fill(phrase)
  await page.getByTestId('quick-entry-analyze').click()
  await page.getByTestId('quick-entry-confirm').click()
}

async function manualEntry(page: Page, input: {
  type?: 'income' | 'expense'
  amount: string
  description: string
  category?: string
  paymentMethod?: string
  date: string
}) {
  await page.getByTestId('manual-type-select').selectOption(input.type ?? 'expense')
  await page.getByTestId('manual-amount-input').fill(input.amount)
  await page.getByTestId('manual-description-input').fill(input.description)
  await page.getByTestId('manual-category-select').selectOption(input.category ?? 'Outros')
  await page.getByTestId('manual-payment-select').selectOption(input.paymentMethod ?? 'pix')
  await page.getByTestId('manual-date-input').fill(input.date)
  await page.getByTestId('manual-submit').click()
}

async function deleteFirstTransaction(page: Page) {
  await page.getByTestId('delete-transaction').first().click()
  await page.getByTestId('confirm-delete-transaction').first().click()
}

async function recurringRule(page: Page, input: {
  type?: 'income' | 'expense'
  amount: string
  description: string
  category: string
  paymentMethod?: string
  day: string
}) {
  await page.getByTestId('recurring-toggle-form').click()
  await page.getByTestId('recurring-type').selectOption(input.type ?? 'expense')
  await page.getByTestId('recurring-amount').fill(input.amount)
  await page.getByTestId('recurring-description').fill(input.description)
  await page.getByTestId('recurring-category').selectOption(input.category)
  await page.getByTestId('recurring-payment').selectOption(input.paymentMethod ?? 'pix')
  await page.getByTestId('recurring-day').fill(input.day)
  await page.getByTestId('recurring-save').click()
}

async function creditCard(page: Page, input: {
  name: string
  limit?: string
  closingDay: string
  dueDay: string
}) {
  await page.getByTestId('toggle-card-form').click()
  await page.getByTestId('card-name').fill(input.name)
  if (input.limit) await page.getByTestId('card-limit').fill(input.limit)
  await page.getByTestId('card-closing-day').fill(input.closingDay)
  await page.getByTestId('card-due-day').fill(input.dueDay)
  await page.getByTestId('save-card').click()
}

async function cardPurchase(page: Page, input: {
  amount: string
  description: string
  category?: string
  date: string
  installments: string
}) {
  await page.getByTestId('toggle-purchase-form').click()
  await page.getByTestId('purchase-amount').fill(input.amount)
  await page.getByTestId('purchase-description').fill(input.description)
  await page.getByTestId('purchase-category').selectOption(input.category ?? 'Compras')
  await page.getByTestId('purchase-date').fill(input.date)
  await page.getByTestId('purchase-installments').fill(input.installments)
  await expect(page.getByTestId('purchase-preview')).toBeVisible()
  await page.getByTestId('save-purchase').click()
}


async function reloadApp(page: Page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.game-canvas canvas')).toBeVisible()
}

function captureErrors(page: Page) {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  return { pageErrors, consoleErrors }
}

function selectedMonthFromDate(date = new Date()) {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
  }
}

function previousMonth(month: { year: number; month: number }) {
  return month.month === 0 ? { year: month.year - 1, month: 11 } : { year: month.year, month: month.month - 1 }
}

function nextMonth(month: { year: number; month: number }) {
  return month.month === 11 ? { year: month.year + 1, month: 0 } : { year: month.year, month: month.month + 1 }
}

function monthName(month: { year: number; month: number }) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(month.year, month.month, 1, 12))
}

function dateInputForMonth(month: { year: number; month: number }, day = 15) {
  return [
    month.year,
    String(month.month + 1).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

test('records, persists and deletes financial entries', async ({ page }) => {
  const { pageErrors, consoleErrors } = captureErrors(page)

  await page.goto('/')
  await expect(page.locator('.game-canvas canvas')).toBeVisible()

  await quickEntry(page, 'recebi 700 de pagamento')
  await expect(page.getByTestId('summary-income')).toContainText('R$ 700,00')
  await expect(page.getByTestId('summary-balance')).toContainText('R$ 700,00')
  await expect(page.getByTestId('financial-health-card')).toContainText('Saudavel')
  await expect(page.getByTestId('history-item').filter({ hasText: 'pagamento' })).toBeVisible()
  await expect(page.locator('.game-canvas canvas')).toHaveAttribute('data-finance-reaction', 'income')
  await expect(page.locator('.game-canvas canvas')).toHaveAttribute('data-financial-health', 'healthy')

  await quickEntry(page, 'gastei 39,90 no mercado no pix')
  await expect(page.getByTestId('summary-expenses')).toContainText('R$ 39,90')
  await expect(page.getByTestId('summary-balance')).toContainText('R$ 660,10')
  await expect(page.getByTestId('summary-count')).toContainText('2')
  await expect(page.getByTestId('financial-health-card')).toContainText('Excelente')
  await expect(page.getByTestId('history-item').filter({ hasText: 'mercado' })).toBeVisible()
  await expect(page.locator('.game-canvas canvas')).toHaveAttribute('data-finance-reaction', 'expense')
  await expect(page.locator('.game-canvas canvas')).toHaveAttribute('data-finance-reaction-count', '2')
  await expect(page.locator('.game-canvas canvas')).toHaveAttribute('data-financial-health', 'excellent')

  await quickEntry(page, 'gastei 660 com transporte')
  await expect(page.getByTestId('summary-expenses')).toContainText('R$ 699,90')
  await expect(page.getByTestId('summary-balance')).toContainText('R$ 0,10')
  await expect(page.getByTestId('financial-health-card')).toContainText('Apertado')
  await expect(page.locator('.game-canvas canvas')).toHaveAttribute('data-financial-health', 'tight')

  await reloadApp(page)
  await expect(page.getByTestId('summary-balance')).toContainText('R$ 0,10')
  await expect(page.getByTestId('history-item')).toHaveCount(3)

  await deleteFirstTransaction(page)
  await expect(page.getByTestId('history-item')).toHaveCount(2)

  await deleteFirstTransaction(page)
  await expect(page.getByTestId('history-item')).toHaveCount(1)

  await deleteFirstTransaction(page)
  await expect(page.getByTestId('summary-count')).toContainText('0')
  await expect(page.getByTestId('history-item')).toHaveCount(0)
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('configures and recalculates a monthly budget', async ({ page }) => {
  const { pageErrors, consoleErrors } = captureErrors(page)

  await page.goto('/')
  await expect(page.locator('.game-canvas canvas')).toBeVisible()

  await page.getByTestId('budget-total-input').fill('1000')
  await page.getByTestId('budget-save').click()
  await expect(page.getByTestId('budget-percentage')).toContainText('0%')
  await expect(page.getByTestId('budget-remaining')).toContainText('R$ 1.000,00')

  await quickEntry(page, 'gastei 250 no mercado no pix')
  await expect(page.getByTestId('budget-spent')).toContainText('R$ 250,00 / R$ 1.000,00')
  await expect(page.getByTestId('budget-percentage')).toContainText('25%')
  await expect(page.locator('.game-canvas canvas')).toHaveAttribute('data-financial-health', 'critical')

  await page.getByTestId('budget-category-select').selectOption('Alimentacao')
  await page.getByTestId('budget-category-input').fill('300')
  await page.getByTestId('budget-category-save').click()
  await expect(page.getByTestId('category-budget-item').filter({ hasText: 'Alimentacao' })).toContainText('R$ 250,00 / R$ 300,00')

  await quickEntry(page, 'gastei 300 com transporte')
  await expect(page.getByTestId('budget-spent')).toContainText('R$ 550,00 / R$ 1.000,00')
  await expect(page.getByTestId('budget-percentage')).toContainText('55%')

  await reloadApp(page)
  await expect(page.getByTestId('budget-spent')).toContainText('R$ 550,00 / R$ 1.000,00')
  await expect(page.getByTestId('history-item')).toHaveCount(2)

  await deleteFirstTransaction(page)
  await expect(page.getByTestId('budget-spent')).toContainText('R$ 250,00 / R$ 1.000,00')
  await expect(page.getByTestId('budget-percentage')).toContainText('25%')

  await page.getByTestId('budget-total-input').fill('800')
  await page.getByTestId('budget-save').click()
  await expect(page.getByTestId('budget-spent')).toContainText('R$ 250,00 / R$ 800,00')

  await page.getByTestId('budget-remove').click()
  await expect(page.getByTestId('budget-percentage')).toContainText('Sem orcamento')

  await deleteFirstTransaction(page)
  await expect(page.getByTestId('history-item')).toHaveCount(0)
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('navigates months and edits transactions without duplicating records', async ({ page }) => {
  const { pageErrors, consoleErrors } = captureErrors(page)
  const currentMonth = selectedMonthFromDate()
  const sourceMonth = previousMonth(currentMonth)
  const targetMonth = nextMonth(sourceMonth)

  await page.goto('/')
  await expect(page.locator('.game-canvas canvas')).toBeVisible()
  await expect(page.getByTestId('selected-month-label')).toContainText(monthName(currentMonth))
  await expect(page.getByTestId('selected-month-label')).toContainText(String(currentMonth.year))

  await page.getByTestId('month-prev').click()
  await expect(page.getByTestId('selected-month-label')).toContainText(monthName(sourceMonth))
  await expect(page.getByTestId('selected-month-label')).toContainText(String(sourceMonth.year))

  await page.getByTestId('budget-total-input').fill('1000')
  await page.getByTestId('budget-save').click()
  await page.getByTestId('budget-category-select').selectOption('Alimentacao')
  await page.getByTestId('budget-category-input').fill('300')
  await page.getByTestId('budget-category-save').click()

  await manualEntry(page, {
    amount: '250',
    description: 'mercado',
    category: 'Alimentacao',
    paymentMethod: 'pix',
    date: dateInputForMonth(sourceMonth),
  })
  await expect(page.getByTestId('summary-expenses')).toContainText('R$ 250,00')
  await expect(page.getByTestId('budget-spent')).toContainText('R$ 250,00 / R$ 1.000,00')
  await expect(page.getByTestId('category-budget-item').filter({ hasText: 'Alimentacao' })).toContainText('R$ 250,00 / R$ 300,00')

  await page.getByTestId('edit-transaction').first().click()
  await page.getByTestId('edit-transaction-amount').fill('180')
  await page.getByTestId('edit-transaction-description').fill('mercado semanal')
  await page.getByTestId('edit-transaction-save').click()
  await expect(page.getByTestId('summary-expenses')).toContainText('R$ 180,00')
  await expect(page.getByTestId('budget-spent')).toContainText('R$ 180,00 / R$ 1.000,00')
  await expect(page.getByTestId('history-item').filter({ hasText: 'mercado semanal' })).toBeVisible()

  await page.getByTestId('edit-transaction').first().click()
  await page.getByTestId('edit-transaction-category').selectOption('Transporte')
  await page.getByTestId('edit-transaction-save').click()
  await expect(page.getByTestId('category-budget-item').filter({ hasText: 'Alimentacao' })).toContainText('R$ 0,00 / R$ 300,00')

  await page.getByTestId('edit-transaction').first().click()
  await page.getByTestId('edit-transaction-date').fill(dateInputForMonth(targetMonth, 1))
  await page.getByTestId('edit-transaction-save').click()
  await expect(page.getByTestId('summary-count')).toContainText('0')
  await expect(page.getByTestId('history-item')).toHaveCount(0)
  await expect(page.getByTestId('budget-spent')).toContainText('R$ 0,00 / R$ 1.000,00')

  await page.getByTestId('month-next').click()
  await expect(page.getByTestId('selected-month-label')).toContainText(monthName(targetMonth))
  await expect(page.getByTestId('history-item').filter({ hasText: 'mercado semanal' })).toBeVisible()
  await expect(page.getByTestId('summary-expenses')).toContainText('R$ 180,00')

  await reloadApp(page)
  await expect(page.getByTestId('selected-month-label')).toContainText(monthName(targetMonth))
  await expect(page.getByTestId('history-item').filter({ hasText: 'mercado semanal' })).toBeVisible()

  await page.getByTestId('month-prev').click()
  await expect(page.getByTestId('selected-month-label')).toContainText(monthName(sourceMonth))
  await expect(page.getByTestId('history-item')).toHaveCount(0)
  await expect(page.getByTestId('budget-spent')).toContainText('R$ 0,00 / R$ 1.000,00')
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('projects recurring commitments and confirms one as actual', async ({ page }) => {
  const { pageErrors, consoleErrors } = captureErrors(page)
  const currentMonth = selectedMonthFromDate()
  const futureMonth = nextMonth(currentMonth)

  await page.goto('/')
  await expect(page.locator('.game-canvas canvas')).toBeVisible()

  await recurringRule(page, {
    type: 'income',
    amount: '1500',
    description: 'salario',
    category: 'Renda',
    paymentMethod: 'transfer',
    day: '5',
  })
  await recurringRule(page, {
    amount: '120',
    description: 'internet',
    category: 'Casa',
    paymentMethod: 'pix',
    day: '10',
  })

  await page.getByTestId('month-next').click()
  await expect(page.getByTestId('selected-month-label')).toContainText(monthName(futureMonth))
  await expect(page.getByTestId('recurring-occurrence').filter({ hasText: 'salario' })).toContainText('Previsto')
  await expect(page.getByTestId('recurring-occurrence').filter({ hasText: 'internet' })).toContainText('Previsto')
  await expect(page.getByTestId('projected-net')).toContainText('R$ 1.380,00')
  await expect(page.locator('.game-canvas canvas')).toHaveAttribute('data-planned-commitments', '2')

  const internet = page.getByTestId('recurring-occurrence').filter({ hasText: 'internet' })
  await internet.getByTestId('confirm-occurrence').click()
  await expect(page.getByTestId('confirm-occurrence-box')).toContainText('internet')
  await page.getByTestId('confirm-occurrence-actual').click()

  await expect(page.getByTestId('history-item').filter({ hasText: 'internet' })).toBeVisible()
  await expect(page.getByTestId('summary-expenses')).toContainText('R$ 120,00')
  await expect(page.getByTestId('recurring-occurrence').filter({ hasText: 'internet' })).toContainText('Realizado')
  await expect(page.locator('.game-canvas canvas')).toHaveAttribute('data-finance-reaction', 'expense')
  await expect(page.locator('.game-canvas canvas')).toHaveAttribute('data-planned-commitments', '1')

  await reloadApp(page)
  await expect(page.getByTestId('selected-month-label')).toContainText(monthName(futureMonth))
  await expect(page.getByTestId('history-item').filter({ hasText: 'internet' })).toBeVisible()
  await expect(page.getByTestId('recurring-occurrence').filter({ hasText: 'internet' })).toContainText('Realizado')
  await expect(page.getByTestId('recurring-occurrence').filter({ hasText: 'salario' })).toContainText('Previsto')
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('creates card purchases, invoices and a persisted invoice payment', async ({ page }) => {
  const { pageErrors, consoleErrors } = captureErrors(page)
  const currentMonth = selectedMonthFromDate()
  const next = nextMonth(currentMonth)

  await page.goto('/')
  await expect(page.locator('.game-canvas canvas')).toBeVisible()

  await creditCard(page, {
    name: 'Nubank',
    limit: '3000',
    closingDay: '25',
    dueDay: '2',
  })
  await expect(page.getByTestId('credit-card-chip').filter({ hasText: 'Nubank' })).toBeVisible()

  await cardPurchase(page, {
    amount: '1200',
    description: 'Notebook',
    category: 'Compras',
    date: dateInputForMonth(currentMonth, 20),
    installments: '4',
  })

  await expect(page.getByTestId('card-invoice')).toContainText('R$ 300,00')
  await expect(page.getByTestId('invoice-installment').filter({ hasText: 'Notebook 1/4' })).toBeVisible()
  await expect(page.getByTestId('card-purchase-item').filter({ hasText: 'Notebook' })).toContainText('4x')
  await expect(page.getByTestId('projected-net')).toContainText('-R$ 300,00')

  await page.getByTestId('pay-invoice').click()
  await expect(page.getByTestId('invoice-payment-box')).toContainText('Data do pagamento')
  await page.getByTestId('invoice-payment-date').fill(dateInputForMonth(next, 2))
  await page.getByTestId('confirm-pay-invoice').click()
  await expect(page.getByTestId('card-invoice')).toContainText('Paga')
  await expect(page.getByTestId('projected-net')).toContainText('R$ 0,00')

  await page.getByTestId('month-next').click()
  await expect(page.getByTestId('selected-month-label')).toContainText(monthName(next))
  await expect(page.getByTestId('card-invoice')).toContainText('R$ 300,00')
  await expect(page.getByTestId('invoice-installment').filter({ hasText: 'Notebook 2/4' })).toBeVisible()
  await expect(page.getByTestId('history-item').filter({ hasText: 'Fatura Nubank' })).toBeVisible()
  await page.getByTestId('edit-transaction').first().click()
  await expect(page.getByTestId('linked-invoice-transaction-warning')).toContainText('area do cartao')

  await reloadApp(page)
  await expect(page.getByTestId('selected-month-label')).toContainText(monthName(next))
  await expect(page.getByTestId('invoice-installment').filter({ hasText: 'Notebook 2/4' })).toBeVisible()
  await expect(page.getByTestId('history-item').filter({ hasText: 'Fatura Nubank' })).toBeVisible()

  await page.getByTestId('month-prev').click()
  await expect(page.getByTestId('card-invoice')).toContainText('Paga')
  await page.getByTestId('correct-invoice-payment').click()
  await expect(page.getByTestId('invoice-correction-box')).toContainText('Data do pagamento')
  await page.getByTestId('invoice-payment-date').fill(dateInputForMonth(currentMonth, 30))
  await page.getByTestId('save-invoice-payment-correction').click()
  await expect(page.getByTestId('card-invoice')).toContainText('Paga em')
  await expect(page.getByTestId('history-item').filter({ hasText: 'Fatura Nubank' })).toBeVisible()

  await page.getByTestId('month-next').click()
  await expect(page.getByTestId('history-item').filter({ hasText: 'Fatura Nubank' })).toHaveCount(0)
  await page.getByTestId('month-prev').click()

  await page.getByTestId('toggle-card-active').click()
  await expect(page.getByTestId('credit-card-chip').filter({ hasText: 'Inativo' })).toBeVisible()
  await expect(page.getByTestId('toggle-purchase-form')).toBeDisabled()
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('shows a multi-month projection timeline from the selected month', async ({ page }) => {
  const { pageErrors, consoleErrors } = captureErrors(page)
  const currentMonth = selectedMonthFromDate()
  const next = nextMonth(currentMonth)

  await page.goto('/')
  await expect(page.locator('.game-canvas canvas')).toBeVisible()

  await recurringRule(page, {
    type: 'income',
    amount: '1500',
    description: 'salario',
    category: 'Renda',
    paymentMethod: 'transfer',
    day: '5',
  })
  await recurringRule(page, {
    amount: '120',
    description: 'internet',
    category: 'Casa',
    paymentMethod: 'pix',
    day: '10',
  })
  await recurringRule(page, {
    amount: '200',
    description: 'curso',
    category: 'Estudos',
    paymentMethod: 'pix',
    day: '12',
  })
  await creditCard(page, {
    name: 'Inter',
    limit: '4000',
    closingDay: '25',
    dueDay: '2',
  })
  await cardPurchase(page, {
    amount: '1200',
    description: 'Notebook',
    category: 'Compras',
    date: dateInputForMonth(currentMonth, 20),
    installments: '4',
  })

  await expect(page.getByTestId('projection-panel')).toBeVisible()
  await page.getByTestId('projection-horizon').selectOption('3')
  await expect(page.getByTestId('projection-month-card')).toHaveCount(3)
  await expect(page.getByTestId('projection-period')).toContainText(monthName(currentMonth).slice(0, 3).toUpperCase())

  await expect(page.getByTestId('projection-month-card').first()).toContainText('R$ 880,00')
  await page.getByTestId('projection-month-card').nth(1).click()
  await expect(page.getByTestId('projection-breakdown')).toContainText('Receitas recorrentes')
  await expect(page.getByTestId('projection-breakdown')).toContainText('Compromissos do cartão')
  await expect(page.getByTestId('projection-selected-net')).toContainText('R$ 880,00')

  await page.getByTestId('projection-horizon').selectOption('12')
  await expect(page.getByTestId('projection-month-card')).toHaveCount(12)
  await expect(page.getByTestId('projection-period')).toContainText(monthName(currentMonth).slice(0, 3).toUpperCase())

  await page.getByTestId('projection-month-card').first().click()
  const salary = page.getByTestId('recurring-occurrence').filter({ hasText: 'salario' })
  await salary.getByTestId('confirm-occurrence').click()
  await page.getByTestId('confirm-occurrence-actual').click()
  await expect(page.getByTestId('projection-selected-net')).toContainText('R$ 880,00')
  await expect(page.getByTestId('projection-breakdown')).toContainText('R$ 1.500,00')

  const internet = page.getByTestId('recurring-occurrence').filter({ hasText: 'internet' })
  await internet.getByTestId('skip-occurrence').click()
  await expect(page.getByTestId('projection-selected-net')).toContainText('R$ 1.000,00')

  await page.getByTestId('budget-total-input').fill('100')
  await page.getByTestId('budget-save').click()
  await expect(page.getByTestId('projection-breakdown')).toContainText('Orçamento de referência')
  await expect(page.getByTestId('projection-selected-net')).toContainText('R$ 1.000,00')

  await page.getByTestId('pay-invoice').click()
  await page.getByTestId('invoice-payment-date').fill(dateInputForMonth(currentMonth, 30))
  await page.getByTestId('confirm-pay-invoice').click()
  await expect(page.getByTestId('projection-selected-net')).toContainText('R$ 1.000,00')

  await page.getByTestId('month-next').click()
  await expect(page.getByTestId('selected-month-label')).toContainText(monthName(next))
  await expect(page.getByTestId('projection-period')).toContainText(monthName(next).slice(0, 3).toUpperCase())
  await expect(page.getByTestId('projection-month-card')).toHaveCount(12)

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('creates mission allocations without creating transactions', async ({ page }) => {
  const { pageErrors, consoleErrors } = captureErrors(page)

  await page.goto('/')
  await expect(page.locator('.game-canvas canvas')).toBeVisible()
  await expect(page.getByTestId('summary-count')).toContainText('0')

  await page.getByTestId('toggle-goal-form').click()
  await page.getByTestId('goal-name-input').fill('Novo PC')
  await page.getByTestId('goal-description-input').fill('Setup principal')
  await page.getByTestId('goal-target-input').fill('5000')
  await page.getByTestId('goal-monthly-plan-input').fill('500')
  await page.getByTestId('goal-priority-select').selectOption('high')
  await page.getByTestId('save-goal').click()

  const mission = page.getByTestId('goal-card').filter({ hasText: 'Novo PC' })
  await expect(mission).toBeVisible()
  await expect(mission.getByTestId('goal-progress-text')).toContainText('0%')
  await expect(mission.getByTestId('goal-allocated')).toContainText('R$ 0,00')

  await mission.getByTestId('reserve-goal').click()
  await expect(page.getByTestId('goal-allocation-notice')).toContainText('n\u00e3o cria uma despesa')
  await page.getByTestId('goal-contribution-amount').fill('1000')
  await page.getByTestId('goal-contribution-note').fill('Reserva inicial')
  await page.getByTestId('save-goal-contribution').click()
  await expect(mission.getByTestId('goal-progress-text')).toContainText('20%')
  await expect(page.locator('.game-canvas canvas')).not.toHaveAttribute('data-goal-reaction-count', /.+/)

  await mission.getByTestId('reserve-goal').click()
  await page.getByTestId('goal-contribution-amount').fill('500')
  await page.getByTestId('save-goal-contribution').click()
  await expect(mission.getByTestId('goal-allocated')).toContainText('R$ 1.500,00')
  await expect(mission.getByTestId('goal-progress-text')).toContainText('30%')

  await mission.getByTestId('withdraw-goal').click()
  await page.getByTestId('goal-contribution-amount').fill('200')
  await page.getByTestId('goal-contribution-note').fill('Ajuste de reserva')
  await page.getByTestId('save-goal-contribution').click()
  await expect(mission.getByTestId('goal-allocated')).toContainText('R$ 1.300,00')
  await expect(page.getByTestId('history-item')).toHaveCount(0)
  await expect(page.getByTestId('summary-count')).toContainText('0')

  await reloadApp(page)
  const persistedMission = page.getByTestId('goal-card').filter({ hasText: 'Novo PC' })
  await expect(persistedMission.getByTestId('goal-allocated')).toContainText('R$ 1.300,00')
  await expect(persistedMission.getByTestId('goal-progress-text')).toContainText('26%')
  await expect(page.getByTestId('history-item')).toHaveCount(0)

  await page.getByTestId('toggle-goal-form').click()
  await page.getByTestId('goal-name-input').fill('Mesa digital')
  await page.getByTestId('goal-target-input').fill('1000')
  await page.getByTestId('save-goal').click()

  const completedMission = page.getByTestId('goal-card').filter({ hasText: 'Mesa digital' })
  await completedMission.getByTestId('reserve-goal').click()
  await page.getByTestId('goal-contribution-amount').fill('1000')
  await page.getByTestId('save-goal-contribution').click()
  await expect(completedMission).toContainText('MISS\u00c3O CONCLU\u00cdDA')
  await expect(page.locator('.game-canvas canvas')).toHaveAttribute('data-goal-reaction-name', 'Mesa digital')
  await expect(page.locator('.game-canvas canvas')).toHaveAttribute('data-goal-reaction-count', '1')

  await completedMission.getByTestId('withdraw-goal').click()
  await page.getByTestId('goal-contribution-amount').fill('100')
  await page.getByTestId('save-goal-contribution').click()
  await expect(page.getByTestId('goal-card').filter({ hasText: 'Mesa digital' })).toContainText('Ativa')

  await reloadApp(page)
  await expect(page.locator('.game-canvas canvas')).toBeVisible()
  await expect(page.getByTestId('goal-card').filter({ hasText: 'Mesa digital' })).toContainText('Ativa')
  await expect(page.locator('.game-canvas canvas')).not.toHaveAttribute('data-goal-reaction-count', /.+/)

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('simulates purchase scenarios without persisting real financial records', async ({ page }) => {
  const { pageErrors, consoleErrors } = captureErrors(page)
  const currentMonth = selectedMonthFromDate()

  await page.goto('/')
  await expect(page.locator('.game-canvas canvas')).toBeVisible()

  await quickEntry(page, 'recebi 800 de pagamento')
  await creditCard(page, {
    name: 'Inter',
    limit: '2000',
    closingDay: '25',
    dueDay: '2',
  })

  await expect(page.getByTestId('summary-count')).toContainText('1')
  await expect(page.getByTestId('card-purchase-item')).toHaveCount(0)

  await page.getByTestId('sim-name').fill('Monitor')
  await page.getByTestId('sim-amount').fill('500')
  await page.getByTestId('sim-date').fill(dateInputForMonth(currentMonth, 10))
  await page.getByTestId('sim-horizon').selectOption('3')
  await page.getByTestId('sim-method-card-one').uncheck()
  await page.getByTestId('sim-method-card-installments').uncheck()
  await page.getByTestId('sim-submit').click()

  await expect(page.getByTestId('sim-baseline')).toContainText('SEM A COMPRA')
  await expect(page.getByTestId('sim-scenario-card')).toHaveCount(1)
  await expect(page.getByTestId('sim-scenario-card').first()).toContainText('À vista')
  await expect(page.getByTestId('sim-cumulative-delta')).toContainText('-R$ 500,00')
  await expect(page.getByTestId('sim-month-impact').first()).toContainText('Impacto: -R$ 500,00')

  await page.getByTestId('sim-amount').fill('1200')
  await page.getByTestId('sim-date').fill(dateInputForMonth(currentMonth, 20))
  await page.getByTestId('sim-method-cash').uncheck()
  await page.getByTestId('sim-method-card-installments').check()
  await page.getByTestId('sim-installments').selectOption('12')
  await page.getByTestId('sim-submit').click()

  await expect(page.getByTestId('sim-scenario-card')).toHaveCount(1)
  await expect(page.getByTestId('sim-scenario-card').first()).toContainText('12x no cartão')
  await expect(page.getByTestId('sim-installment-info')).toContainText('12x')
  await expect(page.getByTestId('sim-impact-within')).toContainText('R$ 300,00')
  await expect(page.getByTestId('sim-impact-outside')).toContainText('R$ 900,00')
  await expect(page.getByTestId('sim-detail')).toContainText('Parte desta compra continua após o período exibido.')
  await expect(page.getByTestId('sim-card-limit')).toContainText('Limite estimado depois')

  await expect(page.getByTestId('summary-count')).toContainText('1')
  await expect(page.getByTestId('card-purchase-item')).toHaveCount(0)
  await expect(page.getByTestId('goal-contribution-item')).toHaveCount(0)

  await reloadApp(page)
  await expect(page.getByTestId('summary-count')).toContainText('1')
  await expect(page.getByTestId('card-purchase-item')).toHaveCount(0)

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('registers a simulated cash purchase as a real transaction', async ({ page }) => {
  const { pageErrors, consoleErrors } = captureErrors(page)
  const currentMonth = selectedMonthFromDate()

  await page.goto('/')
  await expect(page.locator('.game-canvas canvas')).toBeVisible()
  await expect(page.getByTestId('summary-count')).toContainText('0')

  await page.getByTestId('sim-name').fill('Teclado')
  await page.getByTestId('sim-amount').fill('500')
  await page.getByTestId('sim-date').fill(dateInputForMonth(currentMonth, 10))
  await page.getByTestId('sim-horizon').selectOption('3')
  await page.getByTestId('sim-submit').click()

  await expect(page.getByTestId('sim-detail')).toContainText('À vista')
  await page.getByTestId('sim-register-open').click()
  await expect(page.getByTestId('sim-register-cash-summary')).toContainText('Esta acao criara uma despesa real')
  await page.getByTestId('sim-register-confirm').dblclick()

  await expect(page.getByTestId('sim-register-success')).toContainText('Compra registrada.')
  await expect(page.getByTestId('summary-count')).toContainText('1')
  await expect(page.getByTestId('history-item').filter({ hasText: 'Teclado' })).toBeVisible()
  await expect(page.getByTestId('card-purchase-item')).toHaveCount(0)

  await reloadApp(page)
  await expect(page.getByTestId('summary-count')).toContainText('1')
  await expect(page.getByTestId('history-item').filter({ hasText: 'Teclado' })).toBeVisible()

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('registers a simulated installment card purchase without immediate cash transaction', async ({ page }) => {
  const { pageErrors, consoleErrors } = captureErrors(page)
  const currentMonth = selectedMonthFromDate()

  await page.goto('/')
  await expect(page.locator('.game-canvas canvas')).toBeVisible()

  await creditCard(page, {
    name: 'Inter',
    limit: '2000',
    closingDay: '25',
    dueDay: '2',
  })
  await expect(page.getByTestId('summary-count')).toContainText('0')

  await page.getByTestId('sim-name').fill('Notebook')
  await page.getByTestId('sim-amount').fill('1200')
  await page.getByTestId('sim-date').fill(dateInputForMonth(currentMonth, 20))
  await page.getByTestId('sim-horizon').selectOption('6')
  await page.getByTestId('sim-method-cash').uncheck()
  await page.getByTestId('sim-method-card-one').uncheck()
  await page.getByTestId('sim-method-card-installments').check()
  await page.getByTestId('sim-installments').selectOption('6')
  await page.getByTestId('sim-submit').click()

  await expect(page.getByTestId('sim-detail')).toContainText('6x no cartão')
  await page.getByTestId('sim-register-open').click()
  await expect(page.getByTestId('sim-register-card-summary')).toContainText('O pagamento da fatura continuara separado')
  await page.getByTestId('sim-register-confirm').click()

  await expect(page.getByTestId('sim-register-success')).toContainText('Compra registrada.')
  await expect(page.getByTestId('summary-count')).toContainText('0')
  await expect(page.getByTestId('card-purchase-item').filter({ hasText: 'Notebook' })).toContainText('6x')
  await expect(page.getByTestId('invoice-installment').filter({ hasText: 'Notebook 1/6' })).toBeVisible()

  await reloadApp(page)
  await expect(page.getByTestId('summary-count')).toContainText('0')
  await expect(page.getByTestId('card-purchase-item').filter({ hasText: 'Notebook' })).toContainText('6x')

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('exports and restores a local backup', async ({ page }, testInfo) => {
  const { pageErrors, consoleErrors } = captureErrors(page)

  await page.goto('/')
  await expect(page.locator('.game-canvas canvas')).toBeVisible()

  await page.getByTestId('budget-total-input').fill('1000')
  await page.getByTestId('budget-save').click()
  await quickEntry(page, 'gastei 120 no mercado no pix')
  await expect(page.getByTestId('history-item').filter({ hasText: 'mercado' })).toBeVisible()
  await expect(page.getByTestId('budget-spent')).toContainText('R$ 120,00 / R$ 1.000,00')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('backup-export').click()
  const download = await downloadPromise
  const backupPath = testInfo.outputPath('coinquest-backup-e2e.json')
  await download.saveAs(backupPath)
  await expect(page.getByTestId('backup-success')).toContainText('Backup exportado.')

  await deleteFirstTransaction(page)
  await page.getByTestId('budget-remove').click()
  await expect(page.getByTestId('history-item')).toHaveCount(0)
  await expect(page.getByTestId('budget-percentage')).toContainText('Sem orcamento')

  await page.getByTestId('backup-file-input').setInputFiles(backupPath)
  await expect(page.getByTestId('backup-confirm')).toContainText('substituira os dados atuais')
  await expect(page.getByTestId('backup-preview')).toContainText('Integridade verificada.')
  await expect(page.getByTestId('backup-preview')).toContainText('Transacoes')
  await page.getByTestId('backup-import-confirm').click()

  await expect(page.getByTestId('backup-success')).toContainText('Backup restaurado com sucesso.')
  await expect(page.getByTestId('history-item').filter({ hasText: 'mercado' })).toBeVisible()
  await expect(page.getByTestId('budget-spent')).toContainText('R$ 120,00 / R$ 1.000,00')

  await page.getByTestId('backup-protected-toggle').click()
  await expect(page.getByTestId('backup-protected-export-box')).toContainText('O CoinQuest nao consegue recupera-la')
  await page.getByTestId('backup-export-password').fill('senha-forte-local')
  await page.getByTestId('backup-export-password-confirm').fill('senha-forte-local')
  const protectedDownloadPromise = page.waitForEvent('download')
  await page.getByTestId('backup-protected-export').click()
  const protectedDownload = await protectedDownloadPromise
  const protectedBackupPath = testInfo.outputPath('coinquest-backup-protected-e2e.json')
  await protectedDownload.saveAs(protectedBackupPath)
  await expect(page.getByTestId('backup-success')).toContainText('Backup protegido exportado.')

  await deleteFirstTransaction(page)
  await page.getByTestId('budget-remove').click()
  await expect(page.getByTestId('history-item')).toHaveCount(0)
  await expect(page.getByTestId('budget-percentage')).toContainText('Sem orcamento')

  await page.getByTestId('backup-file-input').setInputFiles(protectedBackupPath)
  await expect(page.getByTestId('backup-encrypted-import-box')).toContainText('protegido por senha')
  await page.getByTestId('backup-import-password').fill('senha-forte-local')
  await page.getByTestId('backup-unlock-encrypted').click()
  await expect(page.getByTestId('backup-preview')).toContainText('Integridade verificada.')
  await page.getByTestId('backup-import-confirm').click()

  await expect(page.getByTestId('backup-success')).toContainText('Backup restaurado com sucesso.')
  await expect(page.getByTestId('history-item').filter({ hasText: 'mercado' })).toBeVisible()
  await expect(page.getByTestId('budget-spent')).toContainText('R$ 120,00 / R$ 1.000,00')

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

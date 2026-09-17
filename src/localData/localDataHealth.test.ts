import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type {
  AppSetting,
  CardInvoicePayment,
  CardPurchase,
  CategoryBudget,
  CreditCard,
  Goal,
  GoalContribution,
  MonthlyBudget,
  RecurringOccurrenceOverride,
  RecurringRule,
  SyncConflict,
  Transaction,
} from '../db/types'
import { deriveLocalDataHealth, type LocalDataHealthInput } from './localDataHealth'

const now = '2026-09-17T12:00:00.000Z'

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    type: 'expense',
    kind: 'standard',
    amount: 120,
    description: 'Mercado',
    category: 'Alimentacao',
    paymentMethod: 'pix',
    occurredAt: now,
    createdAt: now,
    ...overrides,
  }
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    name: 'Novo PC',
    targetAmount: 5000,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function goalContribution(overrides: Partial<GoalContribution> = {}): GoalContribution {
  return {
    id: 'contribution-1',
    goalId: 'goal-1',
    amount: 1000,
    date: now,
    createdAt: now,
    ...overrides,
  }
}

function monthlyBudget(overrides: Partial<MonthlyBudget> = {}): MonthlyBudget {
  return {
    id: 'monthly-budget-1',
    year: 2026,
    month: 8,
    totalLimit: 1000,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function categoryBudget(overrides: Partial<CategoryBudget> = {}): CategoryBudget {
  return {
    id: 'category-budget-1',
    year: 2026,
    month: 8,
    category: 'Alimentacao',
    limit: 300,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function recurringRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-1',
    type: 'expense',
    description: 'Internet',
    amount: 120,
    category: 'Casa',
    paymentMethod: 'pix',
    cadence: 'monthly',
    dayOfMonth: 10,
    startYear: 2026,
    startMonth: 8,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function recurringOverride(overrides: Partial<RecurringOccurrenceOverride> = {}): RecurringOccurrenceOverride {
  return {
    id: 'override-1',
    ruleId: 'rule-1',
    year: 2026,
    month: 8,
    status: 'realized',
    linkedTransactionId: 'tx-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function creditCard(overrides: Partial<CreditCard> = {}): CreditCard {
  return {
    id: 'card-1',
    name: 'Inter',
    creditLimit: 2000,
    closingDay: 25,
    dueDay: 2,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function cardPurchase(overrides: Partial<CardPurchase> = {}): CardPurchase {
  return {
    id: 'purchase-1',
    cardId: 'card-1',
    description: 'Notebook',
    category: 'Compras',
    totalAmount: 1200,
    purchaseDate: now,
    installmentCount: 4,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function cardInvoicePayment(overrides: Partial<CardInvoicePayment> = {}): CardInvoicePayment {
  return {
    id: 'payment-1',
    cardId: 'card-1',
    invoiceYear: 2026,
    invoiceMonth: 8,
    linkedTransactionId: 'tx-1',
    paymentDate: now,
    paidAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function setting(overrides: Partial<AppSetting> = {}): AppSetting {
  return {
    key: 'categoryPreferences',
    value: '{}',
    ...overrides,
  }
}

function syncConflict(overrides: Partial<SyncConflict> = {}): SyncConflict {
  return {
    id: 'conflict-1',
    entityKey: 'transaction:tx-1',
    entityType: 'transaction',
    base: null,
    local: null,
    remote: null,
    detectedAt: now,
    status: 'pending',
    ...overrides,
  }
}

function emptyInput(overrides: Partial<LocalDataHealthInput> = {}): LocalDataHealthInput {
  return {
    transactions: [],
    goals: [],
    goalContributions: [],
    settings: [],
    monthlyBudgets: [],
    categoryBudgets: [],
    recurringRules: [],
    recurringOccurrenceOverrides: [],
    creditCards: [],
    cardPurchases: [],
    cardInvoicePayments: [],
    ...overrides,
  }
}

function validInput(overrides: Partial<LocalDataHealthInput> = {}): LocalDataHealthInput {
  return emptyInput({
    transactions: [transaction()],
    goals: [goal()],
    goalContributions: [goalContribution()],
    settings: [setting()],
    monthlyBudgets: [monthlyBudget()],
    categoryBudgets: [categoryBudget()],
    recurringRules: [recurringRule()],
    recurringOccurrenceOverrides: [recurringOverride()],
    creditCards: [creditCard()],
    cardPurchases: [cardPurchase()],
    cardInvoicePayments: [cardInvoicePayment()],
    ...overrides,
  })
}

describe('deriveLocalDataHealth', () => {
  it('retorna status empty para base vazia sem warning alarmista', () => {
    const report = deriveLocalDataHealth(emptyInput())

    expect(report.status).toBe('empty')
    expect(report.hasAnyFinancialData).toBe(false)
    expect(report.warnings).toEqual([])
    expect(report.summaryMessage).toBe('Nenhum dado financeiro local registrado ainda.')
    expect(report.summaryMessage).not.toMatch(/erro grave|dados corrompidos|perda de dados|falha critica|obrigatorio sincronizar|backup garantido/i)
  })

  it('retorna contagens corretas por tabela', () => {
    const report = deriveLocalDataHealth(validInput({
      transactions: [transaction({ id: 'tx-1' }), transaction({ id: 'tx-2' })],
      syncConflicts: [syncConflict()],
    }))

    expect(report.counts).toEqual({
      transactions: 2,
      goals: 1,
      goalContributions: 1,
      settings: 1,
      monthlyBudgets: 1,
      categoryBudgets: 1,
      recurringRules: 1,
      recurringOccurrenceOverrides: 1,
      creditCards: 1,
      cardPurchases: 1,
      cardInvoicePayments: 1,
      syncConflicts: 1,
    })
  })

  it('retorna status ok para dados validos', () => {
    const report = deriveLocalDataHealth(validInput())

    expect(report.status).toBe('ok')
    expect(report.hasAnyFinancialData).toBe(true)
    expect(report.warnings).toEqual([])
    expect(report.summaryMessage).toBe('Dados locais encontrados.')
  })

  it('gera warning attention para GoalContribution orfa', () => {
    const report = deriveLocalDataHealth(validInput({
      goalContributions: [goalContribution({ goalId: 'missing-goal' })],
    }))

    expect(report.status).toBe('attention')
    expect(report.warnings).toContainEqual(expect.objectContaining({
      id: 'orphan-reference:goal-contributions:goal',
      kind: 'orphan-reference',
      severity: 'attention',
      count: 1,
      table: 'goalContributions',
    }))
  })

  it('gera warning attention para RecurringOccurrenceOverride orfao', () => {
    const report = deriveLocalDataHealth(validInput({
      recurringOccurrenceOverrides: [recurringOverride({ ruleId: 'missing-rule', linkedTransactionId: undefined, status: 'skipped' })],
    }))

    expect(report.warnings).toContainEqual(expect.objectContaining({
      id: 'orphan-reference:recurring-overrides:rule',
      severity: 'attention',
      count: 1,
      table: 'recurringOccurrenceOverrides',
    }))
  })

  it('gera warning attention para CardPurchase com cardId inexistente', () => {
    const report = deriveLocalDataHealth(validInput({
      cardPurchases: [cardPurchase({ cardId: 'missing-card' })],
    }))

    expect(report.warnings).toContainEqual(expect.objectContaining({
      id: 'orphan-reference:card-purchases:card',
      severity: 'attention',
      count: 1,
      table: 'cardPurchases',
    }))
  })

  it('gera warning attention para CardInvoicePayment com cardId inexistente', () => {
    const report = deriveLocalDataHealth(validInput({
      cardInvoicePayments: [cardInvoicePayment({ cardId: 'missing-card' })],
    }))

    expect(report.warnings).toContainEqual(expect.objectContaining({
      id: 'orphan-reference:card-invoice-payments:card',
      severity: 'attention',
      count: 1,
      table: 'cardInvoicePayments',
    }))
  })

  it('gera warning para linkedTransactionId inexistente quando aplicavel', () => {
    const report = deriveLocalDataHealth(validInput({
      recurringOccurrenceOverrides: [recurringOverride({ linkedTransactionId: 'missing-tx' })],
      cardInvoicePayments: [cardInvoicePayment({ linkedTransactionId: 'missing-tx' })],
    }))

    expect(report.warnings).toContainEqual(expect.objectContaining({
      id: 'orphan-reference:recurring-overrides:transaction',
      count: 1,
    }))
    expect(report.warnings).toContainEqual(expect.objectContaining({
      id: 'orphan-reference:card-invoice-payments:transaction',
      count: 1,
    }))
  })

  it('gera warnings para valores numericos invalidos', () => {
    const report = deriveLocalDataHealth(validInput({
      transactions: [transaction({ amount: Number.NaN })],
      goals: [goal({ targetAmount: -1 })],
      goalContributions: [goalContribution({ amount: Number.POSITIVE_INFINITY })],
      monthlyBudgets: [monthlyBudget({ totalLimit: -1 })],
      categoryBudgets: [categoryBudget({ limit: Number.NaN })],
      recurringRules: [recurringRule({ amount: 0 })],
      creditCards: [creditCard({ creditLimit: -1 })],
      cardPurchases: [cardPurchase({ totalAmount: Number.POSITIVE_INFINITY })],
    }))

    expect(report.warnings.map((warning) => warning.id)).toEqual(expect.arrayContaining([
      'invalid-value:transactions:amount',
      'invalid-value:goals:target-amount',
      'invalid-value:goal-contributions:amount',
      'invalid-value:monthly-budgets:total-limit',
      'invalid-value:category-budgets:limit',
      'invalid-value:recurring-rules:amount',
      'invalid-value:credit-cards:credit-limit',
      'invalid-value:card-purchases:total-amount',
    ]))
  })

  it('gera warnings para datas invalidas', () => {
    const report = deriveLocalDataHealth(validInput({
      transactions: [transaction({ occurredAt: 'invalid-date' })],
      goals: [goal({ updatedAt: 'invalid-date' })],
      goalContributions: [goalContribution({ date: 'invalid-date' })],
      monthlyBudgets: [monthlyBudget({ createdAt: 'invalid-date' })],
      categoryBudgets: [categoryBudget({ updatedAt: 'invalid-date' })],
      recurringRules: [recurringRule({ createdAt: 'invalid-date' })],
      recurringOccurrenceOverrides: [recurringOverride({ updatedAt: 'invalid-date' })],
      creditCards: [creditCard({ createdAt: 'invalid-date' })],
      cardPurchases: [cardPurchase({ purchaseDate: 'invalid-date' })],
      cardInvoicePayments: [cardInvoicePayment({ paymentDate: 'invalid-date' })],
    }))

    expect(report.warnings.map((warning) => warning.id)).toEqual(expect.arrayContaining([
      'invalid-date:transactions',
      'invalid-date:goals',
      'invalid-date:goal-contributions',
      'invalid-date:monthly-budgets',
      'invalid-date:category-budgets',
      'invalid-date:recurring-rules',
      'invalid-date:recurring-overrides',
      'invalid-date:credit-cards',
      'invalid-date:card-purchases',
      'invalid-date:card-invoice-payments',
    ]))
  })

  it('trata conflitos de sync pendentes como status opcional sem tornar sync obrigatorio', () => {
    const report = deriveLocalDataHealth(validInput({
      syncConflicts: [syncConflict()],
    }))

    expect(report.status).toBe('ok')
    expect(report.warnings).toContainEqual(expect.objectContaining({
      id: 'sync-conflict:pending',
      kind: 'sync-conflict',
      severity: 'info',
      count: 1,
      table: 'syncConflicts',
    }))
    expect(report.warnings[0].message).toContain('O uso local continua disponivel')
    expect(report.warnings[0].message).not.toMatch(/obrigatorio sincronizar/i)
  })

  it('ordena warnings de forma deterministica por severidade e id', () => {
    const report = deriveLocalDataHealth(validInput({
      syncConflicts: [syncConflict()],
      cardPurchases: [cardPurchase({ cardId: 'missing-card' })],
      goals: [goal({ targetAmount: -1 })],
    }))

    expect(report.warnings.map((warning) => warning.id)).toEqual([
      'invalid-value:goals:target-amount',
      'orphan-reference:card-purchases:card',
      'sync-conflict:pending',
    ])
  })

  it('nao muta o input recebido', () => {
    const input = validInput({ syncConflicts: [syncConflict()] })
    const before = JSON.stringify(input)

    deriveLocalDataHealth(input)

    expect(JSON.stringify(input)).toBe(before)
  })

  it('nao acessa Dexie, rede, Supabase ou storage', () => {
    const source = readFileSync(new URL('./localDataHealth.ts', import.meta.url), 'utf8')

    expect(source).not.toMatch(/from ['"].*database['"]|\bdb\.|Dexie|fetch\(|XMLHttpRequest|supabase|localStorage|sessionStorage|indexedDB/i)
  })
})

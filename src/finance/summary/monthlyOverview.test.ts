import { describe, expect, it } from 'vitest'
import type {
  CardInvoicePayment,
  CardPurchase,
  CreditCard,
  MonthlyBudget,
  RecurringOccurrenceOverride,
  RecurringRule,
  Transaction,
} from '../../db/types'
import { buildMonthlyOverview, type MonthlyOverviewInput } from './monthlyOverview'

const september = { year: 2026, month: 8 }
const october = { year: 2026, month: 9 }
const now = new Date('2026-09-10T12:00:00.000Z')

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-1',
    type: overrides.type ?? 'expense',
    kind: overrides.kind,
    amount: overrides.amount ?? 100,
    description: overrides.description ?? 'Mercado',
    category: overrides.category ?? 'Mercado',
    paymentMethod: overrides.paymentMethod ?? 'pix',
    occurredAt: overrides.occurredAt ?? '2026-09-05T12:00:00.000Z',
    createdAt: overrides.createdAt ?? '2026-09-05T12:00:00.000Z',
  }
}

function budget(overrides: Partial<MonthlyBudget> = {}): MonthlyBudget {
  return {
    id: overrides.id ?? 'budget-1',
    year: overrides.year ?? september.year,
    month: overrides.month ?? september.month,
    totalLimit: overrides.totalLimit ?? 1000,
    createdAt: overrides.createdAt ?? '2026-09-01T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-09-01T12:00:00.000Z',
  }
}

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: overrides.id ?? 'rule-1',
    type: overrides.type ?? 'expense',
    description: overrides.description ?? 'Aluguel',
    amount: overrides.amount ?? 300,
    category: overrides.category ?? 'Casa',
    paymentMethod: overrides.paymentMethod ?? 'pix',
    cadence: 'monthly',
    dayOfMonth: overrides.dayOfMonth ?? 20,
    startYear: overrides.startYear ?? 2026,
    startMonth: overrides.startMonth ?? 0,
    endYear: overrides.endYear,
    endMonth: overrides.endMonth,
    active: overrides.active ?? true,
    createdAt: overrides.createdAt ?? '2026-01-01T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T12:00:00.000Z',
  }
}

function override(overrides: Partial<RecurringOccurrenceOverride> = {}): RecurringOccurrenceOverride {
  return {
    id: overrides.id ?? `${overrides.ruleId ?? 'rule-1'}-2026-09`,
    ruleId: overrides.ruleId ?? 'rule-1',
    year: overrides.year ?? september.year,
    month: overrides.month ?? september.month,
    status: overrides.status ?? 'skipped',
    linkedTransactionId: overrides.linkedTransactionId,
    createdAt: overrides.createdAt ?? '2026-09-01T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-09-01T12:00:00.000Z',
  }
}

function card(overrides: Partial<CreditCard> = {}): CreditCard {
  return {
    id: overrides.id ?? 'card-1',
    name: overrides.name ?? 'Roxo',
    creditLimit: overrides.creditLimit,
    closingDay: overrides.closingDay ?? 10,
    dueDay: overrides.dueDay ?? 20,
    active: overrides.active ?? true,
    createdAt: overrides.createdAt ?? '2026-01-01T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T12:00:00.000Z',
  }
}

function purchase(overrides: Partial<CardPurchase> = {}): CardPurchase {
  return {
    id: overrides.id ?? 'purchase-1',
    cardId: overrides.cardId ?? 'card-1',
    description: overrides.description ?? 'Notebook',
    category: overrides.category ?? 'Trabalho',
    totalAmount: overrides.totalAmount ?? 600,
    purchaseDate: overrides.purchaseDate ?? '2026-09-05T12:00:00.000Z',
    installmentCount: overrides.installmentCount ?? 3,
    createdAt: overrides.createdAt ?? '2026-09-05T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-09-05T12:00:00.000Z',
  }
}

function payment(overrides: Partial<CardInvoicePayment> = {}): CardInvoicePayment {
  return {
    id: overrides.id ?? 'card-1-2026-09',
    cardId: overrides.cardId ?? 'card-1',
    invoiceYear: overrides.invoiceYear ?? september.year,
    invoiceMonth: overrides.invoiceMonth ?? september.month,
    linkedTransactionId: overrides.linkedTransactionId ?? 'invoice-payment',
    paymentDate: overrides.paymentDate ?? '2026-09-20T12:00:00.000Z',
    paidAt: overrides.paidAt ?? '2026-09-20T13:00:00.000Z',
    createdAt: overrides.createdAt ?? '2026-09-20T13:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-09-20T13:00:00.000Z',
  }
}

function overviewInput(overrides: Partial<MonthlyOverviewInput> = {}): MonthlyOverviewInput {
  return {
    selectedMonth: overrides.selectedMonth ?? september,
    transactions: overrides.transactions ?? [],
    recurringRules: overrides.recurringRules ?? [],
    recurringOverrides: overrides.recurringOverrides ?? [],
    creditCards: overrides.creditCards ?? [],
    cardPurchases: overrides.cardPurchases ?? [],
    cardInvoicePayments: overrides.cardInvoicePayments ?? [],
    monthlyBudget: overrides.monthlyBudget,
    now: overrides.now ?? now,
  }
}

describe('buildMonthlyOverview', () => {
  it('aggregates real cash actuals only for the selected month', () => {
    const result = buildMonthlyOverview(overviewInput({
      transactions: [
        tx({ id: 'income', type: 'income', amount: 1000, occurredAt: '2026-09-03T12:00:00.000Z' }),
        tx({ id: 'expense', type: 'expense', amount: 250, occurredAt: '2026-09-04T12:00:00.000Z' }),
        tx({ id: 'other-month', type: 'expense', amount: 999, occurredAt: '2026-10-04T12:00:00.000Z' }),
      ],
    }))

    expect(result.actual).toEqual({
      income: 1000,
      expenses: 250,
      net: 750,
      transactionCount: 2,
    })
    expect(result.month).toEqual(september)
  })

  it('includes pending recurring values in outlook without turning them into actuals', () => {
    const result = buildMonthlyOverview(overviewInput({
      recurringRules: [
        rule({ id: 'salary', type: 'income', amount: 3000, dayOfMonth: 25 }),
        rule({ id: 'rent', type: 'expense', amount: 900, dayOfMonth: 25 }),
      ],
    }))

    expect(result.actual).toMatchObject({ income: 0, expenses: 0, net: 0, transactionCount: 0 })
    expect(result.outlook).toMatchObject({
      plannedRecurringIncome: 3000,
      plannedRecurringExpense: 900,
      projectedIncome: 3000,
      projectedExpense: 900,
      projectedNet: 2100,
    })
  })

  it('does not count skipped or realized recurring occurrences again as planned', () => {
    const realizedTransaction = tx({
      id: 'realized-tx',
      type: 'expense',
      amount: 400,
      category: 'Casa',
      occurredAt: '2026-09-08T12:00:00.000Z',
    })
    const result = buildMonthlyOverview(overviewInput({
      transactions: [realizedTransaction],
      recurringRules: [
        rule({ id: 'skipped-rule', amount: 200 }),
        rule({ id: 'realized-rule', amount: 400 }),
      ],
      recurringOverrides: [
        override({ ruleId: 'skipped-rule', status: 'skipped' }),
        override({ ruleId: 'realized-rule', status: 'realized', linkedTransactionId: 'realized-tx' }),
      ],
    }))

    expect(result.actual.expenses).toBe(400)
    expect(result.outlook.plannedRecurringExpense).toBe(0)
    expect(result.outlook.projectedExpense).toBe(400)
  })

  it('includes open card invoice commitments in the outlook', () => {
    const result = buildMonthlyOverview(overviewInput({
      creditCards: [card()],
      cardPurchases: [purchase()],
    }))

    expect(result.outlook.committedCardExpense).toBe(200)
    expect(result.outlook.projectedExpense).toBe(200)
    expect(result.actual.expenses).toBe(0)
  })

  it('counts invoice payment as actual cash expense without adding a duplicate budget spend', () => {
    const invoicePayment = tx({
      id: 'invoice-payment',
      type: 'expense',
      kind: 'credit_card_payment',
      amount: 200,
      category: 'Cartao',
      occurredAt: '2026-09-20T12:00:00.000Z',
    })
    const result = buildMonthlyOverview(overviewInput({
      transactions: [invoicePayment],
      creditCards: [card()],
      cardPurchases: [purchase()],
      cardInvoicePayments: [payment()],
      monthlyBudget: budget({ totalLimit: 500 }),
    }))

    expect(result.actual.expenses).toBe(200)
    expect(result.budget).toMatchObject({
      hasBudget: true,
      limit: 500,
      spent: 200,
      remaining: 300,
      percentageUsed: 0.4,
      isOverLimit: false,
      overLimitAmount: 0,
    })
  })

  it('uses the BudgetPlanner semantics for standard expenses plus card commitments', () => {
    const result = buildMonthlyOverview(overviewInput({
      transactions: [
        tx({ id: 'groceries', type: 'expense', kind: 'standard', amount: 150, category: 'Mercado' }),
        tx({ id: 'invoice-payment', type: 'expense', kind: 'credit_card_payment', amount: 200, category: 'Cartao' }),
      ],
      creditCards: [card()],
      cardPurchases: [purchase()],
      monthlyBudget: budget({ totalLimit: 300 }),
    }))

    expect(result.actual.expenses).toBe(350)
    expect(result.budget).toMatchObject({
      spent: 350,
      remaining: -50,
      percentageUsed: 350 / 300,
      isOverLimit: true,
      overLimitAmount: 50,
    })
  })

  it('keeps budget optional with percentageUsed null when no budget exists', () => {
    const result = buildMonthlyOverview(overviewInput({
      transactions: [tx({ amount: 120 })],
      monthlyBudget: null,
    }))

    expect(result.budget).toMatchObject({
      hasBudget: false,
      limit: 0,
      spent: 120,
      remaining: 0,
      percentageUsed: null,
      isOverLimit: false,
      overLimitAmount: 0,
    })
  })

  it('keeps projectedNet as a monthly flow metric without opening balance', () => {
    const result = buildMonthlyOverview(overviewInput({
      transactions: [
        tx({ id: 'income', type: 'income', amount: 500, occurredAt: '2026-09-03T12:00:00.000Z' }),
        tx({ id: 'expense', type: 'expense', amount: 100, occurredAt: '2026-09-04T12:00:00.000Z' }),
      ],
      recurringRules: [rule({ id: 'future-expense', type: 'expense', amount: 50, dayOfMonth: 25 })],
    }))

    expect(result.outlook.projectedNet).toBe(350)
    expect(result.outlook.projectedNet).toBe(result.outlook.projectedIncome - result.outlook.projectedExpense)
    expect(Object.keys(result.outlook)).not.toContain('openingBalance')
  })

  it('uses the selected month for all aggregate helpers', () => {
    const result = buildMonthlyOverview(overviewInput({
      selectedMonth: october,
      transactions: [
        tx({ id: 'september-income', type: 'income', amount: 1000, occurredAt: '2026-09-03T12:00:00.000Z' }),
        tx({ id: 'october-expense', type: 'expense', amount: 80, occurredAt: '2026-10-03T12:00:00.000Z' }),
      ],
      recurringRules: [rule({ id: 'october-rule', amount: 70, dayOfMonth: 20 })],
      monthlyBudget: budget({ year: october.year, month: october.month, totalLimit: 100 }),
      now: new Date('2026-10-10T12:00:00.000Z'),
    }))

    expect(result.actual).toMatchObject({ income: 0, expenses: 80, net: -80, transactionCount: 1 })
    expect(result.outlook.plannedRecurringExpense).toBe(70)
    expect(result.budget.spent).toBe(80)
  })
})

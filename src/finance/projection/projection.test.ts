import { describe, expect, it } from 'vitest'
import type {
  CardInvoicePayment,
  CardPurchase,
  CreditCard,
  RecurringOccurrenceOverride,
  RecurringRule,
  Transaction,
} from '../../db/types'
import type { SelectedMonth } from '../month'
import { projectMonths } from './projection'

const september: SelectedMonth = { year: 2026, month: 8 }

function tx(input: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    type: 'expense',
    kind: 'standard',
    amount: 100,
    description: 'Mercado',
    category: 'Casa',
    paymentMethod: 'pix',
    occurredAt: '2026-09-10T12:00:00.000Z',
    createdAt: '2026-09-10T12:00:00.000Z',
    ...input,
  }
}

function recurring(input: Partial<RecurringRule> = {}): RecurringRule {
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
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...input,
  }
}

function override(input: Partial<RecurringOccurrenceOverride> = {}): RecurringOccurrenceOverride {
  return {
    id: 'override-1',
    ruleId: 'rule-1',
    year: 2026,
    month: 8,
    status: 'skipped',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...input,
  }
}

function card(input: Partial<CreditCard> = {}): CreditCard {
  return {
    id: 'card-1',
    name: 'Nubank',
    creditLimit: 3000,
    closingDay: 25,
    dueDay: 2,
    active: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...input,
  }
}

function purchase(input: Partial<CardPurchase> = {}): CardPurchase {
  return {
    id: 'purchase-1',
    cardId: 'card-1',
    description: 'Notebook',
    category: 'Compras',
    totalAmount: 1200,
    purchaseDate: '2026-09-20T12:00:00.000Z',
    installmentCount: 4,
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
    ...input,
  }
}

function payment(input: Partial<CardInvoicePayment> = {}): CardInvoicePayment {
  return {
    id: 'payment-1',
    cardId: 'card-1',
    invoiceYear: 2026,
    invoiceMonth: 8,
    linkedTransactionId: 'card-payment',
    paymentDate: '2026-09-30T12:00:00.000Z',
    paidAt: '2026-09-30T13:00:00.000Z',
    createdAt: '2026-09-30T13:00:00.000Z',
    updatedAt: '2026-09-30T13:00:00.000Z',
    ...input,
  }
}

function project(input: Partial<Parameters<typeof projectMonths>[2]> = {}, startMonth = september, count = 1) {
  return projectMonths(startMonth, count, {
    transactions: [],
    recurringRules: [],
    recurringOverrides: [],
    creditCards: [],
    cardPurchases: [],
    cardInvoicePayments: [],
    ...input,
  }, new Date('2026-09-01T12:00:00.000Z'))
}

describe('multi-month projection engine', () => {
  it('returns zeroed months when there is no data', () => {
    expect(project().months[0]).toMatchObject({
      actualIncome: 0,
      actualExpense: 0,
      plannedRecurringIncome: 0,
      plannedRecurringExpense: 0,
      committedCardExpense: 0,
      projectedNet: 0,
      cumulativeProjectedNet: 0,
    })
  })

  it('projects only recurring income', () => {
    const result = project({ recurringRules: [recurring({ type: 'income', amount: 1500, category: 'Renda' })] })

    expect(result.months[0]).toMatchObject({
      plannedRecurringIncome: 1500,
      projectedIncome: 1500,
      projectedExpense: 0,
      projectedNet: 1500,
    })
  })

  it('projects only recurring expense', () => {
    const result = project({ recurringRules: [recurring({ amount: 120 })] })

    expect(result.months[0]).toMatchObject({
      plannedRecurringExpense: 120,
      projectedIncome: 0,
      projectedExpense: 120,
      projectedNet: -120,
    })
  })

  it('projects only card commitments', () => {
    const result = project({
      creditCards: [card()],
      cardPurchases: [purchase()],
    })

    expect(result.months[0]).toMatchObject({
      committedCardExpense: 300,
      projectedExpense: 300,
      projectedNet: -300,
    })
  })

  it('combines actual and recurring values', () => {
    const result = project({
      transactions: [tx({ type: 'income', amount: 700 }), tx({ id: 'expense', amount: 200 })],
      recurringRules: [recurring({ type: 'income', amount: 800, category: 'Renda' }), recurring({ id: 'rule-2', amount: 120 })],
    })

    expect(result.months[0]).toMatchObject({
      actualIncome: 700,
      actualExpense: 200,
      plannedRecurringIncome: 800,
      plannedRecurringExpense: 120,
      projectedNet: 1180,
    })
  })

  it('combines actual and card values', () => {
    const result = project({
      transactions: [tx({ amount: 200 })],
      creditCards: [card()],
      cardPurchases: [purchase()],
    })

    expect(result.months[0]).toMatchObject({
      actualExpense: 200,
      committedCardExpense: 300,
      projectedExpense: 500,
      projectedNet: -500,
    })
  })

  it('combines recurring and card values', () => {
    const result = project({
      recurringRules: [recurring({ type: 'income', amount: 1000, category: 'Renda' }), recurring({ id: 'rule-2', amount: 120 })],
      creditCards: [card()],
      cardPurchases: [purchase()],
    })

    expect(result.months[0]).toMatchObject({
      plannedRecurringIncome: 1000,
      plannedRecurringExpense: 120,
      committedCardExpense: 300,
      projectedNet: 580,
    })
  })

  it('combines all sources and exposes source breakdown', () => {
    const result = project({
      transactions: [tx({ type: 'income', amount: 700 }), tx({ id: 'expense', amount: 200 })],
      recurringRules: [recurring({ type: 'income', amount: 800, category: 'Renda' }), recurring({ id: 'rule-2', amount: 120 })],
      creditCards: [card()],
      cardPurchases: [purchase()],
      monthlyBudgets: [{ id: 'budget', year: 2026, month: 8, totalLimit: 2000, createdAt: '', updatedAt: '' }],
    })

    expect(result.months[0]).toMatchObject({
      actualIncome: 700,
      actualExpense: 200,
      plannedRecurringIncome: 800,
      plannedRecurringExpense: 120,
      committedCardExpense: 300,
      projectedNet: 880,
      budgetLimit: 2000,
      breakdown: {
        actual: { transactionCount: 2 },
        recurring: { pendingCount: 2 },
        cards: { invoiceCount: 1 },
      },
    })
  })

  it('does not double count realized recurring occurrences', () => {
    const result = project({
      transactions: [tx({ id: 'internet-actual', amount: 120 })],
      recurringRules: [recurring({ amount: 120 })],
      recurringOverrides: [override({ status: 'realized', linkedTransactionId: 'internet-actual' })],
    })

    expect(result.months[0]).toMatchObject({
      actualExpense: 120,
      plannedRecurringExpense: 0,
      projectedExpense: 120,
      projectedNet: -120,
      breakdown: { recurring: { realizedCount: 1 } },
    })
  })

  it('does not double count a paid card invoice', () => {
    const cardPayment = tx({
      id: 'card-payment',
      kind: 'credit_card_payment',
      amount: 300,
      description: 'Fatura Nubank',
      category: 'Cartao',
      occurredAt: '2026-09-30T12:00:00.000Z',
    })
    const result = project({
      transactions: [cardPayment],
      creditCards: [card()],
      cardPurchases: [purchase()],
      cardInvoicePayments: [payment()],
    })

    expect(result.months[0]).toMatchObject({
      actualExpense: 300,
      committedCardExpense: 0,
      projectedExpense: 300,
      projectedNet: -300,
    })
  })

  it('uses paymentDate month for cash movement while preserving invoice competence', () => {
    const earlyPayment = tx({
      id: 'card-payment',
      kind: 'credit_card_payment',
      amount: 300,
      description: 'Fatura Nubank',
      category: 'Cartao',
      occurredAt: '2026-09-30T12:00:00.000Z',
    })
    const result = project({
      transactions: [earlyPayment],
      creditCards: [card()],
      cardPurchases: [purchase({ purchaseDate: '2026-09-26T12:00:00.000Z' })],
      cardInvoicePayments: [payment({ invoiceMonth: 9, paymentDate: earlyPayment.occurredAt })],
    }, september, 2)

    expect(result.months[0]).toMatchObject({ month: 8, actualExpense: 300, committedCardExpense: 0, projectedExpense: 300 })
    expect(result.months[1]).toMatchObject({ month: 9, actualExpense: 0, committedCardExpense: 0, projectedExpense: 0 })
  })

  it('projects installments across multiple months with cumulative result', () => {
    const result = project({
      creditCards: [card()],
      cardPurchases: [purchase()],
    }, september, 4)

    expect(result.months.map((month) => month.committedCardExpense)).toEqual([300, 300, 300, 300])
    expect(result.months.map((month) => month.cumulativeProjectedNet)).toEqual([-300, -600, -900, -1200])
  })

  it('preserves cents across card installments', () => {
    const result = project({
      creditCards: [card()],
      cardPurchases: [purchase({ totalAmount: 100, installmentCount: 3 })],
    }, september, 3)

    expect(result.months.map((month) => month.committedCardExpense)).toEqual([33.34, 33.33, 33.33])
    expect(result.totalProjectedExpense).toBe(100)
  })

  it('skips recurring only for the overridden month', () => {
    const result = project({
      recurringRules: [recurring({ amount: 120 })],
      recurringOverrides: [override({ year: 2026, month: 9, status: 'skipped' })],
    }, september, 3)

    expect(result.months.map((month) => month.plannedRecurringExpense)).toEqual([120, 0, 120])
  })

  it('does not project recurring after end month', () => {
    const result = project({
      recurringRules: [recurring({ amount: 120, endYear: 2026, endMonth: 9 })],
    }, september, 3)

    expect(result.months.map((month) => month.plannedRecurringExpense)).toEqual([120, 120, 0])
  })

  it('handles november to december to january', () => {
    const result = project({
      recurringRules: [recurring({ amount: 100, startYear: 2026, startMonth: 10 })],
    }, { year: 2026, month: 10 }, 3)

    expect(result.months.map((month) => `${month.year}-${month.month}`)).toEqual(['2026-10', '2026-11', '2027-0'])
    expect(result.totalProjectedNet).toBe(-300)
  })

  it('supports leap-year date clamping through recurring rules', () => {
    const result = project({
      recurringRules: [recurring({ amount: 100, dayOfMonth: 31, startYear: 2028, startMonth: 1 })],
    }, { year: 2028, month: 1 }, 1)

    expect(result.months[0]).toMatchObject({
      plannedRecurringExpense: 100,
      projectedNet: -100,
    })
  })

  it('validates projection horizon', () => {
    expect(() => project({}, september, 0)).toThrow('Horizonte de projecao')
    expect(() => project({}, september, 121)).toThrow('Horizonte de projecao')
  })

  it('validates a combined multi-year scenario without duplicate sources', () => {
    const november2026: SelectedMonth = { year: 2026, month: 10 }
    const december2026: SelectedMonth = { year: 2026, month: 11 }
    const january2027: SelectedMonth = { year: 2027, month: 0 }
    const earlyInvoicePayment = tx({
      id: 'invoice-payment-nov',
      kind: 'credit_card_payment',
      amount: 300,
      description: 'Fatura Inter',
      category: 'Cartao',
      occurredAt: '2026-11-30T12:00:00.000Z',
    })
    const realizedSalary = tx({
      id: 'salary-december',
      type: 'income',
      amount: 1500,
      description: 'Salario',
      category: 'Renda',
      occurredAt: '2026-12-05T12:00:00.000Z',
    })
    const commonInput = {
      transactions: [earlyInvoicePayment, realizedSalary],
      recurringRules: [
        recurring({ id: 'salary', type: 'income', amount: 1500, description: 'Salario', category: 'Renda', startYear: 2026, startMonth: 10 }),
        recurring({ id: 'internet', amount: 120, description: 'Internet', startYear: 2026, startMonth: 10 }),
        recurring({ id: 'course', amount: 200, description: 'Curso', category: 'Estudos', startYear: 2026, startMonth: 10 }),
      ],
      recurringOverrides: [
        override({ id: 'salary-realized-dec', ruleId: 'salary', year: december2026.year, month: december2026.month, status: 'realized', linkedTransactionId: realizedSalary.id }),
        override({ id: 'internet-skipped-jan', ruleId: 'internet', year: january2027.year, month: january2027.month, status: 'skipped' }),
      ],
      creditCards: [card({ id: 'card-inter', name: 'Inter' })],
      cardPurchases: [
        purchase({
          id: 'notebook',
          cardId: 'card-inter',
          totalAmount: 1200,
          purchaseDate: '2026-11-20T12:00:00.000Z',
          installmentCount: 4,
        }),
      ],
      cardInvoicePayments: [
        payment({
          id: 'nov-invoice-paid',
          cardId: 'card-inter',
          invoiceYear: 2026,
          invoiceMonth: 10,
          linkedTransactionId: earlyInvoicePayment.id,
          paymentDate: earlyInvoicePayment.occurredAt,
        }),
      ],
      monthlyBudgets: [
        { id: 'tiny-budget', year: 2026, month: 10, totalLimit: 1, createdAt: '', updatedAt: '' },
      ],
    }
    const result = project(commonInput, november2026, 12)

    expect(result.months.map((month) => `${month.year}-${month.month}`)).toEqual([
      '2026-10',
      '2026-11',
      '2027-0',
      '2027-1',
      '2027-2',
      '2027-3',
      '2027-4',
      '2027-5',
      '2027-6',
      '2027-7',
      '2027-8',
      '2027-9',
    ])
    expect(result.months[0]).toMatchObject({
      actualExpense: 300,
      plannedRecurringIncome: 1500,
      plannedRecurringExpense: 320,
      committedCardExpense: 0,
      projectedNet: 880,
      cumulativeProjectedNet: 880,
      budgetLimit: 1,
    })
    expect(result.months[1]).toMatchObject({
      actualIncome: 1500,
      plannedRecurringIncome: 0,
      plannedRecurringExpense: 320,
      committedCardExpense: 300,
      projectedNet: 880,
      cumulativeProjectedNet: 1760,
    })
    expect(result.months[2]).toMatchObject({
      plannedRecurringIncome: 1500,
      plannedRecurringExpense: 200,
      committedCardExpense: 300,
      projectedNet: 1000,
      cumulativeProjectedNet: 2760,
      breakdown: { recurring: { skippedCount: 1 } },
    })
    expect(result.months[3]).toMatchObject({
      plannedRecurringIncome: 1500,
      plannedRecurringExpense: 320,
      committedCardExpense: 300,
      projectedNet: 880,
      cumulativeProjectedNet: 3640,
    })
    expect(result.months[4]).toMatchObject({
      plannedRecurringIncome: 1500,
      plannedRecurringExpense: 320,
      committedCardExpense: 0,
      projectedNet: 1180,
    })

    const sameWithoutBudget = project({ ...commonInput, monthlyBudgets: [] }, november2026, 1)
    expect(sameWithoutBudget.months[0].projectedNet).toBe(result.months[0].projectedNet)
  })
})

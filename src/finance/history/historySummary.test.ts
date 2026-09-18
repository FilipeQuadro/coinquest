import { describe, expect, it } from 'vitest'
import type { PaymentMethod, Transaction } from '../../db/types'
import { deriveHistorySummary } from './historySummary'

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-1',
    type: overrides.type ?? 'expense',
    amount: overrides.amount ?? 100,
    description: overrides.description ?? 'Mercado',
    category: overrides.category ?? 'Alimentacao',
    paymentMethod: overrides.paymentMethod ?? 'pix',
    occurredAt: overrides.occurredAt ?? '2026-09-10T12:00:00.000Z',
    createdAt: overrides.createdAt ?? '2026-09-10T12:00:00.000Z',
    kind: overrides.kind,
  }
}

describe('deriveHistorySummary', () => {
  it('returns empty totals for an empty list', () => {
    expect(deriveHistorySummary([])).toEqual({
      totalIncome: 0,
      totalExpense: 0,
      netAmount: 0,
      transactionCount: 0,
      incomeCount: 0,
      expenseCount: 0,
      topCategories: [],
      paymentMethodTotals: [],
    })
  })

  it('summarizes income transactions', () => {
    const result = deriveHistorySummary([
      tx({ id: 'income-1', type: 'income', amount: 1000, category: 'Renda', paymentMethod: 'transfer' }),
      tx({ id: 'income-2', type: 'income', amount: 250, category: 'Renda', paymentMethod: 'pix' }),
    ])

    expect(result).toMatchObject({
      totalIncome: 1250,
      totalExpense: 0,
      netAmount: 1250,
      transactionCount: 2,
      incomeCount: 2,
      expenseCount: 0,
    })
  })

  it('summarizes expense transactions', () => {
    const result = deriveHistorySummary([
      tx({ id: 'expense-1', type: 'expense', amount: 320, category: 'Alimentacao' }),
      tx({ id: 'expense-2', type: 'expense', amount: 80, category: 'Transporte' }),
    ])

    expect(result).toMatchObject({
      totalIncome: 0,
      totalExpense: 400,
      netAmount: -400,
      transactionCount: 2,
      incomeCount: 0,
      expenseCount: 2,
    })
  })

  it('calculates netAmount from income and expenses without naming it as balance', () => {
    const result = deriveHistorySummary([
      tx({ id: 'income', type: 'income', amount: 900, category: 'Renda' }),
      tx({ id: 'expense', type: 'expense', amount: 250, category: 'Moradia' }),
    ])

    expect(result.netAmount).toBe(650)
    expect(Object.keys(result)).not.toContain('balance')
    expect(Object.keys(result)).not.toContain('saldo')
  })

  it('counts total, income and expense transactions', () => {
    const result = deriveHistorySummary([
      tx({ id: 'income-1', type: 'income', amount: 100 }),
      tx({ id: 'income-2', type: 'income', amount: 200 }),
      tx({ id: 'expense-1', type: 'expense', amount: 50 }),
      tx({ id: 'expense-2', type: 'expense', amount: 75 }),
    ])

    expect(result.transactionCount).toBe(4)
    expect(result.incomeCount).toBe(2)
    expect(result.expenseCount).toBe(2)
  })

  it('orders top categories by absolute movement amount', () => {
    const result = deriveHistorySummary([
      tx({ id: 'food-1', type: 'expense', amount: 120, category: 'Alimentacao' }),
      tx({ id: 'food-2', type: 'expense', amount: 80, category: 'Alimentacao' }),
      tx({ id: 'income', type: 'income', amount: 500, category: 'Renda' }),
      tx({ id: 'transport', type: 'expense', amount: 60, category: 'Transporte' }),
    ])

    expect(result.topCategories).toEqual([
      {
        category: 'Renda',
        amount: 500,
        transactionCount: 1,
        incomeAmount: 500,
        expenseAmount: 0,
        incomeCount: 1,
        expenseCount: 0,
      },
      {
        category: 'Alimentacao',
        amount: 200,
        transactionCount: 2,
        incomeAmount: 0,
        expenseAmount: 200,
        incomeCount: 0,
        expenseCount: 2,
      },
      {
        category: 'Transporte',
        amount: 60,
        transactionCount: 1,
        incomeAmount: 0,
        expenseAmount: 60,
        incomeCount: 0,
        expenseCount: 1,
      },
    ])
  })

  it('orders tied categories deterministically by category', () => {
    const result = deriveHistorySummary([
      tx({ id: 'z', amount: 100, category: 'Transporte' }),
      tx({ id: 'a', amount: 100, category: 'Alimentacao' }),
      tx({ id: 'm', amount: 100, category: 'Moradia' }),
    ])

    expect(result.topCategories.map((item) => item.category)).toEqual([
      'Alimentacao',
      'Moradia',
      'Transporte',
    ])
  })

  it('keeps category spelling from transactions while trimming only surrounding spaces', () => {
    const result = deriveHistorySummary([
      tx({ id: 'legacy', amount: 100, category: ' Saude ' }),
      tx({ id: 'accented', amount: 50, category: 'Saúde' }),
    ])

    expect(result.topCategories.map((item) => item.category)).toEqual(['Saude', 'Saúde'])
  })

  it('uses a safe category label when a legacy record has no category text', () => {
    const result = deriveHistorySummary([
      tx({ id: 'blank', amount: 100, category: '   ' }),
    ])

    expect(result.topCategories[0]).toMatchObject({
      category: 'Sem categoria',
      amount: 100,
      transactionCount: 1,
    })
  })

  it('summarizes payment methods because History already filters by payment method', () => {
    const pix: PaymentMethod = 'pix'
    const transfer: PaymentMethod = 'transfer'

    const result = deriveHistorySummary([
      tx({ id: 'pix-expense', type: 'expense', amount: 100, paymentMethod: pix }),
      tx({ id: 'pix-income', type: 'income', amount: 40, paymentMethod: pix }),
      tx({ id: 'transfer-income', type: 'income', amount: 300, paymentMethod: transfer }),
    ])

    expect(result.paymentMethodTotals).toEqual([
      {
        paymentMethod: 'transfer',
        amount: 300,
        transactionCount: 1,
        incomeAmount: 300,
        expenseAmount: 0,
        incomeCount: 1,
        expenseCount: 0,
      },
      {
        paymentMethod: 'pix',
        amount: 140,
        transactionCount: 2,
        incomeAmount: 40,
        expenseAmount: 100,
        incomeCount: 1,
        expenseCount: 1,
      },
    ])
  })

  it('does not treat a credit card purchase as a transaction, but keeps real invoice payments as expenses when provided', () => {
    const result = deriveHistorySummary([
      tx({
        id: 'invoice-payment',
        type: 'expense',
        kind: 'credit_card_payment',
        amount: 450,
        category: 'Fatura',
        paymentMethod: 'transfer',
      }),
    ])

    expect(result).toMatchObject({
      totalIncome: 0,
      totalExpense: 450,
      netAmount: -450,
      transactionCount: 1,
      incomeCount: 0,
      expenseCount: 1,
    })
    expect(result.topCategories[0]).toMatchObject({
      category: 'Fatura',
      amount: 450,
    })
  })

  it('does not mutate the input', () => {
    const original = [
      tx({ id: 'income', type: 'income', amount: 500, category: 'Renda' }),
      tx({ id: 'expense', type: 'expense', amount: 100, category: 'Alimentacao' }),
    ]
    const before = structuredClone(original)

    const result = deriveHistorySummary(original)

    expect(result.transactionCount).toBe(2)
    expect(original).toEqual(before)
  })
})

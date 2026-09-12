import { describe, expect, it } from 'vitest'
import type { PaymentMethod, Transaction } from '../../db/types'
import {
  defaultHistoryFilters,
  filterTransactionsForHistory,
  getAvailableHistoryCategories,
  type HistoryFilters,
} from './historyFilter'

const selectedMonth = { year: 2026, month: 8 }

function iso(year: number, month: number, day: number, hour = 12, minute = 0) {
  return new Date(year, month, day, hour, minute, 0, 0).toISOString()
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-1',
    type: overrides.type ?? 'expense',
    amount: overrides.amount ?? 100,
    description: overrides.description ?? 'Mercado Central',
    category: overrides.category ?? 'Alimentacao',
    paymentMethod: overrides.paymentMethod ?? 'pix',
    occurredAt: overrides.occurredAt ?? iso(2026, 8, 10),
    createdAt: overrides.createdAt ?? iso(2026, 8, 10),
    kind: overrides.kind,
  }
}

function filters(overrides: Partial<HistoryFilters> = {}): HistoryFilters {
  return {
    ...defaultHistoryFilters,
    ...overrides,
  }
}

describe('filterTransactionsForHistory', () => {
  it('isolates transactions by selected month', () => {
    const result = filterTransactionsForHistory([
      tx({ id: 'current', occurredAt: iso(2026, 8, 1) }),
      tx({ id: 'previous', occurredAt: iso(2026, 7, 31) }),
      tx({ id: 'next', occurredAt: iso(2026, 9, 1) }),
    ], selectedMonth)

    expect(result.map((item) => item.id)).toEqual(['current'])
  })

  it('sorts newest occurredAt first with deterministic id tie-breaker', () => {
    const sameTimestamp = iso(2026, 8, 12, 9)
    const result = filterTransactionsForHistory([
      tx({ id: 'b', occurredAt: sameTimestamp }),
      tx({ id: 'older', occurredAt: iso(2026, 8, 1) }),
      tx({ id: 'a', occurredAt: sameTimestamp }),
      tx({ id: 'newest', occurredAt: iso(2026, 8, 20) }),
    ], selectedMonth)

    expect(result.map((item) => item.id)).toEqual(['newest', 'a', 'b', 'older'])
  })

  it('matches description with case-insensitive query', () => {
    const result = filterTransactionsForHistory([
      tx({ id: 'match', description: 'Mercado Central' }),
      tx({ id: 'other', description: 'Padaria' }),
    ], selectedMonth, filters({ query: ' mercado ' }))

    expect(result.map((item) => item.id)).toEqual(['match'])
  })

  it('matches category with accent-tolerant query', () => {
    const result = filterTransactionsForHistory([
      tx({ id: 'match', category: 'Educação' }),
      tx({ id: 'other', category: 'Transporte' }),
    ], selectedMonth, filters({ query: 'educacao' }))

    expect(result.map((item) => item.id)).toEqual(['match'])
  })

  it('does not restrict results when query is empty', () => {
    const result = filterTransactionsForHistory([
      tx({ id: 'one' }),
      tx({ id: 'two', description: 'Farmacia' }),
    ], selectedMonth, filters({ query: '   ' }))

    expect(result).toHaveLength(2)
  })

  it('filters income transactions', () => {
    const result = filterTransactionsForHistory([
      tx({ id: 'income', type: 'income' }),
      tx({ id: 'expense', type: 'expense' }),
    ], selectedMonth, filters({ type: 'income' }))

    expect(result.map((item) => item.id)).toEqual(['income'])
  })

  it('filters expense transactions', () => {
    const result = filterTransactionsForHistory([
      tx({ id: 'income', type: 'income' }),
      tx({ id: 'expense', type: 'expense' }),
    ], selectedMonth, filters({ type: 'expense' }))

    expect(result.map((item) => item.id)).toEqual(['expense'])
  })

  it('filters category without being surprised by spaces or capitalization', () => {
    const result = filterTransactionsForHistory([
      tx({ id: 'match', category: 'Alimentacao' }),
      tx({ id: 'other', category: 'Transporte' }),
    ], selectedMonth, filters({ category: ' alimentacao ' }))

    expect(result.map((item) => item.id)).toEqual(['match'])
  })

  it('filters payment method', () => {
    const result = filterTransactionsForHistory([
      tx({ id: 'pix', paymentMethod: 'pix' }),
      tx({ id: 'credit', paymentMethod: 'credit' }),
    ], selectedMonth, filters({ paymentMethod: 'credit' }))

    expect(result.map((item) => item.id)).toEqual(['credit'])
  })

  it('combines query, type, category and payment method filters', () => {
    const result = filterTransactionsForHistory([
      tx({ id: 'match', type: 'expense', description: 'Mercado Central', category: 'Alimentacao', paymentMethod: 'debit' }),
      tx({ id: 'wrong-type', type: 'income', description: 'Mercado Central', category: 'Alimentacao', paymentMethod: 'debit' }),
      tx({ id: 'wrong-query', type: 'expense', description: 'Farmacia', category: 'Alimentacao', paymentMethod: 'debit' }),
      tx({ id: 'wrong-category', type: 'expense', description: 'Mercado Central', category: 'Transporte', paymentMethod: 'debit' }),
      tx({ id: 'wrong-method', type: 'expense', description: 'Mercado Central', category: 'Alimentacao', paymentMethod: 'pix' }),
    ], selectedMonth, filters({
      query: 'mercado',
      type: 'expense',
      category: 'alimentacao',
      paymentMethod: 'debit',
    }))

    expect(result.map((item) => item.id)).toEqual(['match'])
  })

  it('returns an empty array when nothing matches', () => {
    const result = filterTransactionsForHistory([
      tx({ id: 'one', description: 'Mercado' }),
    ], selectedMonth, filters({ query: 'inexistente' }))

    expect(result).toEqual([])
  })

  it('does not mutate the original transaction array', () => {
    const original = [
      tx({ id: 'older', occurredAt: iso(2026, 8, 1) }),
      tx({ id: 'newer', occurredAt: iso(2026, 8, 20) }),
    ]
    const before = original.map((item) => item.id)

    const result = filterTransactionsForHistory(original, selectedMonth)

    expect(result.map((item) => item.id)).toEqual(['newer', 'older'])
    expect(original.map((item) => item.id)).toEqual(before)
  })
})

describe('getAvailableHistoryCategories', () => {
  it('returns deduplicated categories from selected month in stable alpha order', () => {
    const result = getAvailableHistoryCategories([
      tx({ id: 'food-1', category: 'Alimentacao', occurredAt: iso(2026, 8, 1) }),
      tx({ id: 'food-2', category: ' alimentacao ', occurredAt: iso(2026, 8, 2) }),
      tx({ id: 'transport', category: 'Transporte', occurredAt: iso(2026, 8, 3) }),
      tx({ id: 'education', category: 'Educação', occurredAt: iso(2026, 8, 4) }),
      tx({ id: 'other-month', category: 'Saude', occurredAt: iso(2026, 9, 1) }),
      tx({ id: 'blank', category: '   ', occurredAt: iso(2026, 8, 5) }),
    ], selectedMonth)

    expect(result).toEqual(['Alimentacao', 'Educação', 'Transporte'])
  })

  it('keeps payment method types unchanged through filters', () => {
    const method: PaymentMethod = 'transfer'
    const result = filterTransactionsForHistory([
      tx({ id: 'transfer', paymentMethod: method }),
    ], selectedMonth, filters({ paymentMethod: method }))

    expect(result[0]?.paymentMethod).toBe(method)
  })
})

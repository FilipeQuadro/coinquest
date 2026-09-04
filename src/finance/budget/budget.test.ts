import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/database'
import type { Transaction } from '../../db/types'
import { calculateFinancialHealth } from '../health/financialHealth'
import { deleteTransaction, getMonthlySummary, updateTransaction } from '../transactions'
import {
  calculateBudgetProgress,
  calculateCategoryBudgetProgress,
  deleteBudgetPlan,
  deleteCategoryBudget,
  deleteMonthlyBudget,
  getCategoryBudgets,
  getMonthlyBudget,
  parseBudgetLimit,
  saveCategoryBudget,
  saveMonthlyBudget,
  validateBudgetLimit,
  type BudgetMonth,
} from './budget'

const august: BudgetMonth = { year: 2026, month: 7 }

function tx(input: Pick<Transaction, 'id' | 'type' | 'amount' | 'category' | 'occurredAt'>): Transaction {
  return {
    description: input.category,
    paymentMethod: 'pix',
    createdAt: '2026-08-01T10:00:00.000Z',
    ...input,
  }
}

describe('monthly budget storage', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('saves, gets, updates and deletes one monthly budget per year and month', async () => {
    const first = await saveMonthlyBudget(august, 1000)
    const updated = await saveMonthlyBudget(august, 1250)

    expect(updated.id).toBe(first.id)
    await expect(getMonthlyBudget(august)).resolves.toMatchObject({ totalLimit: 1250 })
    await expect(db.monthlyBudgets.count()).resolves.toBe(1)

    await deleteMonthlyBudget(august)
    await expect(getMonthlyBudget(august)).resolves.toBeUndefined()
  })

  it('keeps category budgets unique by month and category', async () => {
    const first = await saveCategoryBudget(august, 'Alimentacao', 500)
    const updated = await saveCategoryBudget(august, 'Alimentacao', 650)
    await saveCategoryBudget(august, 'Transporte', 300)

    expect(updated.id).toBe(first.id)
    await expect(getCategoryBudgets(august)).resolves.toHaveLength(2)

    await deleteCategoryBudget(august, 'Alimentacao')
    await expect(getCategoryBudgets(august)).resolves.toEqual([
      expect.objectContaining({ category: 'Transporte', limit: 300 }),
    ])
  })

  it('keeps monthly and category budgets separated by year and month', async () => {
    const september: BudgetMonth = { year: 2026, month: 8 }
    const january: BudgetMonth = { year: 2027, month: 0 }

    await saveMonthlyBudget(august, 1000)
    await saveMonthlyBudget(september, 2000)
    await saveMonthlyBudget(january, 3000)
    await saveCategoryBudget(august, 'Alimentacao', 500)
    await saveCategoryBudget(september, 'Alimentacao', 700)

    await expect(getMonthlyBudget(august)).resolves.toMatchObject({ totalLimit: 1000 })
    await expect(getMonthlyBudget(september)).resolves.toMatchObject({ totalLimit: 2000 })
    await expect(getMonthlyBudget(january)).resolves.toMatchObject({ totalLimit: 3000 })
    await expect(getCategoryBudgets(august)).resolves.toEqual([expect.objectContaining({ limit: 500 })])
    await expect(getCategoryBudgets(september)).resolves.toEqual([expect.objectContaining({ limit: 700 })])
  })

  it('deletes one monthly budget plan without touching other months', async () => {
    const september: BudgetMonth = { year: 2026, month: 8 }

    await saveMonthlyBudget(august, 1000)
    await saveMonthlyBudget(september, 2000)
    await saveCategoryBudget(august, 'Alimentacao', 500)
    await saveCategoryBudget(september, 'Alimentacao', 700)

    await deleteBudgetPlan(august)

    await expect(getMonthlyBudget(august)).resolves.toBeUndefined()
    await expect(getCategoryBudgets(august)).resolves.toEqual([])
    await expect(getMonthlyBudget(september)).resolves.toMatchObject({ totalLimit: 2000 })
    await expect(getCategoryBudgets(september)).resolves.toEqual([expect.objectContaining({ limit: 700 })])
  })

  it('rejects invalid budget values but accepts explicit zero', () => {
    expect(validateBudgetLimit(Number.NaN)).toBe('Informe um limite valido.')
    expect(validateBudgetLimit(Number.POSITIVE_INFINITY)).toBe('Informe um limite valido.')
    expect(validateBudgetLimit(-1)).toBe('Informe um limite valido.')
    expect(validateBudgetLimit(0)).toBeNull()
  })

  it('parses currency text while allowing explicit zero', () => {
    expect(parseBudgetLimit('R$ 1.250,90')).toBe(1250.9)
    expect(parseBudgetLimit('0')).toBe(0)
    expect(parseBudgetLimit('-10')).toBeNull()
    expect(parseBudgetLimit('abc')).toBeNull()
  })
})

describe('budget progress', () => {
  const budget = {
    id: 'budget',
    year: august.year,
    month: august.month,
    totalLimit: 1000,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  }

  it('returns no-budget progress without forcing setup', () => {
    const result = calculateBudgetProgress(null, [], august)

    expect(result).toEqual({
      hasBudget: false,
      limit: 0,
      spent: 0,
      remaining: 0,
      percentageUsed: null,
      isOverLimit: false,
      overLimitAmount: 0,
    })
  })

  it('calculates 0%, 50%, 100% and over-limit usage', () => {
    expect(calculateBudgetProgress(budget, [], august).percentageUsed).toBe(0)
    expect(calculateBudgetProgress(budget, [tx({ id: 'a', type: 'expense', amount: 500, category: 'Casa', occurredAt: '2026-08-10T10:00:00.000Z' })], august)).toMatchObject({
      spent: 500,
      remaining: 500,
      percentageUsed: 0.5,
      isOverLimit: false,
    })
    expect(calculateBudgetProgress(budget, [tx({ id: 'b', type: 'expense', amount: 1000, category: 'Casa', occurredAt: '2026-08-10T10:00:00.000Z' })], august)).toMatchObject({
      percentageUsed: 1,
      isOverLimit: false,
    })
    expect(calculateBudgetProgress(budget, [tx({ id: 'c', type: 'expense', amount: 1120, category: 'Casa', occurredAt: '2026-08-10T10:00:00.000Z' })], august)).toMatchObject({
      spent: 1120,
      remaining: -120,
      percentageUsed: 1.12,
      isOverLimit: true,
      overLimitAmount: 120,
    })
  })

  it('ignores income and transactions from other months', () => {
    const transactions = [
      tx({ id: 'income', type: 'income', amount: 2000, category: 'Renda', occurredAt: '2026-08-10T10:00:00.000Z' }),
      tx({ id: 'old', type: 'expense', amount: 500, category: 'Casa', occurredAt: '2026-07-10T10:00:00.000Z' }),
      tx({ id: 'current', type: 'expense', amount: 250, category: 'Casa', occurredAt: '2026-08-10T10:00:00.000Z' }),
    ]

    expect(calculateBudgetProgress(budget, transactions, august).spent).toBe(250)
  })

  it('calculates category progress only from configured category budgets', () => {
    const categoryBudgets = [
      { id: 'food', year: 2026, month: 7, category: 'Alimentacao', limit: 500, createdAt: '', updatedAt: '' },
      { id: 'transport', year: 2026, month: 7, category: 'Transporte', limit: 300, createdAt: '', updatedAt: '' },
    ]
    const transactions = [
      tx({ id: 'food-1', type: 'expense', amount: 420, category: 'Alimentacao', occurredAt: '2026-08-10T10:00:00.000Z' }),
      tx({ id: 'transport-1', type: 'expense', amount: 350, category: 'Transporte', occurredAt: '2026-08-11T10:00:00.000Z' }),
    ]

    expect(calculateCategoryBudgetProgress(categoryBudgets, transactions, august)).toEqual([
      expect.objectContaining({ category: 'Alimentacao', spent: 420, remaining: 80, percentageUsed: 0.84, isOverLimit: false }),
      expect.objectContaining({ category: 'Transporte', spent: 350, remaining: -50, percentageUsed: 350 / 300, isOverLimit: true }),
    ])
  })

  it('reflects deleted transactions because spent is derived', async () => {
    await db.delete()
    await db.open()
    const item = tx({ id: 'delete-budget-expense', type: 'expense', amount: 250, category: 'Casa', occurredAt: '2026-08-10T10:00:00.000Z' })
    await db.transactions.add(item)

    expect(calculateBudgetProgress(budget, await db.transactions.toArray(), august).spent).toBe(250)

    await deleteTransaction(item.id)
    expect(calculateBudgetProgress(budget, await db.transactions.toArray(), august).spent).toBe(0)
  })

  it('reflects edited transactions in budget and FinancialHealth calculations', async () => {
    await db.delete()
    await db.open()
    const income = tx({ id: 'income-edit-health', type: 'income', amount: 2000, category: 'Renda', occurredAt: '2026-08-02T10:00:00.000Z' })
    const expense = tx({ id: 'expense-edit-health', type: 'expense', amount: 950, category: 'Casa', occurredAt: '2026-08-10T10:00:00.000Z' })
    await db.transactions.bulkAdd([income, expense])

    const beforeTransactions = await db.transactions.toArray()
    expect(calculateBudgetProgress(budget, beforeTransactions, august).percentageUsed).toBe(0.95)
    expect(calculateFinancialHealth(getMonthlySummary(beforeTransactions, new Date('2026-08-01T10:00:00.000Z')), calculateBudgetProgress(budget, beforeTransactions, august)).level).toBe('tight')

    await updateTransaction(expense.id, {
      type: 'expense',
      amount: 500,
      description: expense.description,
      category: expense.category,
      paymentMethod: expense.paymentMethod,
      occurredAt: expense.occurredAt,
    })

    const afterTransactions = await db.transactions.toArray()
    expect(calculateBudgetProgress(budget, afterTransactions, august).percentageUsed).toBe(0.5)
    expect(calculateFinancialHealth(getMonthlySummary(afterTransactions, new Date('2026-08-01T10:00:00.000Z')), calculateBudgetProgress(budget, afterTransactions, august)).level).toBe('healthy')
  })
})

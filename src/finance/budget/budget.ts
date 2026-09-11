import { db } from '../../db/database'
import type { CategoryBudget, MonthlyBudget, Transaction } from '../../db/types'
import { createSecureUuidV4 } from '../../utils/createSecureUuidV4'
import { monthFromDate, type SelectedMonth } from '../month'
import { getTransactionKind } from '../transactions'

export type BudgetMonth = SelectedMonth

export interface BudgetProgress {
  hasBudget: boolean
  limit: number
  spent: number
  remaining: number
  percentageUsed: number | null
  isOverLimit: boolean
  overLimitAmount: number
}

export interface CategoryBudgetProgress extends BudgetProgress {
  category: string
}

export interface BudgetCommittedExpense {
  amount: number
  category: string
}

export const BUDGET_THRESHOLDS = {
  excellentMaxUsage: 0.5,
  healthyMaxUsage: 0.75,
  attentionMaxUsage: 0.9,
  tightMaxUsage: 1,
  criticalMinUsage: 1.05,
} as const

function createId() {
  return createSecureUuidV4()
}

export { monthFromDate }

export function budgetMonthId({ year, month }: BudgetMonth) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

export function categoryBudgetId(month: BudgetMonth, category: string) {
  return `${budgetMonthId(month)}-${category.trim().toLowerCase()}`
}

export function validateBudgetMonth(month: BudgetMonth): string | null {
  if (!Number.isInteger(month.year) || month.year < 1970 || month.year > 9999) {
    return 'Ano do orcamento invalido.'
  }

  if (!Number.isInteger(month.month) || month.month < 0 || month.month > 11) {
    return 'Mes do orcamento invalido.'
  }

  return null
}

export function validateBudgetLimit(limit: number): string | null {
  if (!Number.isFinite(limit) || limit < 0) {
    return 'Informe um limite valido.'
  }

  return null
}

export function parseBudgetLimit(raw: string): number | null {
  const cleaned = raw.replace(/R\$/gi, '').replace(/\s/g, '')

  if (!cleaned) return null

  const brThousands = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/
  const plainNumber = /^\d+(?:[.,]\d{1,2})?$/

  if (!brThousands.test(cleaned) && !plainNumber.test(cleaned)) return null

  const normalized = brThousands.test(cleaned)
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(',', '.')
  const value = Number(normalized)

  return Number.isFinite(value) && value >= 0 ? value : null
}

function normalizeCategory(category: string) {
  return category.trim() || 'Outros'
}

function categoryKey(category: string) {
  return normalizeCategory(category)
    .replace(/Ã§/g, 'c')
    .replace(/Ã£/g, 'a')
    .replace(/Ã¡/g, 'a')
    .replace(/Ã©/g, 'e')
    .replace(/Ãª/g, 'e')
    .replace(/Ã­/g, 'i')
    .replace(/Ã³/g, 'o')
    .replace(/Ãº/g, 'u')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function isExpenseInMonth(transaction: Transaction, month: BudgetMonth) {
  if (transaction.type !== 'expense') return false
  if (getTransactionKind(transaction) !== 'standard') return false
  const date = new Date(transaction.occurredAt)
  return date.getFullYear() === month.year && date.getMonth() === month.month
}

export function calculateBudgetProgress(
  budget: MonthlyBudget | null | undefined,
  transactions: Transaction[],
  month: BudgetMonth,
  committedExpenses: BudgetCommittedExpense[] = [],
): BudgetProgress {
  const directSpent = transactions
    .filter((transaction) => isExpenseInMonth(transaction, month))
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const committedSpent = committedExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const spent = directSpent + committedSpent

  if (!budget) {
    return {
      hasBudget: false,
      limit: 0,
      spent,
      remaining: 0,
      percentageUsed: null,
      isOverLimit: false,
      overLimitAmount: 0,
    }
  }

  const limit = budget.totalLimit
  const percentageUsed = limit === 0 ? (spent > 0 ? Number.POSITIVE_INFINITY : 0) : spent / limit
  const remaining = limit - spent

  return {
    hasBudget: true,
    limit,
    spent,
    remaining,
    percentageUsed,
    isOverLimit: spent > limit,
    overLimitAmount: Math.max(0, spent - limit),
  }
}

export function calculateCategoryBudgetProgress(
  budgets: CategoryBudget[],
  transactions: Transaction[],
  month: BudgetMonth,
  committedExpenses: BudgetCommittedExpense[] = [],
): CategoryBudgetProgress[] {
  const expenses = transactions.filter((transaction) => isExpenseInMonth(transaction, month))

  return budgets.map((budget) => {
    const category = normalizeCategory(budget.category)
    const key = categoryKey(category)
    const spent = expenses
      .filter((transaction) => categoryKey(transaction.category) === key)
      .reduce((sum, transaction) => sum + transaction.amount, 0)
      + committedExpenses
        .filter((expense) => categoryKey(expense.category) === key)
        .reduce((sum, expense) => sum + expense.amount, 0)
    const percentageUsed = budget.limit === 0 ? (spent > 0 ? Number.POSITIVE_INFINITY : 0) : spent / budget.limit

    return {
      category,
      hasBudget: true,
      limit: budget.limit,
      spent,
      remaining: budget.limit - spent,
      percentageUsed,
      isOverLimit: spent > budget.limit,
      overLimitAmount: Math.max(0, spent - budget.limit),
    }
  })
}

export async function getMonthlyBudget(month: BudgetMonth) {
  const error = validateBudgetMonth(month)
  if (error) throw new Error(error)

  return db.monthlyBudgets.where('[year+month]').equals([month.year, month.month]).first()
}

export async function saveMonthlyBudget(month: BudgetMonth, totalLimit: number) {
  const monthError = validateBudgetMonth(month)
  if (monthError) throw new Error(monthError)

  const limitError = validateBudgetLimit(totalLimit)
  if (limitError) throw new Error(limitError)

  const existing = await getMonthlyBudget(month)
  const now = new Date().toISOString()
  const budget: MonthlyBudget = {
    id: existing?.id ?? createId(),
    year: month.year,
    month: month.month,
    totalLimit,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await db.monthlyBudgets.put(budget)
  return budget
}

export async function deleteMonthlyBudget(month: BudgetMonth) {
  const existing = await getMonthlyBudget(month)
  if (!existing) return
  await db.monthlyBudgets.delete(existing.id)
}

export async function deleteBudgetPlan(month: BudgetMonth) {
  await db.transaction('rw', db.monthlyBudgets, db.categoryBudgets, async () => {
    await deleteMonthlyBudget(month)
    const categoryBudgets = await getCategoryBudgets(month)
    await db.categoryBudgets.bulkDelete(categoryBudgets.map((budget) => budget.id))
  })
}

export async function getCategoryBudgets(month: BudgetMonth) {
  const error = validateBudgetMonth(month)
  if (error) throw new Error(error)

  return db.categoryBudgets.where('[year+month]').equals([month.year, month.month]).sortBy('category')
}

export async function saveCategoryBudget(month: BudgetMonth, category: string, limit: number) {
  const monthError = validateBudgetMonth(month)
  if (monthError) throw new Error(monthError)

  const limitError = validateBudgetLimit(limit)
  if (limitError) throw new Error(limitError)

  const normalizedCategory = normalizeCategory(category)
  const existing = await db.categoryBudgets
    .where('[year+month+category]')
    .equals([month.year, month.month, normalizedCategory])
    .first()
  const now = new Date().toISOString()
  const budget: CategoryBudget = {
    id: existing?.id ?? createId(),
    year: month.year,
    month: month.month,
    category: normalizedCategory,
    limit,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await db.categoryBudgets.put(budget)
  return budget
}

export async function deleteCategoryBudget(month: BudgetMonth, category: string) {
  const existing = await db.categoryBudgets
    .where('[year+month+category]')
    .equals([month.year, month.month, normalizeCategory(category)])
    .first()

  if (!existing) return
  await db.categoryBudgets.delete(existing.id)
}

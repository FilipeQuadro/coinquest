import type { PaymentMethod, Transaction, TransactionType } from '../../db/types'
import { isDateInMonth, type SelectedMonth } from '../month'

export type HistoryTransactionTypeFilter = 'all' | TransactionType

export interface HistoryFilters {
  query: string
  type: HistoryTransactionTypeFilter
  category: string | null
  paymentMethod: PaymentMethod | null
}

export const defaultHistoryFilters: HistoryFilters = {
  query: '',
  type: 'all',
  category: null,
  paymentMethod: null,
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

function isSameCategory(a: string, b: string) {
  return normalizeSearchText(a) === normalizeSearchText(b)
}

function compareTransactionsForHistory(a: Transaction, b: Transaction) {
  const dateDiff = new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  if (dateDiff !== 0) return dateDiff
  return a.id.localeCompare(b.id)
}

function isInSelectedMonth(transaction: Transaction, selectedMonth: SelectedMonth) {
  return isDateInMonth(transaction.occurredAt, selectedMonth)
}

export function filterTransactionsForHistory(
  transactions: Transaction[],
  selectedMonth: SelectedMonth,
  filters: HistoryFilters = defaultHistoryFilters,
) {
  const query = normalizeSearchText(filters.query)

  return transactions
    .filter((transaction) => isInSelectedMonth(transaction, selectedMonth))
    .filter((transaction) => filters.type === 'all' || transaction.type === filters.type)
    .filter((transaction) => !filters.category || isSameCategory(transaction.category, filters.category))
    .filter((transaction) => !filters.paymentMethod || transaction.paymentMethod === filters.paymentMethod)
    .filter((transaction) => {
      if (!query) return true

      return [
        transaction.description,
        transaction.category,
      ].some((value) => normalizeSearchText(value).includes(query))
    })
    .slice()
    .sort(compareTransactionsForHistory)
}

export function getAvailableHistoryCategories(transactions: Transaction[], selectedMonth: SelectedMonth) {
  const categoriesByKey = new Map<string, string>()

  transactions
    .filter((transaction) => isInSelectedMonth(transaction, selectedMonth))
    .forEach((transaction) => {
      const category = transaction.category.trim()
      if (!category) return

      const key = normalizeSearchText(category)
      if (!categoriesByKey.has(key)) categoriesByKey.set(key, category)
    })

  return [...categoriesByKey.values()].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
}

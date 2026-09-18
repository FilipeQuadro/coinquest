import type { PaymentMethod, Transaction } from '../../db/types'

export interface HistoryCategorySummary {
  category: string
  amount: number
  transactionCount: number
  incomeAmount: number
  expenseAmount: number
  incomeCount: number
  expenseCount: number
}

export interface HistoryPaymentMethodSummary {
  paymentMethod: PaymentMethod
  amount: number
  transactionCount: number
  incomeAmount: number
  expenseAmount: number
  incomeCount: number
  expenseCount: number
}

export interface HistorySummary {
  totalIncome: number
  totalExpense: number
  netAmount: number
  transactionCount: number
  incomeCount: number
  expenseCount: number
  topCategories: HistoryCategorySummary[]
  paymentMethodTotals: HistoryPaymentMethodSummary[]
}

function createCategorySummary(category: string): HistoryCategorySummary {
  return {
    category,
    amount: 0,
    transactionCount: 0,
    incomeAmount: 0,
    expenseAmount: 0,
    incomeCount: 0,
    expenseCount: 0,
  }
}

function createPaymentMethodSummary(paymentMethod: PaymentMethod): HistoryPaymentMethodSummary {
  return {
    paymentMethod,
    amount: 0,
    transactionCount: 0,
    incomeAmount: 0,
    expenseAmount: 0,
    incomeCount: 0,
    expenseCount: 0,
  }
}

function applyTransactionToSummary<
  TSummary extends {
    amount: number
    transactionCount: number
    incomeAmount: number
    expenseAmount: number
    incomeCount: number
    expenseCount: number
  },
>(summary: TSummary, transaction: Transaction) {
  const amount = Math.abs(transaction.amount)

  summary.amount += amount
  summary.transactionCount += 1

  if (transaction.type === 'income') {
    summary.incomeAmount += amount
    summary.incomeCount += 1
  } else {
    summary.expenseAmount += amount
    summary.expenseCount += 1
  }
}

function compareByAmountThenLabel<TItem extends { amount: number }>(
  getLabel: (item: TItem) => string,
) {
  return (a: TItem, b: TItem) => {
    const amountDiff = b.amount - a.amount
    if (amountDiff !== 0) return amountDiff
    return getLabel(a).localeCompare(getLabel(b), 'pt-BR', { sensitivity: 'base' })
  }
}

export function deriveHistorySummary(transactions: Transaction[]): HistorySummary {
  const categoriesByName = new Map<string, HistoryCategorySummary>()
  const paymentMethodsByName = new Map<PaymentMethod, HistoryPaymentMethodSummary>()

  const summary = transactions.reduce<HistorySummary>((current, transaction) => {
    const amount = Math.abs(transaction.amount)
    const category = transaction.category.trim() || 'Sem categoria'

    current.transactionCount += 1

    if (transaction.type === 'income') {
      current.totalIncome += amount
      current.incomeCount += 1
    } else {
      current.totalExpense += amount
      current.expenseCount += 1
    }

    const categorySummary = categoriesByName.get(category) ?? createCategorySummary(category)
    applyTransactionToSummary(categorySummary, transaction)
    categoriesByName.set(category, categorySummary)

    const paymentMethodSummary = paymentMethodsByName.get(transaction.paymentMethod) ?? createPaymentMethodSummary(transaction.paymentMethod)
    applyTransactionToSummary(paymentMethodSummary, transaction)
    paymentMethodsByName.set(transaction.paymentMethod, paymentMethodSummary)

    return current
  }, {
    totalIncome: 0,
    totalExpense: 0,
    netAmount: 0,
    transactionCount: 0,
    incomeCount: 0,
    expenseCount: 0,
    topCategories: [],
    paymentMethodTotals: [],
  })

  return {
    ...summary,
    netAmount: summary.totalIncome - summary.totalExpense,
    topCategories: [...categoriesByName.values()].sort(compareByAmountThenLabel((item) => item.category)),
    paymentMethodTotals: [...paymentMethodsByName.values()].sort(compareByAmountThenLabel((item) => item.paymentMethod)),
  }
}

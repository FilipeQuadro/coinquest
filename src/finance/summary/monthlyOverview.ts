import type {
  CardInvoicePayment,
  CardPurchase,
  CreditCard,
  MonthlyBudget,
  RecurringOccurrenceOverride,
  RecurringRule,
  Transaction,
} from '../../db/types'
import { calculateBudgetProgress, type BudgetProgress } from '../budget/budget'
import { buildCreditCardInvoices, getCommittedCardExpenses } from '../cards/cards'
import { isDateInMonth, type SelectedMonth } from '../month'
import { calculateMonthlyProjection } from '../projection/projection'

export interface MonthlyOverviewInput {
  selectedMonth: SelectedMonth
  transactions: Transaction[]
  recurringRules: RecurringRule[]
  recurringOverrides: RecurringOccurrenceOverride[]
  creditCards: CreditCard[]
  cardPurchases: CardPurchase[]
  cardInvoicePayments: CardInvoicePayment[]
  monthlyBudget?: MonthlyBudget | null
  now?: Date
}

export interface MonthlyOverview {
  month: SelectedMonth
  actual: {
    income: number
    expenses: number
    net: number
    transactionCount: number
  }
  budget: BudgetProgress
  outlook: {
    plannedRecurringIncome: number
    plannedRecurringExpense: number
    committedCardExpense: number
    projectedIncome: number
    projectedExpense: number
    projectedNet: number
  }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export function buildMonthlyOverview(input: MonthlyOverviewInput): MonthlyOverview {
  const now = input.now ?? new Date()
  const monthTransactions = input.transactions.filter((transaction) => isDateInMonth(transaction.occurredAt, input.selectedMonth))
  const income = roundMoney(monthTransactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0))
  const expenses = roundMoney(monthTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0))
  const cardInvoices = buildCreditCardInvoices(
    input.creditCards,
    input.cardPurchases,
    input.cardInvoicePayments,
    input.selectedMonth,
    input.transactions,
    now,
  )
  const committedCardExpenses = getCommittedCardExpenses(cardInvoices)
  const budget = calculateBudgetProgress(input.monthlyBudget, input.transactions, input.selectedMonth, committedCardExpenses)
  const projection = calculateMonthlyProjection(input.selectedMonth, {
    transactions: input.transactions,
    recurringRules: input.recurringRules,
    recurringOverrides: input.recurringOverrides,
    creditCards: input.creditCards,
    cardPurchases: input.cardPurchases,
    cardInvoicePayments: input.cardInvoicePayments,
    monthlyBudgets: input.monthlyBudget ? [input.monthlyBudget] : [],
  }, 0, now)

  return {
    month: { ...input.selectedMonth },
    actual: {
      income,
      expenses,
      net: roundMoney(income - expenses),
      transactionCount: monthTransactions.length,
    },
    budget,
    outlook: {
      plannedRecurringIncome: projection.plannedRecurringIncome,
      plannedRecurringExpense: projection.plannedRecurringExpense,
      committedCardExpense: projection.committedCardExpense,
      projectedIncome: projection.projectedIncome,
      projectedExpense: projection.projectedExpense,
      projectedNet: projection.projectedNet,
    },
  }
}

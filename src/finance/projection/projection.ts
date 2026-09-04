import { db } from '../../db/database'
import type {
  CardInvoicePayment,
  CardPurchase,
  CreditCard,
  MonthlyBudget,
  RecurringOccurrenceOverride,
  RecurringRule,
  Transaction,
} from '../../db/types'
import { buildCreditCardInvoices, getUnpaidInvoiceCommitment } from '../cards/cards'
import { addMonths, isDateInMonth, type SelectedMonth } from '../month'
import { buildRecurringOccurrences } from '../recurring/recurring'

export interface ProjectionInput {
  transactions: Transaction[]
  recurringRules: RecurringRule[]
  recurringOverrides: RecurringOccurrenceOverride[]
  creditCards: CreditCard[]
  cardPurchases: CardPurchase[]
  cardInvoicePayments: CardInvoicePayment[]
  monthlyBudgets?: MonthlyBudget[]
}

export interface MonthlyProjectionBreakdown {
  actual: {
    income: number
    expense: number
    transactionCount: number
  }
  recurring: {
    income: number
    expense: number
    pendingCount: number
    overdueCount: number
    skippedCount: number
    realizedCount: number
  }
  cards: {
    committedExpense: number
    invoiceCount: number
  }
}

export interface MonthlyProjection {
  year: number
  month: number
  actualIncome: number
  actualExpense: number
  plannedRecurringIncome: number
  plannedRecurringExpense: number
  committedCardExpense: number
  projectedIncome: number
  projectedExpense: number
  projectedNet: number
  cumulativeProjectedNet: number
  budgetLimit?: number
  breakdown: MonthlyProjectionBreakdown
}

export interface MultiMonthProjection {
  startMonth: SelectedMonth
  count: number
  months: MonthlyProjection[]
  totalProjectedIncome: number
  totalProjectedExpense: number
  totalProjectedNet: number
}

export const PROJECTION_LIMITS = {
  minMonths: 1,
  maxMonths: 120,
} as const

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function assertValidProjectionCount(count: number) {
  if (!Number.isInteger(count) || count < PROJECTION_LIMITS.minMonths || count > PROJECTION_LIMITS.maxMonths) {
    throw new Error(`Horizonte de projecao deve estar entre ${PROJECTION_LIMITS.minMonths} e ${PROJECTION_LIMITS.maxMonths} meses.`)
  }
}

function budgetForMonth(budgets: MonthlyBudget[] | undefined, month: SelectedMonth) {
  return budgets?.find((budget) => budget.year === month.year && budget.month === month.month)
}

export function calculateMonthlyProjection(
  month: SelectedMonth,
  input: ProjectionInput,
  cumulativeBefore = 0,
  now = new Date(),
): MonthlyProjection {
  const actualTransactions = input.transactions.filter((transaction) => isDateInMonth(transaction.occurredAt, month))
  const actualIncome = roundMoney(actualTransactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0))
  const actualExpense = roundMoney(actualTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0))
  const occurrences = buildRecurringOccurrences(
    input.recurringRules,
    input.recurringOverrides.filter((override) => override.year === month.year && override.month === month.month),
    month,
    input.transactions,
    now,
  )
  const plannedRecurring = occurrences.filter((occurrence) => occurrence.status === 'pending' || occurrence.status === 'overdue')
  const plannedRecurringIncome = roundMoney(plannedRecurring
    .filter((occurrence) => occurrence.type === 'income')
    .reduce((sum, occurrence) => sum + occurrence.amount, 0))
  const plannedRecurringExpense = roundMoney(plannedRecurring
    .filter((occurrence) => occurrence.type === 'expense')
    .reduce((sum, occurrence) => sum + occurrence.amount, 0))
  const cardInvoices = buildCreditCardInvoices(
    input.creditCards,
    input.cardPurchases,
    input.cardInvoicePayments,
    month,
    input.transactions,
    now,
  )
  const committedCardExpense = roundMoney(getUnpaidInvoiceCommitment(cardInvoices))
  const projectedIncome = roundMoney(actualIncome + plannedRecurringIncome)
  const projectedExpense = roundMoney(actualExpense + plannedRecurringExpense + committedCardExpense)
  const projectedNet = roundMoney(projectedIncome - projectedExpense)
  const cumulativeProjectedNet = roundMoney(cumulativeBefore + projectedNet)
  const budget = budgetForMonth(input.monthlyBudgets, month)

  return {
    year: month.year,
    month: month.month,
    actualIncome,
    actualExpense,
    plannedRecurringIncome,
    plannedRecurringExpense,
    committedCardExpense,
    projectedIncome,
    projectedExpense,
    projectedNet,
    cumulativeProjectedNet,
    budgetLimit: budget?.totalLimit,
    breakdown: {
      actual: {
        income: actualIncome,
        expense: actualExpense,
        transactionCount: actualTransactions.length,
      },
      recurring: {
        income: plannedRecurringIncome,
        expense: plannedRecurringExpense,
        pendingCount: occurrences.filter((occurrence) => occurrence.status === 'pending').length,
        overdueCount: occurrences.filter((occurrence) => occurrence.status === 'overdue').length,
        skippedCount: occurrences.filter((occurrence) => occurrence.status === 'skipped').length,
        realizedCount: occurrences.filter((occurrence) => occurrence.status === 'realized').length,
      },
      cards: {
        committedExpense: committedCardExpense,
        invoiceCount: cardInvoices.length,
      },
    },
  }
}

export function projectMonths(
  startMonth: SelectedMonth,
  count: number,
  input: ProjectionInput,
  now = new Date(),
): MultiMonthProjection {
  assertValidProjectionCount(count)

  let cumulative = 0
  const months = Array.from({ length: count }, (_, index) => {
    const month = addMonths(startMonth, index)
    const projection = calculateMonthlyProjection(month, input, cumulative, now)
    cumulative = projection.cumulativeProjectedNet
    return projection
  })

  return {
    startMonth,
    count,
    months,
    totalProjectedIncome: roundMoney(months.reduce((sum, month) => sum + month.projectedIncome, 0)),
    totalProjectedExpense: roundMoney(months.reduce((sum, month) => sum + month.projectedExpense, 0)),
    totalProjectedNet: roundMoney(months.reduce((sum, month) => sum + month.projectedNet, 0)),
  }
}

export async function projectMonthsFromDb(startMonth: SelectedMonth, count: number, now = new Date()) {
  assertValidProjectionCount(count)

  const [
    transactions,
    recurringRules,
    recurringOverrides,
    creditCards,
    cardPurchases,
    cardInvoicePayments,
    monthlyBudgets,
  ] = await Promise.all([
    db.transactions.toArray(),
    db.recurringRules.toArray(),
    db.recurringOccurrenceOverrides.toArray(),
    db.creditCards.toArray(),
    db.cardPurchases.toArray(),
    db.cardInvoicePayments.toArray(),
    db.monthlyBudgets.toArray(),
  ])

  return projectMonths(startMonth, count, {
    transactions,
    recurringRules,
    recurringOverrides,
    creditCards,
    cardPurchases,
    cardInvoicePayments,
    monthlyBudgets,
  }, now)
}

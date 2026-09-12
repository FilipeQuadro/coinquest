import type {
  CardInvoicePayment,
  CardPurchase,
  CreditCard,
  Goal,
  GoalContribution,
  GoalPriority,
  RecurringOccurrenceStatus,
  RecurringOccurrenceOverride,
  RecurringRule,
  Transaction,
} from '../../db/types'
import { buildCreditCardInvoices, type CreditCardInvoice } from '../cards/cards'
import { calculateGoalProgress } from '../goals/goals'
import { type SelectedMonth } from '../month'
import { buildRecurringOccurrences } from '../recurring/recurring'

export type MonthlyCommitmentKind = 'recurring' | 'card-invoice'
export type MonthlyCommitmentStatus = 'pending' | 'overdue'

export interface MonthlyCommitment {
  id: string
  kind: MonthlyCommitmentKind
  label: string
  amount: number
  dueDate: string
  status: MonthlyCommitmentStatus
}

export interface FeaturedGoal {
  id: string
  name: string
  targetAmount: number
  allocatedAmount: number
  remainingAmount: number
  percentageDisplay: number
  priority?: GoalPriority
}

export interface MonthlyHighlightsInput {
  selectedMonth: SelectedMonth
  transactions: Transaction[]
  recurringRules: RecurringRule[]
  recurringOverrides: RecurringOccurrenceOverride[]
  creditCards: CreditCard[]
  cardPurchases: CardPurchase[]
  cardInvoicePayments: CardInvoicePayment[]
  goals: Goal[]
  goalContributions: GoalContribution[]
  now?: Date
}

export interface MonthlyHighlights {
  commitments: MonthlyCommitment[]
  featuredGoal: FeaturedGoal | null
}

const priorityOrder: Record<GoalPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

function normalizeRecurringStatus(status: RecurringOccurrenceStatus): MonthlyCommitmentStatus | null {
  if (status === 'pending' || status === 'overdue') return status
  return null
}

function normalizeInvoiceStatus(status: CreditCardInvoice['status']): MonthlyCommitmentStatus | null {
  if (status === 'paid') return null
  if (status === 'overdue') return 'overdue'
  return 'pending'
}

function compareCommitments(a: MonthlyCommitment, b: MonthlyCommitment) {
  const dateDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  if (dateDiff !== 0) return dateDiff
  return a.id.localeCompare(b.id)
}

function sortFeaturedGoals(goals: Goal[]) {
  return [...goals].sort((a, b) => {
    const priority = (priorityOrder[a.priority ?? 'low'] ?? 2) - (priorityOrder[b.priority ?? 'low'] ?? 2)
    if (priority !== 0) return priority
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export function buildMonthlyHighlights(input: MonthlyHighlightsInput): MonthlyHighlights {
  const now = input.now ?? new Date()
  const cardNameById = new Map(input.creditCards.map((card) => [card.id, card.name]))

  const recurringCommitments = buildRecurringOccurrences(
    input.recurringRules,
    input.recurringOverrides,
    input.selectedMonth,
    input.transactions,
    now,
  )
    .filter((occurrence) => occurrence.type === 'expense')
    .flatMap((occurrence): MonthlyCommitment[] => {
      const status = normalizeRecurringStatus(occurrence.status)
      if (!status) return []

      return [{
        id: `recurring:${occurrence.ruleId}:${occurrence.year}:${occurrence.month}`,
        kind: 'recurring',
        label: occurrence.description,
        amount: occurrence.amount,
        dueDate: occurrence.plannedDate,
        status,
      }]
    })

  const invoiceCommitments = buildCreditCardInvoices(
    input.creditCards,
    input.cardPurchases,
    input.cardInvoicePayments,
    input.selectedMonth,
    input.transactions,
    now,
  ).flatMap((invoice): MonthlyCommitment[] => {
    const status = normalizeInvoiceStatus(invoice.status)
    if (!status) return []

    return [{
      id: `card-invoice:${invoice.cardId}:${invoice.year}:${invoice.month}`,
      kind: 'card-invoice',
      label: `Fatura ${cardNameById.get(invoice.cardId) ?? 'cartao'}`,
      amount: invoice.total,
      dueDate: invoice.dueDate,
      status,
    }]
  })

  const commitments = [...recurringCommitments, ...invoiceCommitments]
    .sort(compareCommitments)
    .slice(0, 3)

  const featuredGoal = sortFeaturedGoals(input.goals)
    .filter((goal) => goal.status === 'active')
    .map((goal) => ({
      goal,
      progress: calculateGoalProgress(goal, input.goalContributions, now),
    }))
    .find(({ progress }) => !progress.completed)

  return {
    commitments,
    featuredGoal: featuredGoal
      ? {
          id: featuredGoal.goal.id,
          name: featuredGoal.goal.name,
          targetAmount: featuredGoal.progress.targetAmount,
          allocatedAmount: featuredGoal.progress.allocatedAmount,
          remainingAmount: featuredGoal.progress.remainingAmount,
          percentageDisplay: featuredGoal.progress.percentageDisplay,
          priority: featuredGoal.goal.priority,
        }
      : null,
  }
}

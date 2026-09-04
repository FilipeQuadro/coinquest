import type { Transaction } from '../db/types'
import type { BudgetProgress } from '../finance/budget/budget'
import type { FinancialHealth } from '../finance/health/financialHealth'
import type { MonthlyOutlook } from '../finance/recurring/recurring'
import type { MonthlySummary } from '../finance/transactions'

export const financeBus = new EventTarget()

export function emitTransaction(transaction: Transaction) {
  financeBus.dispatchEvent(new CustomEvent<Transaction>('transaction', { detail: transaction }))
}

export function emitTransactionUpdated(transaction: Transaction) {
  financeBus.dispatchEvent(new CustomEvent<Transaction>('transaction-updated', { detail: transaction }))
}

export interface GoalCompletedPresentation {
  goalId: string
  name: string
}

export function emitGoalCompleted(goal: GoalCompletedPresentation) {
  financeBus.dispatchEvent(new CustomEvent<GoalCompletedPresentation>('goal-completed', { detail: goal }))
}

export interface FinancialHealthUpdate {
  health: FinancialHealth
  summary: MonthlySummary
  budgetProgress?: BudgetProgress
  monthlyOutlook?: MonthlyOutlook
}

export function emitFinancialHealth(update: FinancialHealthUpdate) {
  financeBus.dispatchEvent(new CustomEvent<FinancialHealthUpdate>('financial-health', { detail: update }))
}

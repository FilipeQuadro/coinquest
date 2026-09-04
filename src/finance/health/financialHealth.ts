import type { MonthlySummary } from '../transactions'
import type { BudgetProgress } from '../budget/budget'
import { BUDGET_THRESHOLDS } from '../budget/budget'

export type FinancialHealthLevel = 'unknown' | 'excellent' | 'healthy' | 'attention' | 'tight' | 'critical'

export interface FinancialHealth {
  level: FinancialHealthLevel
  expenseRatio: number | null
  messageKey:
    | 'no_data'
    | 'income_only'
    | 'no_income_with_expenses'
    | 'excellent_ratio'
    | 'healthy_ratio'
    | 'attention_ratio'
    | 'tight_ratio'
    | 'critical_ratio'
    | 'invalid_summary'
    | 'budget_healthy'
    | 'budget_attention'
    | 'budget_tight'
    | 'budget_critical'
}

export const FINANCIAL_HEALTH_THRESHOLDS = {
  excellentMaxExpenseRatio: 0.5,
  healthyMaxExpenseRatio: 0.75,
  attentionMaxExpenseRatio: 0.9,
  tightMaxExpenseRatio: 1,
} as const

const HEALTH_WEIGHT: Record<FinancialHealthLevel, number> = {
  unknown: 0,
  excellent: 1,
  healthy: 2,
  attention: 3,
  tight: 4,
  critical: 5,
}

function isInvalidSummary(summary: MonthlySummary) {
  return [summary.income, summary.expenses, summary.balance, summary.count].some((value) => !Number.isFinite(value)) ||
    summary.income < 0 ||
    summary.expenses < 0 ||
    summary.count < 0
}

function worstHealth(...levels: FinancialHealthLevel[]) {
  return levels.reduce((worst, level) => HEALTH_WEIGHT[level] > HEALTH_WEIGHT[worst] ? level : worst)
}

function budgetHealth(progress: BudgetProgress): Pick<FinancialHealth, 'level' | 'messageKey'> | null {
  if (!progress.hasBudget || progress.percentageUsed === null) return null

  const usage = progress.percentageUsed
  if (!Number.isFinite(usage)) {
    return { level: progress.spent > 0 ? 'critical' : 'healthy', messageKey: progress.spent > 0 ? 'budget_critical' : 'budget_healthy' }
  }

  if (usage > BUDGET_THRESHOLDS.criticalMinUsage) {
    return { level: 'critical', messageKey: 'budget_critical' }
  }

  if (usage > BUDGET_THRESHOLDS.tightMaxUsage || usage > BUDGET_THRESHOLDS.attentionMaxUsage) {
    return { level: 'tight', messageKey: 'budget_tight' }
  }

  if (usage > BUDGET_THRESHOLDS.healthyMaxUsage) {
    return { level: 'attention', messageKey: 'budget_attention' }
  }

  return { level: 'healthy', messageKey: 'budget_healthy' }
}

export function calculateFinancialHealth(summary: MonthlySummary, budgetProgress?: BudgetProgress | null): FinancialHealth {
  if (isInvalidSummary(summary)) {
    return { level: 'unknown', expenseRatio: null, messageKey: 'invalid_summary' }
  }

  const budgetSignal = budgetProgress ? budgetHealth(budgetProgress) : null

  if (summary.count === 0) {
    return { level: 'unknown', expenseRatio: null, messageKey: 'no_data' }
  }

  if (summary.income === 0) {
    return summary.expenses > 0
      ? { level: 'critical', expenseRatio: null, messageKey: 'no_income_with_expenses' }
      : { level: 'unknown', expenseRatio: null, messageKey: 'no_data' }
  }

  const expenseRatio = summary.expenses / summary.income

  if (summary.expenses === 0) {
    return { level: 'healthy', expenseRatio, messageKey: budgetSignal?.messageKey ?? 'income_only' }
  }

  if (expenseRatio <= FINANCIAL_HEALTH_THRESHOLDS.excellentMaxExpenseRatio) {
    const level = budgetSignal ? worstHealth('excellent', budgetSignal.level) : 'excellent'
    return { level, expenseRatio, messageKey: budgetSignal && level === budgetSignal.level ? budgetSignal.messageKey : 'excellent_ratio' }
  }

  if (expenseRatio <= FINANCIAL_HEALTH_THRESHOLDS.healthyMaxExpenseRatio) {
    const level = budgetSignal ? worstHealth('healthy', budgetSignal.level) : 'healthy'
    return { level, expenseRatio, messageKey: budgetSignal && level === budgetSignal.level ? budgetSignal.messageKey : 'healthy_ratio' }
  }

  if (expenseRatio <= FINANCIAL_HEALTH_THRESHOLDS.attentionMaxExpenseRatio) {
    const level = budgetSignal ? worstHealth('attention', budgetSignal.level) : 'attention'
    return { level, expenseRatio, messageKey: budgetSignal && level === budgetSignal.level ? budgetSignal.messageKey : 'attention_ratio' }
  }

  if (expenseRatio <= FINANCIAL_HEALTH_THRESHOLDS.tightMaxExpenseRatio) {
    const level = budgetSignal ? worstHealth('tight', budgetSignal.level) : 'tight'
    return { level, expenseRatio, messageKey: budgetSignal && level === budgetSignal.level ? budgetSignal.messageKey : 'tight_ratio' }
  }

  return { level: 'critical', expenseRatio, messageKey: 'critical_ratio' }
}

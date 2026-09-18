import type {
  AppSetting,
  CardInvoicePayment,
  CardPurchase,
  CategoryBudget,
  CreditCard,
  Goal,
  GoalContribution,
  MonthlyBudget,
  RecurringOccurrenceOverride,
  RecurringRule,
  SyncConflict,
  Transaction,
} from '../db/types'

export type LocalDataHealthStatus = 'empty' | 'ok' | 'attention'
export type LocalDataHealthWarningKind = 'orphan-reference' | 'invalid-value' | 'invalid-date' | 'sync-conflict'
export type LocalDataHealthWarningSeverity = 'info' | 'attention'

export interface LocalDataHealthInput {
  transactions: readonly Transaction[]
  goals: readonly Goal[]
  goalContributions: readonly GoalContribution[]
  settings: readonly AppSetting[]
  monthlyBudgets: readonly MonthlyBudget[]
  categoryBudgets: readonly CategoryBudget[]
  recurringRules: readonly RecurringRule[]
  recurringOccurrenceOverrides: readonly RecurringOccurrenceOverride[]
  creditCards: readonly CreditCard[]
  cardPurchases: readonly CardPurchase[]
  cardInvoicePayments: readonly CardInvoicePayment[]
  syncConflicts?: readonly SyncConflict[]
}

export interface LocalDataHealthCounts {
  transactions: number
  goals: number
  goalContributions: number
  settings: number
  monthlyBudgets: number
  categoryBudgets: number
  recurringRules: number
  recurringOccurrenceOverrides: number
  creditCards: number
  cardPurchases: number
  cardInvoicePayments: number
  syncConflicts: number
}

export interface LocalDataHealthWarning {
  id: string
  kind: LocalDataHealthWarningKind
  severity: LocalDataHealthWarningSeverity
  title: string
  message: string
  count: number
  table?: keyof LocalDataHealthCounts
}

export interface LocalDataHealthReport {
  status: LocalDataHealthStatus
  hasAnyFinancialData: boolean
  counts: LocalDataHealthCounts
  warnings: LocalDataHealthWarning[]
  summaryMessage: string
}

const financialCountKeys = [
  'transactions',
  'goals',
  'goalContributions',
  'monthlyBudgets',
  'categoryBudgets',
  'recurringRules',
  'recurringOccurrenceOverrides',
  'creditCards',
  'cardPurchases',
  'cardInvoicePayments',
] as const satisfies readonly (keyof LocalDataHealthCounts)[]

const severityOrder: Record<LocalDataHealthWarningSeverity, number> = {
  attention: 0,
  info: 1,
}

function countInput(input: LocalDataHealthInput): LocalDataHealthCounts {
  return {
    transactions: input.transactions.length,
    goals: input.goals.length,
    goalContributions: input.goalContributions.length,
    settings: input.settings.length,
    monthlyBudgets: input.monthlyBudgets.length,
    categoryBudgets: input.categoryBudgets.length,
    recurringRules: input.recurringRules.length,
    recurringOccurrenceOverrides: input.recurringOccurrenceOverrides.length,
    creditCards: input.creditCards.length,
    cardPurchases: input.cardPurchases.length,
    cardInvoicePayments: input.cardInvoicePayments.length,
    syncConflicts: input.syncConflicts?.length ?? 0,
  }
}

function hasFinancialData(counts: LocalDataHealthCounts) {
  return financialCountKeys.some((key) => counts[key] > 0)
}

function isValidDate(value: string | undefined) {
  if (!value) return false
  return Number.isFinite(new Date(value).getTime())
}

function isNonNegativeFinite(value: number) {
  return Number.isFinite(value) && value >= 0
}

function isPositiveFinite(value: number) {
  return Number.isFinite(value) && value > 0
}

function addWarning(warnings: LocalDataHealthWarning[], warning: LocalDataHealthWarning) {
  if (warning.count <= 0) return
  warnings.push(warning)
}

function countInvalidDates<T extends object>(records: readonly T[], fields: readonly (keyof T)[]) {
  return records.filter((record) => fields.some((field) => {
    const value = record[field]
    return value !== undefined && (typeof value !== 'string' || !isValidDate(value))
  })).length
}

function buildReferenceWarnings(input: LocalDataHealthInput): LocalDataHealthWarning[] {
  const goalIds = new Set(input.goals.map((goal) => goal.id))
  const ruleIds = new Set(input.recurringRules.map((rule) => rule.id))
  const cardIds = new Set(input.creditCards.map((card) => card.id))
  const transactionIds = new Set(input.transactions.map((transaction) => transaction.id))
  const warnings: LocalDataHealthWarning[] = []

  addWarning(warnings, {
    id: 'orphan-reference:goal-contributions:goal',
    kind: 'orphan-reference',
    severity: 'attention',
    title: 'Contribuicoes de meta sem meta local',
    message: 'Algumas contribuicoes apontam para uma meta local que nao foi encontrada.',
    count: input.goalContributions.filter((contribution) => !goalIds.has(contribution.goalId)).length,
    table: 'goalContributions',
  })

  addWarning(warnings, {
    id: 'orphan-reference:recurring-overrides:rule',
    kind: 'orphan-reference',
    severity: 'attention',
    title: 'Ajustes de recorrencia sem regra local',
    message: 'Alguns ajustes apontam para uma recorrencia local que nao foi encontrada.',
    count: input.recurringOccurrenceOverrides.filter((override) => !ruleIds.has(override.ruleId)).length,
    table: 'recurringOccurrenceOverrides',
  })

  addWarning(warnings, {
    id: 'orphan-reference:recurring-overrides:transaction',
    kind: 'orphan-reference',
    severity: 'attention',
    title: 'Recorrencias realizadas sem transacao local',
    message: 'Algumas recorrencias realizadas apontam para uma transacao local que nao foi encontrada.',
    count: input.recurringOccurrenceOverrides.filter((override) => (
      override.status === 'realized' &&
      Boolean(override.linkedTransactionId) &&
      !transactionIds.has(override.linkedTransactionId ?? '')
    )).length,
    table: 'recurringOccurrenceOverrides',
  })

  addWarning(warnings, {
    id: 'orphan-reference:card-purchases:card',
    kind: 'orphan-reference',
    severity: 'attention',
    title: 'Compras de cartao sem cartao local',
    message: 'Algumas compras apontam para um cartao local que nao foi encontrado.',
    count: input.cardPurchases.filter((purchase) => !cardIds.has(purchase.cardId)).length,
    table: 'cardPurchases',
  })

  addWarning(warnings, {
    id: 'orphan-reference:card-invoice-payments:card',
    kind: 'orphan-reference',
    severity: 'attention',
    title: 'Pagamentos de fatura sem cartao local',
    message: 'Alguns pagamentos de fatura apontam para um cartao local que nao foi encontrado.',
    count: input.cardInvoicePayments.filter((payment) => !cardIds.has(payment.cardId)).length,
    table: 'cardInvoicePayments',
  })

  addWarning(warnings, {
    id: 'orphan-reference:card-invoice-payments:transaction',
    kind: 'orphan-reference',
    severity: 'attention',
    title: 'Pagamentos de fatura sem transacao local',
    message: 'Alguns pagamentos de fatura apontam para uma transacao local que nao foi encontrada.',
    count: input.cardInvoicePayments.filter((payment) => !transactionIds.has(payment.linkedTransactionId)).length,
    table: 'cardInvoicePayments',
  })

  return warnings
}

function buildValueWarnings(input: LocalDataHealthInput): LocalDataHealthWarning[] {
  const warnings: LocalDataHealthWarning[] = []

  addWarning(warnings, {
    id: 'invalid-value:transactions:amount',
    kind: 'invalid-value',
    severity: 'attention',
    title: 'Transacoes com valor invalido',
    message: 'Algumas transacoes locais possuem valor fora do formato esperado.',
    count: input.transactions.filter((transaction) => !isPositiveFinite(transaction.amount)).length,
    table: 'transactions',
  })

  addWarning(warnings, {
    id: 'invalid-value:goals:target-amount',
    kind: 'invalid-value',
    severity: 'attention',
    title: 'Metas com valor objetivo invalido',
    message: 'Algumas metas locais possuem valor objetivo fora do formato esperado.',
    count: input.goals.filter((goal) => !isPositiveFinite(goal.targetAmount)).length,
    table: 'goals',
  })

  addWarning(warnings, {
    id: 'invalid-value:goal-contributions:amount',
    kind: 'invalid-value',
    severity: 'attention',
    title: 'Contribuicoes de meta com valor invalido',
    message: 'Algumas contribuicoes locais possuem valor fora do formato esperado.',
    count: input.goalContributions.filter((contribution) => !Number.isFinite(contribution.amount)).length,
    table: 'goalContributions',
  })

  addWarning(warnings, {
    id: 'invalid-value:monthly-budgets:total-limit',
    kind: 'invalid-value',
    severity: 'attention',
    title: 'Orcamentos mensais com limite invalido',
    message: 'Alguns orcamentos locais possuem limite fora do formato esperado.',
    count: input.monthlyBudgets.filter((budget) => !isNonNegativeFinite(budget.totalLimit)).length,
    table: 'monthlyBudgets',
  })

  addWarning(warnings, {
    id: 'invalid-value:category-budgets:limit',
    kind: 'invalid-value',
    severity: 'attention',
    title: 'Orcamentos por categoria com limite invalido',
    message: 'Alguns limites por categoria estao fora do formato esperado.',
    count: input.categoryBudgets.filter((budget) => !isNonNegativeFinite(budget.limit)).length,
    table: 'categoryBudgets',
  })

  addWarning(warnings, {
    id: 'invalid-value:recurring-rules:amount',
    kind: 'invalid-value',
    severity: 'attention',
    title: 'Recorrencias com valor invalido',
    message: 'Algumas recorrencias locais possuem valor fora do formato esperado.',
    count: input.recurringRules.filter((rule) => !isPositiveFinite(rule.amount)).length,
    table: 'recurringRules',
  })

  addWarning(warnings, {
    id: 'invalid-value:credit-cards:credit-limit',
    kind: 'invalid-value',
    severity: 'attention',
    title: 'Cartoes com limite invalido',
    message: 'Alguns cartoes locais possuem limite fora do formato esperado.',
    count: input.creditCards.filter((card) => card.creditLimit !== undefined && !isNonNegativeFinite(card.creditLimit)).length,
    table: 'creditCards',
  })

  addWarning(warnings, {
    id: 'invalid-value:card-purchases:total-amount',
    kind: 'invalid-value',
    severity: 'attention',
    title: 'Compras de cartao com valor invalido',
    message: 'Algumas compras de cartao possuem valor fora do formato esperado.',
    count: input.cardPurchases.filter((purchase) => !isPositiveFinite(purchase.totalAmount)).length,
    table: 'cardPurchases',
  })

  return warnings
}

function buildDateWarnings(input: LocalDataHealthInput): LocalDataHealthWarning[] {
  const warnings: LocalDataHealthWarning[] = []

  addWarning(warnings, {
    id: 'invalid-date:transactions',
    kind: 'invalid-date',
    severity: 'attention',
    title: 'Transacoes com data invalida',
    message: 'Algumas transacoes locais possuem data fora do formato esperado.',
    count: countInvalidDates(input.transactions, ['occurredAt', 'createdAt']),
    table: 'transactions',
  })

  addWarning(warnings, {
    id: 'invalid-date:goals',
    kind: 'invalid-date',
    severity: 'attention',
    title: 'Metas com data invalida',
    message: 'Algumas metas locais possuem data fora do formato esperado.',
    count: countInvalidDates(input.goals, ['createdAt', 'updatedAt', 'targetDate']),
    table: 'goals',
  })

  addWarning(warnings, {
    id: 'invalid-date:goal-contributions',
    kind: 'invalid-date',
    severity: 'attention',
    title: 'Contribuicoes de meta com data invalida',
    message: 'Algumas contribuicoes locais possuem data fora do formato esperado.',
    count: countInvalidDates(input.goalContributions, ['date', 'createdAt']),
    table: 'goalContributions',
  })

  addWarning(warnings, {
    id: 'invalid-date:monthly-budgets',
    kind: 'invalid-date',
    severity: 'attention',
    title: 'Orcamentos mensais com data invalida',
    message: 'Alguns orcamentos locais possuem data fora do formato esperado.',
    count: countInvalidDates(input.monthlyBudgets, ['createdAt', 'updatedAt']),
    table: 'monthlyBudgets',
  })

  addWarning(warnings, {
    id: 'invalid-date:category-budgets',
    kind: 'invalid-date',
    severity: 'attention',
    title: 'Orcamentos por categoria com data invalida',
    message: 'Alguns orcamentos por categoria possuem data fora do formato esperado.',
    count: countInvalidDates(input.categoryBudgets, ['createdAt', 'updatedAt']),
    table: 'categoryBudgets',
  })

  addWarning(warnings, {
    id: 'invalid-date:recurring-rules',
    kind: 'invalid-date',
    severity: 'attention',
    title: 'Recorrencias com data invalida',
    message: 'Algumas recorrencias locais possuem data fora do formato esperado.',
    count: countInvalidDates(input.recurringRules, ['createdAt', 'updatedAt']),
    table: 'recurringRules',
  })

  addWarning(warnings, {
    id: 'invalid-date:recurring-overrides',
    kind: 'invalid-date',
    severity: 'attention',
    title: 'Ajustes de recorrencia com data invalida',
    message: 'Alguns ajustes de recorrencia possuem data fora do formato esperado.',
    count: countInvalidDates(input.recurringOccurrenceOverrides, ['createdAt', 'updatedAt']),
    table: 'recurringOccurrenceOverrides',
  })

  addWarning(warnings, {
    id: 'invalid-date:credit-cards',
    kind: 'invalid-date',
    severity: 'attention',
    title: 'Cartoes com data invalida',
    message: 'Alguns cartoes locais possuem data fora do formato esperado.',
    count: countInvalidDates(input.creditCards, ['createdAt', 'updatedAt']),
    table: 'creditCards',
  })

  addWarning(warnings, {
    id: 'invalid-date:card-purchases',
    kind: 'invalid-date',
    severity: 'attention',
    title: 'Compras de cartao com data invalida',
    message: 'Algumas compras de cartao possuem data fora do formato esperado.',
    count: countInvalidDates(input.cardPurchases, ['purchaseDate', 'createdAt', 'updatedAt']),
    table: 'cardPurchases',
  })

  addWarning(warnings, {
    id: 'invalid-date:card-invoice-payments',
    kind: 'invalid-date',
    severity: 'attention',
    title: 'Pagamentos de fatura com data invalida',
    message: 'Alguns pagamentos de fatura possuem data fora do formato esperado.',
    count: countInvalidDates(input.cardInvoicePayments, ['paymentDate', 'paidAt', 'createdAt', 'updatedAt']),
    table: 'cardInvoicePayments',
  })

  return warnings
}

function buildSyncConflictWarning(input: LocalDataHealthInput): LocalDataHealthWarning[] {
  const pendingCount = (input.syncConflicts ?? []).filter((conflict) => conflict.status === 'pending').length
  if (pendingCount === 0) return []

  return [{
    id: 'sync-conflict:pending',
    kind: 'sync-conflict',
    severity: 'info',
    title: 'Conflitos de sincronizacao pendentes',
    message: 'Ha conflitos de sincronizacao pendentes para revisar. O uso local continua disponivel.',
    count: pendingCount,
    table: 'syncConflicts',
  }]
}

function sortWarnings(warnings: LocalDataHealthWarning[]) {
  return [...warnings].sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity]
    if (severityDiff !== 0) return severityDiff
    return a.id.localeCompare(b.id)
  })
}

function reportStatus(hasAnyFinancialData: boolean, warnings: readonly LocalDataHealthWarning[]): LocalDataHealthStatus {
  if (!hasAnyFinancialData) return 'empty'
  if (warnings.some((warning) => warning.severity === 'attention')) return 'attention'
  return 'ok'
}

function summaryMessage(status: LocalDataHealthStatus) {
  switch (status) {
    case 'empty':
      return 'Nenhum dado financeiro local registrado ainda.'
    case 'attention':
      return 'Alguns dados locais precisam de atencao.'
    case 'ok':
      return 'Dados locais encontrados.'
    default: {
      const exhaustive: never = status
      return exhaustive
    }
  }
}

export function deriveLocalDataHealth(input: LocalDataHealthInput): LocalDataHealthReport {
  const counts = countInput(input)
  const hasAnyFinancialData = hasFinancialData(counts)
  const warnings = sortWarnings([
    ...buildReferenceWarnings(input),
    ...buildValueWarnings(input),
    ...buildDateWarnings(input),
    ...buildSyncConflictWarning(input),
  ])
  const status = reportStatus(hasAnyFinancialData, warnings)

  return {
    status,
    hasAnyFinancialData,
    counts,
    warnings,
    summaryMessage: summaryMessage(status),
  }
}


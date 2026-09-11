import { db } from '../../db/database'
import type {
  PaymentMethod,
  RecurringOccurrenceOverride,
  RecurringOccurrenceStatus,
  RecurringRule,
  Transaction,
  TransactionType,
} from '../../db/types'
import { createSecureUuidV4 } from '../../utils/createSecureUuidV4'
import {
  compareMonths,
  isDateInMonth,
  isMonthAfter,
  isMonthBefore,
  plannedDateForMonth,
  type SelectedMonth,
} from '../month'
import { recordTransaction, validateTransactionDraft } from '../transactions'

export interface RecurringRuleDraft {
  type: TransactionType
  description: string
  amount: number
  category: string
  paymentMethod: PaymentMethod
  dayOfMonth: number
  startYear: number
  startMonth: number
  endYear?: number
  endMonth?: number
  active: boolean
}

export interface RecurringOccurrence {
  ruleId: string
  year: number
  month: number
  plannedDate: string
  type: TransactionType
  description: string
  amount: number
  category: string
  paymentMethod: PaymentMethod
  status: RecurringOccurrenceStatus
  linkedTransactionId?: string
}

export interface MonthlyOutlook {
  actualIncome: number
  actualExpense: number
  plannedIncome: number
  plannedExpense: number
  committedCardExpense: number
  projectedIncome: number
  projectedExpense: number
  projectedNet: number
  pendingCount: number
  overdueCount: number
  skippedCount: number
  realizedCount: number
}

const paymentMethods = new Set<PaymentMethod>(['pix', 'debit', 'credit', 'cash', 'transfer', 'other'])
const transactionTypes = new Set<TransactionType>(['income', 'expense'])

function createId() {
  return createSecureUuidV4()
}

function overrideId(ruleId: string, month: SelectedMonth) {
  return `${ruleId}-${month.year}-${String(month.month + 1).padStart(2, '0')}`
}

function normalizeRuleDraft(draft: RecurringRuleDraft): RecurringRuleDraft {
  return {
    ...draft,
    description: draft.description.trim(),
    category: draft.category.trim() || 'Outros',
    active: Boolean(draft.active),
  }
}

export function validateRecurringRuleDraft(draft: RecurringRuleDraft): string | null {
  const normalized = normalizeRuleDraft(draft)

  if (!transactionTypes.has(normalized.type)) return 'Tipo de recorrencia invalido.'
  if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) return 'Informe um valor valido.'
  if (!normalized.description) return 'Informe uma descricao.'
  if (!paymentMethods.has(normalized.paymentMethod)) return 'Forma de pagamento invalida.'
  if (!Number.isInteger(normalized.dayOfMonth) || normalized.dayOfMonth < 1 || normalized.dayOfMonth > 31) {
    return 'Informe um dia entre 1 e 31.'
  }
  if (!Number.isInteger(normalized.startYear) || normalized.startYear < 1970 || normalized.startYear > 9999) {
    return 'Ano inicial invalido.'
  }
  if (!Number.isInteger(normalized.startMonth) || normalized.startMonth < 0 || normalized.startMonth > 11) {
    return 'Mes inicial invalido.'
  }

  const hasEndYear = normalized.endYear !== undefined
  const hasEndMonth = normalized.endMonth !== undefined
  if (hasEndYear !== hasEndMonth) return 'Informe mes e ano final juntos.'

  if (hasEndYear && hasEndMonth) {
    const end = { year: normalized.endYear ?? 0, month: normalized.endMonth ?? 0 }
    if (!Number.isInteger(end.year) || end.year < 1970 || end.year > 9999) return 'Ano final invalido.'
    if (!Number.isInteger(end.month) || end.month < 0 || end.month > 11) return 'Mes final invalido.'
    if (compareMonths(end, { year: normalized.startYear, month: normalized.startMonth }) < 0) {
      return 'Fim da recorrencia nao pode ser antes do inicio.'
    }
  }

  return null
}

export function isRuleActiveForMonth(rule: RecurringRule, month: SelectedMonth) {
  if (!rule.active) return false
  if (rule.cadence !== 'monthly') return false
  if (isMonthBefore(month, { year: rule.startYear, month: rule.startMonth })) return false

  if (rule.endYear !== undefined && rule.endMonth !== undefined) {
    return !isMonthAfter(month, { year: rule.endYear, month: rule.endMonth })
  }

  return true
}

function isLinkedTransactionPresent(override: RecurringOccurrenceOverride, transactions: Transaction[]) {
  return Boolean(override.linkedTransactionId && transactions.some((transaction) => transaction.id === override.linkedTransactionId))
}

export function buildRecurringOccurrences(
  rules: RecurringRule[],
  overrides: RecurringOccurrenceOverride[],
  month: SelectedMonth,
  transactions: Transaction[] = [],
  now = new Date(),
): RecurringOccurrence[] {
  const overridesByRule = new Map(overrides.map((override) => [override.ruleId, override]))

  return rules
    .filter((rule) => isRuleActiveForMonth(rule, month))
    .map((rule) => {
      const override = overridesByRule.get(rule.id)
      const plannedDate = plannedDateForMonth(rule.dayOfMonth, month)
      const plannedDateIso = plannedDate.toISOString()
      let status: RecurringOccurrenceStatus = plannedDate.getTime() < now.getTime() && compareMonths(month, {
        year: now.getFullYear(),
        month: now.getMonth(),
      }) <= 0 ? 'overdue' : 'pending'
      let linkedTransactionId: string | undefined

      if (override?.status === 'skipped') {
        status = 'skipped'
      }

      if (override?.status === 'realized' && isLinkedTransactionPresent(override, transactions)) {
        status = 'realized'
        linkedTransactionId = override.linkedTransactionId
      }

      return {
        ruleId: rule.id,
        year: month.year,
        month: month.month,
        plannedDate: plannedDateIso,
        type: rule.type,
        description: rule.description,
        amount: rule.amount,
        category: rule.category,
        paymentMethod: rule.paymentMethod,
        status,
        linkedTransactionId,
      }
    })
    .sort((a, b) => new Date(a.plannedDate).getTime() - new Date(b.plannedDate).getTime())
}

export function calculateMonthlyOutlook(
  transactions: Transaction[],
  occurrences: RecurringOccurrence[],
  month: SelectedMonth,
  committedCardExpense = 0,
): MonthlyOutlook {
  const actualTransactions = transactions.filter((transaction) => isDateInMonth(transaction.occurredAt, month))
  const actualIncome = actualTransactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const actualExpense = actualTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const plannedRemaining = occurrences.filter((occurrence) => occurrence.status === 'pending' || occurrence.status === 'overdue')
  const plannedIncome = plannedRemaining
    .filter((occurrence) => occurrence.type === 'income')
    .reduce((sum, occurrence) => sum + occurrence.amount, 0)
  const plannedExpense = plannedRemaining
    .filter((occurrence) => occurrence.type === 'expense')
    .reduce((sum, occurrence) => sum + occurrence.amount, 0)

  return {
    actualIncome,
    actualExpense,
    plannedIncome,
    plannedExpense,
    committedCardExpense,
    projectedIncome: actualIncome + plannedIncome,
    projectedExpense: actualExpense + plannedExpense + committedCardExpense,
    projectedNet: actualIncome + plannedIncome - actualExpense - plannedExpense - committedCardExpense,
    pendingCount: occurrences.filter((occurrence) => occurrence.status === 'pending').length,
    overdueCount: occurrences.filter((occurrence) => occurrence.status === 'overdue').length,
    skippedCount: occurrences.filter((occurrence) => occurrence.status === 'skipped').length,
    realizedCount: occurrences.filter((occurrence) => occurrence.status === 'realized').length,
  }
}

export async function getRecurringRules() {
  const rules = await db.recurringRules.toArray()
  return rules.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function saveRecurringRule(draft: RecurringRuleDraft, id?: string) {
  const normalized = normalizeRuleDraft(draft)
  const error = validateRecurringRuleDraft(normalized)
  if (error) throw new Error(error)

  const existing = id ? await db.recurringRules.get(id) : undefined
  if (id && !existing) throw new Error('Recorrencia nao encontrada.')

  const now = new Date().toISOString()
  const rule: RecurringRule = {
    id: existing?.id ?? id ?? createId(),
    ...normalized,
    cadence: 'monthly',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await db.recurringRules.put(rule)
  return rule
}

export async function deleteRecurringRule(id: string) {
  await db.transaction('rw', db.recurringRules, db.recurringOccurrenceOverrides, async () => {
    await db.recurringRules.delete(id)
    const overrides = await db.recurringOccurrenceOverrides.where('ruleId').equals(id).toArray()
    await db.recurringOccurrenceOverrides.bulkDelete(overrides.map((override) => override.id))
  })
}

export async function getOccurrenceOverrides(month: SelectedMonth) {
  return db.recurringOccurrenceOverrides.where('[year+month]').equals([month.year, month.month]).toArray()
}

export async function skipOccurrence(ruleId: string, month: SelectedMonth) {
  const now = new Date().toISOString()
  const existing = await db.recurringOccurrenceOverrides
    .where('[ruleId+year+month]')
    .equals([ruleId, month.year, month.month])
    .first()
  const override: RecurringOccurrenceOverride = {
    id: existing?.id ?? overrideId(ruleId, month),
    ruleId,
    year: month.year,
    month: month.month,
    status: 'skipped',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await db.recurringOccurrenceOverrides.put(override)
  return override
}

export async function confirmOccurrenceAsActual(occurrence: RecurringOccurrence): Promise<Transaction> {
  const existingOverride = await db.recurringOccurrenceOverrides
    .where('[ruleId+year+month]')
    .equals([occurrence.ruleId, occurrence.year, occurrence.month])
    .first()

  if (existingOverride?.status === 'realized' && existingOverride.linkedTransactionId) {
    const existingTransaction = await db.transactions.get(existingOverride.linkedTransactionId)
    if (existingTransaction) return existingTransaction
  }

  const draft = {
    type: occurrence.type,
    amount: occurrence.amount,
    description: occurrence.description,
    category: occurrence.category,
    paymentMethod: occurrence.paymentMethod,
    occurredAt: occurrence.plannedDate,
  }
  const error = validateTransactionDraft(draft)
  if (error) throw new Error(error)

  const transaction = await recordTransaction(draft)
  const now = new Date().toISOString()
  const override: RecurringOccurrenceOverride = {
    id: existingOverride?.id ?? overrideId(occurrence.ruleId, occurrence),
    ruleId: occurrence.ruleId,
    year: occurrence.year,
    month: occurrence.month,
    status: 'realized',
    linkedTransactionId: transaction.id,
    createdAt: existingOverride?.createdAt ?? now,
    updatedAt: now,
  }
  await db.recurringOccurrenceOverrides.put(override)

  return transaction
}

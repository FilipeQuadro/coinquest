import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/database'
import type { RecurringRule, Transaction } from '../../db/types'
import { deleteTransaction } from '../transactions'
import {
  buildRecurringOccurrences,
  calculateMonthlyOutlook,
  confirmOccurrenceAsActual,
  deleteRecurringRule,
  getOccurrenceOverrides,
  getRecurringRules,
  isRuleActiveForMonth,
  saveRecurringRule,
  skipOccurrence,
  validateRecurringRuleDraft,
  type RecurringRuleDraft,
} from './recurring'

const september = { year: 2026, month: 8 }
const october = { year: 2026, month: 9 }

const baseDraft: RecurringRuleDraft = {
  type: 'expense',
  description: 'Internet',
  amount: 120,
  category: 'Casa',
  paymentMethod: 'pix',
  dayOfMonth: 10,
  startYear: 2026,
  startMonth: 8,
  active: true,
}

function tx(input: Pick<Transaction, 'id' | 'type' | 'amount' | 'category' | 'occurredAt'>): Transaction {
  return {
    description: input.category,
    paymentMethod: 'pix',
    createdAt: '2026-09-01T10:00:00.000Z',
    ...input,
  }
}

function rule(input: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: input.id ?? 'rule',
    type: input.type ?? 'expense',
    description: input.description ?? 'Internet',
    amount: input.amount ?? 120,
    category: input.category ?? 'Casa',
    paymentMethod: input.paymentMethod ?? 'pix',
    cadence: 'monthly',
    dayOfMonth: input.dayOfMonth ?? 10,
    startYear: input.startYear ?? 2026,
    startMonth: input.startMonth ?? 8,
    endYear: input.endYear,
    endMonth: input.endMonth,
    active: input.active ?? true,
    createdAt: input.createdAt ?? '2026-09-01T10:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-09-01T10:00:00.000Z',
  }
}

describe('RecurringRule validation and storage', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('validates recurring rule drafts', () => {
    expect(validateRecurringRuleDraft(baseDraft)).toBeNull()
    expect(validateRecurringRuleDraft({ ...baseDraft, amount: 0 })).toBe('Informe um valor valido.')
    expect(validateRecurringRuleDraft({ ...baseDraft, dayOfMonth: 32 })).toBe('Informe um dia entre 1 e 31.')
    expect(validateRecurringRuleDraft({ ...baseDraft, endYear: 2026 })).toBe('Informe mes e ano final juntos.')
    expect(validateRecurringRuleDraft({ ...baseDraft, endYear: 2026, endMonth: 7 })).toBe('Fim da recorrencia nao pode ser antes do inicio.')
  })

  it('saves, updates, pauses and deletes a recurring rule without transactions', async () => {
    const saved = await saveRecurringRule(baseDraft)
    const updated = await saveRecurringRule({ ...baseDraft, amount: 150, active: false }, saved.id)

    expect(updated.id).toBe(saved.id)
    expect(updated.amount).toBe(150)
    expect(updated.active).toBe(false)
    await expect(getRecurringRules()).resolves.toHaveLength(1)

    await deleteRecurringRule(saved.id)
    await expect(getRecurringRules()).resolves.toEqual([])
    await expect(db.transactions.count()).resolves.toBe(0)
  })
})

describe('RecurringOccurrence derivation', () => {
  it('appears on start month, continues without end and crosses December to January', () => {
    const salary = rule({ id: 'salary', type: 'income', startYear: 2026, startMonth: 11, dayOfMonth: 5 })

    expect(isRuleActiveForMonth(salary, { year: 2026, month: 10 })).toBe(false)
    expect(isRuleActiveForMonth(salary, { year: 2026, month: 11 })).toBe(true)
    expect(isRuleActiveForMonth(salary, { year: 2027, month: 0 })).toBe(true)
  })

  it('does not appear after end month or when inactive', () => {
    expect(isRuleActiveForMonth(rule({ endYear: 2026, endMonth: 9 }), september)).toBe(true)
    expect(isRuleActiveForMonth(rule({ endYear: 2026, endMonth: 9 }), { year: 2026, month: 10 })).toBe(false)
    expect(isRuleActiveForMonth(rule({ active: false }), september)).toBe(false)
  })

  it('clamps day 31 to the last valid day including leap years', () => {
    const day31 = rule({ dayOfMonth: 31 })
    const feb2027 = buildRecurringOccurrences([day31], [], { year: 2027, month: 1 }, [], new Date('2027-02-01T10:00:00.000Z'))[0]
    const feb2028 = buildRecurringOccurrences([day31], [], { year: 2028, month: 1 }, [], new Date('2028-02-01T10:00:00.000Z'))[0]

    expect(new Date(feb2027.plannedDate).getDate()).toBe(28)
    expect(new Date(feb2028.plannedDate).getDate()).toBe(29)
  })

  it('derives pending, overdue, skipped and realized statuses', () => {
    const internet = rule({ id: 'internet' })
    const pending = buildRecurringOccurrences([internet], [], october, [], new Date('2026-09-01T10:00:00.000Z'))[0]
    const overdue = buildRecurringOccurrences([internet], [], september, [], new Date('2026-09-20T10:00:00.000Z'))[0]
    const skipped = buildRecurringOccurrences([internet], [{ id: 'skip', ruleId: 'internet', year: 2026, month: 8, status: 'skipped', createdAt: '', updatedAt: '' }], september, [], new Date('2026-09-20T10:00:00.000Z'))[0]
    const realized = buildRecurringOccurrences(
      [internet],
      [{ id: 'realized', ruleId: 'internet', year: 2026, month: 8, status: 'realized', linkedTransactionId: 'linked', createdAt: '', updatedAt: '' }],
      september,
      [tx({ id: 'linked', type: 'expense', amount: 120, category: 'Casa', occurredAt: '2026-09-10T12:00:00.000Z' })],
      new Date('2026-09-20T10:00:00.000Z'),
    )[0]

    expect(pending.status).toBe('pending')
    expect(overdue.status).toBe('overdue')
    expect(skipped.status).toBe('skipped')
    expect(realized.status).toBe('realized')
  })
})

describe('Occurrence overrides and realization', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('skips only one month', async () => {
    const saved = await saveRecurringRule(baseDraft)
    await skipOccurrence(saved.id, september)

    const septemberOccurrence = buildRecurringOccurrences(await getRecurringRules(), await getOccurrenceOverrides(september), september, [], new Date('2026-09-01T10:00:00.000Z'))[0]
    const octoberOccurrence = buildRecurringOccurrences(await getRecurringRules(), await getOccurrenceOverrides(october), october, [], new Date('2026-09-01T10:00:00.000Z'))[0]

    expect(septemberOccurrence.status).toBe('skipped')
    expect(octoberOccurrence.status).toBe('pending')
  })

  it('confirms an occurrence as one actual transaction and prevents duplicates', async () => {
    const saved = await saveRecurringRule(baseDraft)
    const occurrence = buildRecurringOccurrences(await getRecurringRules(), [], september, [], new Date('2026-09-01T10:00:00.000Z'))[0]

    const first = await confirmOccurrenceAsActual(occurrence)
    const second = await confirmOccurrenceAsActual({ ...occurrence, ruleId: saved.id })

    expect(second.id).toBe(first.id)
    await expect(db.transactions.count()).resolves.toBe(1)
    await expect(getOccurrenceOverrides(september)).resolves.toEqual([
      expect.objectContaining({ ruleId: saved.id, status: 'realized', linkedTransactionId: first.id }),
    ])
  })

  it('returns to pending if the linked transaction is deleted', async () => {
    const saved = await saveRecurringRule(baseDraft)
    const occurrence = buildRecurringOccurrences(await getRecurringRules(), [], september, [], new Date('2026-09-01T10:00:00.000Z'))[0]
    const transaction = await confirmOccurrenceAsActual(occurrence)

    await deleteTransaction(transaction.id)

    const afterDelete = buildRecurringOccurrences(await getRecurringRules(), await getOccurrenceOverrides(september), september, await db.transactions.toArray(), new Date('2026-09-01T10:00:00.000Z'))[0]
    expect(afterDelete.status).toBe('pending')
    expect(afterDelete.linkedTransactionId).toBeUndefined()
  })
})

describe('MonthlyOutlook', () => {
  it('handles empty, actual-only, planned-only and mixed months', () => {
    expect(calculateMonthlyOutlook([], [], september)).toMatchObject({
      actualIncome: 0,
      actualExpense: 0,
      plannedIncome: 0,
      plannedExpense: 0,
      projectedNet: 0,
    })

    const actual = [
      tx({ id: 'income', type: 'income', amount: 700, category: 'Renda', occurredAt: '2026-09-02T12:00:00.000Z' }),
      tx({ id: 'expense', type: 'expense', amount: 200, category: 'Casa', occurredAt: '2026-09-03T12:00:00.000Z' }),
    ]
    const planned = [
      buildRecurringOccurrences([rule({ id: 'salary', type: 'income', amount: 800, description: 'Salario' })], [], september, [], new Date('2026-09-01T10:00:00.000Z'))[0],
      buildRecurringOccurrences([rule({ id: 'internet', type: 'expense', amount: 120 })], [], september, [], new Date('2026-09-01T10:00:00.000Z'))[0],
      buildRecurringOccurrences([rule({ id: 'course', type: 'expense', amount: 200, description: 'Curso' })], [], september, [], new Date('2026-09-01T10:00:00.000Z'))[0],
    ]

    expect(calculateMonthlyOutlook(actual, planned, september)).toMatchObject({
      actualIncome: 700,
      actualExpense: 200,
      plannedIncome: 800,
      plannedExpense: 320,
      projectedIncome: 1500,
      projectedExpense: 520,
      projectedNet: 980,
    })
  })

  it('does not count realized or skipped occurrences as planned remaining', () => {
    const occurrences = [
      { ...buildRecurringOccurrences([rule({ id: 'pending', amount: 120 })], [], september, [], new Date('2026-09-01T10:00:00.000Z'))[0], status: 'pending' as const },
      { ...buildRecurringOccurrences([rule({ id: 'skipped', amount: 45 })], [], september, [], new Date('2026-09-01T10:00:00.000Z'))[0], status: 'skipped' as const },
      { ...buildRecurringOccurrences([rule({ id: 'realized', amount: 50 })], [], september, [], new Date('2026-09-01T10:00:00.000Z'))[0], status: 'realized' as const },
    ]

    expect(calculateMonthlyOutlook([], occurrences, september)).toMatchObject({
      plannedExpense: 120,
      skippedCount: 1,
      realizedCount: 1,
    })
  })
})

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/database'
import type { Goal, GoalContribution, Transaction } from '../../db/types'
import { calculateBudgetProgress } from '../budget/budget'
import type { SelectedMonth } from '../month'
import { projectMonths } from '../projection/projection'
import { calculateMonthlyOutlook } from '../recurring/recurring'
import {
  addGoalContribution,
  archiveGoal,
  calculateGoalProgress,
  createGoal,
  getGoalContributions,
  getGoalProgress,
  getGoals,
  restoreGoal,
  updateGoal,
  validateGoalContributionDraft,
  validateGoalDraft,
} from './goals'

const september: SelectedMonth = { year: 2026, month: 8 }
const now = new Date('2026-09-01T12:00:00.000Z')

function goal(input: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    name: 'Notebook',
    targetAmount: 1000,
    status: 'active',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...input,
  }
}

function contribution(input: Partial<GoalContribution> = {}): GoalContribution {
  return {
    id: 'contribution-1',
    goalId: 'goal-1',
    amount: 500,
    date: '2026-09-05T12:00:00.000Z',
    createdAt: '2026-09-05T12:00:00.000Z',
    ...input,
  }
}

function tx(input: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    type: 'income',
    kind: 'standard',
    amount: 1000,
    description: 'Pagamento',
    category: 'Renda',
    paymentMethod: 'pix',
    occurredAt: '2026-09-02T12:00:00.000Z',
    createdAt: '2026-09-02T12:00:00.000Z',
    ...input,
  }
}

describe('goals validation', () => {
  it('validates goal drafts and contribution drafts', () => {
    expect(validateGoalDraft({ name: 'Notebook', targetAmount: 1000 })).toBeNull()
    expect(validateGoalDraft({ name: '', targetAmount: 1000 })).toBe('Informe um nome para a meta.')
    expect(validateGoalDraft({ name: 'Notebook', targetAmount: 0 })).toBe('Informe um objetivo valido.')
    expect(validateGoalDraft({ name: 'Notebook', targetAmount: Number.NaN })).toBe('Informe um objetivo valido.')
    expect(validateGoalDraft({ name: 'Notebook', targetAmount: 1000, monthlyPlan: -1 })).toBe('Plano mensal invalido.')
    expect(validateGoalDraft({ name: 'Notebook', targetAmount: 1000, targetDate: 'not-a-date' })).toBe('Data alvo invalida.')
    expect(validateGoalContributionDraft({ amount: 500 })).toBeNull()
    expect(validateGoalContributionDraft({ amount: -100 })).toBeNull()
    expect(validateGoalContributionDraft({ amount: 0 })).toBe('Informe um ajuste valido.')
    expect(validateGoalContributionDraft({ amount: Number.POSITIVE_INFINITY })).toBe('Informe um ajuste valido.')
  })
})

describe('goal progress', () => {
  it('calculates 0%, 50%, 100% and over-allocation without losing extra value', () => {
    expect(calculateGoalProgress(goal(), [], now)).toMatchObject({
      allocatedAmount: 0,
      remainingAmount: 1000,
      percentageRaw: 0,
      percentageDisplay: 0,
      completed: false,
    })
    expect(calculateGoalProgress(goal(), [contribution({ amount: 500 })], now)).toMatchObject({
      allocatedAmount: 500,
      remainingAmount: 500,
      percentageRaw: 50,
      percentageDisplay: 50,
      completed: false,
    })
    expect(calculateGoalProgress(goal(), [contribution({ amount: 1000 })], now)).toMatchObject({
      allocatedAmount: 1000,
      remainingAmount: 0,
      percentageRaw: 100,
      percentageDisplay: 100,
      completed: true,
    })
    expect(calculateGoalProgress(goal(), [contribution({ amount: 1100 })], now)).toMatchObject({
      allocatedAmount: 1100,
      remainingAmount: 0,
      percentageRaw: 110,
      percentageDisplay: 100,
      completed: true,
    })
  })

  it('keeps withdrawal as explicit negative allocation history', () => {
    const progress = calculateGoalProgress(goal(), [
      contribution({ id: 'in', amount: 500 }),
      contribution({ id: 'out', amount: -100 }),
    ], now)

    expect(progress).toMatchObject({
      allocatedAmount: 400,
      remainingAmount: 600,
      percentageRaw: 40,
    })
  })

  it('estimates remaining months from monthlyPlan', () => {
    expect(calculateGoalProgress(goal({ targetAmount: 3500, monthlyPlan: 500 }), [
      contribution({ amount: 250 }),
    ], now)).toMatchObject({
      remainingAmount: 3250,
      estimatedMonthsRemaining: 7,
    })
    expect(calculateGoalProgress(goal({ monthlyPlan: undefined }), [], now).estimatedMonthsRemaining).toBeNull()
  })

  it('calculates target date information without treating it as advice', () => {
    const progress = calculateGoalProgress(goal({
      targetAmount: 3000,
      targetDate: '2027-03-01T12:00:00.000Z',
    }), [], now)

    expect(progress).toMatchObject({
      monthsUntilTarget: 6,
      requiredMonthlyAllocation: 500,
      targetDatePassed: false,
    })
  })

  it('handles missing and past target dates', () => {
    expect(calculateGoalProgress(goal(), [], now)).toMatchObject({
      monthsUntilTarget: null,
      requiredMonthlyAllocation: null,
      targetDatePassed: false,
    })
    expect(calculateGoalProgress(goal({ targetDate: '2026-08-01T12:00:00.000Z' }), [], now)).toMatchObject({
      monthsUntilTarget: 0,
      requiredMonthlyAllocation: null,
      targetDatePassed: true,
    })
  })
})

describe('goals storage', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('creates, edits and archives goals', async () => {
    const created = await createGoal({
      name: 'Notebook',
      description: 'Setup dev',
      targetAmount: 5000,
      monthlyPlan: 500,
      priority: 'high',
    })
    const updated = await updateGoal(created.id, {
      name: 'Notebook Pro',
      targetAmount: 5500,
      monthlyPlan: 600,
      priority: 'medium',
    })

    expect(updated).toMatchObject({
      id: created.id,
      name: 'Notebook Pro',
      targetAmount: 5500,
      monthlyPlan: 600,
      status: 'active',
    })

    await archiveGoal(created.id)
    await expect(getGoals()).resolves.toEqual([])
    await expect(getGoals(true)).resolves.toEqual([expect.objectContaining({ status: 'archived' })])

    await restoreGoal(created.id)
    await expect(getGoals()).resolves.toEqual([expect.objectContaining({ status: 'active' })])
  })

  it('persists contributions and derives allocated amount', async () => {
    const created = await createGoal({ name: 'Reserva', targetAmount: 1000 })
    await addGoalContribution(created.id, { amount: 500, date: '2026-09-05T12:00:00.000Z', note: 'aporte' })
    await addGoalContribution(created.id, { amount: -100, date: '2026-09-10T12:00:00.000Z', note: 'retirada' })

    await expect(getGoalContributions(created.id)).resolves.toEqual([
      expect.objectContaining({ amount: 500, note: 'aporte' }),
      expect.objectContaining({ amount: -100, note: 'retirada' }),
    ])
    await expect(getGoalProgress(created.id, now)).resolves.toMatchObject({
      allocatedAmount: 400,
      remainingAmount: 600,
    })
  })

  it('automatically completes and reopens active goals as allocation changes', async () => {
    const created = await createGoal({ name: 'Monitor', targetAmount: 1000 })

    await addGoalContribution(created.id, { amount: 1000 })
    await expect(db.goals.get(created.id)).resolves.toMatchObject({ status: 'completed' })

    await addGoalContribution(created.id, { amount: -250 })
    await expect(db.goals.get(created.id)).resolves.toMatchObject({ status: 'active' })
  })

  it('updates target without changing contribution history', async () => {
    const created = await createGoal({ name: 'Notebook', targetAmount: 1000 })
    await addGoalContribution(created.id, { amount: 500 })

    await updateGoal(created.id, { name: 'Notebook', targetAmount: 2000, monthlyPlan: 250 })

    await expect(getGoalContributions(created.id)).resolves.toHaveLength(1)
    await expect(getGoalProgress(created.id, now)).resolves.toMatchObject({
      targetAmount: 2000,
      allocatedAmount: 500,
      remainingAmount: 1500,
      estimatedMonthsRemaining: 6,
    })
  })

  it('does not turn goal allocation into transactions, budget, outlook or projection expense', async () => {
    const created = await createGoal({ name: 'Notebook', targetAmount: 1000 })
    await addGoalContribution(created.id, { amount: 500 })
    await db.transactions.add(tx())

    const transactions = await db.transactions.toArray()
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({ amount: 1000, type: 'income' })
    expect(calculateBudgetProgress(null, transactions, september)).toMatchObject({
      spent: 0,
      remaining: 0,
    })
    expect(calculateMonthlyOutlook(transactions, [], september)).toMatchObject({
      actualIncome: 1000,
      actualExpense: 0,
      projectedNet: 1000,
    })
    expect(projectMonths(september, 1, {
      transactions,
      recurringRules: [],
      recurringOverrides: [],
      creditCards: [],
      cardPurchases: [],
      cardInvoicePayments: [],
    }).months[0]).toMatchObject({
      actualIncome: 1000,
      actualExpense: 0,
      projectedNet: 1000,
    })
  })
})

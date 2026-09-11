import { db } from '../../db/database'
import type { Goal, GoalContribution, GoalPriority, GoalStatus } from '../../db/types'
import { createSecureUuidV4 } from '../../utils/createSecureUuidV4'

export interface GoalDraft {
  name: string
  description?: string
  targetAmount: number
  targetDate?: string
  monthlyPlan?: number
  priority?: GoalPriority
}

export interface GoalContributionDraft {
  amount: number
  date?: string
  note?: string
}

export interface GoalProgress {
  targetAmount: number
  allocatedAmount: number
  remainingAmount: number
  percentageRaw: number
  percentageDisplay: number
  completed: boolean
  targetDatePassed: boolean
  monthsUntilTarget: number | null
  estimatedMonthsRemaining: number | null
  requiredMonthlyAllocation: number | null
}

function createId() {
  return createSecureUuidV4()
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function normalizeGoalDraft(draft: GoalDraft): GoalDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    description: draft.description?.trim() || undefined,
  }
}

function parseValidDate(isoDate: string | undefined) {
  if (!isoDate) return null
  const date = new Date(isoDate)
  return Number.isFinite(date.getTime()) ? date : null
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0)
}

function monthsUntil(date: Date, now: Date) {
  const today = startOfLocalDay(now)
  const target = startOfLocalDay(date)
  if (target.getTime() < today.getTime()) return 0

  const base = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth())
  return target.getDate() > today.getDate() ? base + 1 : base
}

function validateIsoDate(isoDate: string | undefined, fieldName: string) {
  if (!isoDate) return null
  return parseValidDate(isoDate) ? null : `${fieldName} invalida.`
}

function validateMonthlyPlan(monthlyPlan: number | undefined) {
  if (monthlyPlan === undefined) return null
  if (!Number.isFinite(monthlyPlan) || monthlyPlan <= 0) return 'Plano mensal invalido.'
  return null
}

export function validateGoalDraft(draft: GoalDraft): string | null {
  const normalized = normalizeGoalDraft(draft)

  if (!normalized.name) return 'Informe um nome para a meta.'
  if (!Number.isFinite(normalized.targetAmount) || normalized.targetAmount <= 0) return 'Informe um objetivo valido.'
  if (normalized.priority && !['low', 'medium', 'high'].includes(normalized.priority)) return 'Prioridade invalida.'

  return validateIsoDate(normalized.targetDate, 'Data alvo')
    ?? validateMonthlyPlan(normalized.monthlyPlan)
}

export function validateGoalContributionDraft(draft: GoalContributionDraft): string | null {
  if (!Number.isFinite(draft.amount) || draft.amount === 0) return 'Informe um ajuste valido.'
  if (draft.note !== undefined && draft.note.trim().length > 180) return 'Nota muito longa.'
  return validateIsoDate(draft.date, 'Data da contribuicao')
}

export function getAllocatedAmount(contributions: GoalContribution[], goalId: string) {
  return roundMoney(contributions
    .filter((contribution) => contribution.goalId === goalId)
    .reduce((sum, contribution) => sum + contribution.amount, 0))
}

export function calculateGoalProgress(goal: Goal, contributions: GoalContribution[], now = new Date()): GoalProgress {
  const allocatedAmount = getAllocatedAmount(contributions, goal.id)
  const remainingAmount = roundMoney(Math.max(0, goal.targetAmount - allocatedAmount))
  const percentageRaw = roundMoney((allocatedAmount / goal.targetAmount) * 100)
  const percentageDisplay = Math.max(0, Math.min(100, percentageRaw))
  const targetDate = parseValidDate(goal.targetDate)
  const targetDatePassed = Boolean(targetDate && startOfLocalDay(targetDate).getTime() < startOfLocalDay(now).getTime())
  const monthsUntilTarget = targetDate ? monthsUntil(targetDate, now) : null
  const estimatedMonthsRemaining = remainingAmount > 0 && goal.monthlyPlan && goal.monthlyPlan > 0
    ? Math.ceil(remainingAmount / goal.monthlyPlan)
    : null
  const requiredMonthlyAllocation = remainingAmount > 0 && monthsUntilTarget && monthsUntilTarget > 0
    ? roundMoney(remainingAmount / monthsUntilTarget)
    : null

  return {
    targetAmount: goal.targetAmount,
    allocatedAmount,
    remainingAmount,
    percentageRaw,
    percentageDisplay,
    completed: allocatedAmount >= goal.targetAmount,
    targetDatePassed,
    monthsUntilTarget,
    estimatedMonthsRemaining,
    requiredMonthlyAllocation,
  }
}

export function deriveGoalStatus(goal: Goal, contributions: GoalContribution[]): GoalStatus {
  if (goal.status === 'archived') return 'archived'
  return calculateGoalProgress(goal, contributions).completed ? 'completed' : 'active'
}

async function syncGoalStatus(goalId: string) {
  const goal = await db.goals.get(goalId)
  if (!goal || goal.status === 'archived') return goal

  const contributions = await db.goalContributions.where('goalId').equals(goalId).toArray()
  const status = deriveGoalStatus(goal, contributions)
  if (status !== goal.status) {
    const updated = { ...goal, status, updatedAt: new Date().toISOString() }
    await db.goals.put(updated)
    return updated
  }

  return goal
}

export async function createGoal(draft: GoalDraft): Promise<Goal> {
  const normalized = normalizeGoalDraft(draft)
  const error = validateGoalDraft(normalized)
  if (error) throw new Error(error)

  const now = new Date().toISOString()
  const goal: Goal = {
    id: createId(),
    name: normalized.name,
    description: normalized.description,
    targetAmount: roundMoney(normalized.targetAmount),
    targetDate: normalized.targetDate,
    monthlyPlan: normalized.monthlyPlan ? roundMoney(normalized.monthlyPlan) : undefined,
    priority: normalized.priority,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }

  await db.goals.add(goal)
  return goal
}

export async function updateGoal(id: string, draft: GoalDraft): Promise<Goal> {
  const existing = await db.goals.get(id)
  if (!existing) throw new Error('Meta nao encontrada.')

  const normalized = normalizeGoalDraft(draft)
  const error = validateGoalDraft(normalized)
  if (error) throw new Error(error)

  const updated: Goal = {
    ...existing,
    name: normalized.name,
    description: normalized.description,
    targetAmount: roundMoney(normalized.targetAmount),
    targetDate: normalized.targetDate,
    monthlyPlan: normalized.monthlyPlan ? roundMoney(normalized.monthlyPlan) : undefined,
    priority: normalized.priority,
    updatedAt: new Date().toISOString(),
  }

  const contributions = await db.goalContributions.where('goalId').equals(id).toArray()
  updated.status = existing.status === 'archived' ? 'archived' : deriveGoalStatus(updated, contributions)

  await db.goals.put(updated)
  return updated
}

export async function archiveGoal(id: string): Promise<Goal> {
  const goal = await db.goals.get(id)
  if (!goal) throw new Error('Meta nao encontrada.')

  const updated = { ...goal, status: 'archived' as const, updatedAt: new Date().toISOString() }
  await db.goals.put(updated)
  return updated
}

export async function restoreGoal(id: string): Promise<Goal> {
  const goal = await db.goals.get(id)
  if (!goal) throw new Error('Meta nao encontrada.')

  const contributions = await db.goalContributions.where('goalId').equals(id).toArray()
  const updated = { ...goal, status: deriveGoalStatus({ ...goal, status: 'active' }, contributions), updatedAt: new Date().toISOString() }
  await db.goals.put(updated)
  return updated
}

export async function addGoalContribution(goalId: string, draft: GoalContributionDraft): Promise<GoalContribution> {
  const goal = await db.goals.get(goalId)
  if (!goal) throw new Error('Meta nao encontrada.')

  const error = validateGoalContributionDraft(draft)
  if (error) throw new Error(error)

  const now = new Date().toISOString()
  const contribution: GoalContribution = {
    id: createId(),
    goalId,
    amount: roundMoney(draft.amount),
    date: draft.date ?? now,
    note: draft.note?.trim() || undefined,
    createdAt: now,
  }

  await db.transaction('rw', db.goalContributions, db.goals, async () => {
    await db.goalContributions.add(contribution)
    await syncGoalStatus(goalId)
  })

  return contribution
}

export async function getGoals(includeArchived = false) {
  const goals = await db.goals.orderBy('createdAt').toArray()
  return includeArchived ? goals : goals.filter((goal) => goal.status !== 'archived')
}

export async function getGoalContributions(goalId: string) {
  return db.goalContributions.where('goalId').equals(goalId).sortBy('date')
}

export async function getGoalProgress(goalId: string, now = new Date()) {
  const goal = await db.goals.get(goalId)
  if (!goal) throw new Error('Meta nao encontrada.')

  const contributions = await getGoalContributions(goalId)
  return calculateGoalProgress(goal, contributions, now)
}

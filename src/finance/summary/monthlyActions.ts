export type MonthlyActionKind = 'info' | 'attention' | 'warning'
export type MonthlyActionSource = 'budget' | 'recurring' | 'card' | 'projection' | 'goal'

export interface MonthlyAction {
  id: string
  kind: MonthlyActionKind
  source: MonthlyActionSource
  title: string
  message: string
  destinationHash: string
  priority: number
}

export interface MonthlyActionBudgetInput {
  hasBudget: boolean
  percentageUsed?: number | null
  isOverLimit?: boolean
}

export type MonthlyActionCommitmentKind = 'recurring' | 'card-invoice'
export type MonthlyActionCommitmentStatus = 'planned' | 'pending' | 'open' | 'due' | 'overdue' | 'paid' | 'realized' | 'skipped'

export interface MonthlyActionCommitmentInput {
  id?: string
  kind: MonthlyActionCommitmentKind
  status: MonthlyActionCommitmentStatus
  amount?: number
}

export interface MonthlyActionProjectionInput {
  projectedNet?: number | null
}

export interface MonthlyActionGoalInput {
  id?: string
  active?: boolean
  status?: 'active' | 'completed' | 'archived'
}

export interface MonthlyActionsInput {
  budget?: MonthlyActionBudgetInput | null
  commitments?: MonthlyActionCommitmentInput[] | null
  projection?: MonthlyActionProjectionInput | null
  goal?: MonthlyActionGoalInput | null
}

const relevantRecurringStatuses = new Set<MonthlyActionCommitmentStatus>(['planned', 'pending', 'open', 'due', 'overdue'])
const relevantCardStatuses = new Set<MonthlyActionCommitmentStatus>(['pending', 'open', 'due', 'overdue'])

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function compareActions(a: MonthlyAction, b: MonthlyAction) {
  const priorityDiff = b.priority - a.priority
  if (priorityDiff !== 0) return priorityDiff
  return a.id.localeCompare(b.id)
}

function hasRelevantRecurringCommitment(commitments: MonthlyActionCommitmentInput[]) {
  return commitments.some((commitment) =>
    commitment.kind === 'recurring' &&
    relevantRecurringStatuses.has(commitment.status) &&
    (!isFiniteNumber(commitment.amount) || commitment.amount > 0),
  )
}

function hasRelevantCardCommitment(commitments: MonthlyActionCommitmentInput[]) {
  return commitments.some((commitment) =>
    commitment.kind === 'card-invoice' &&
    relevantCardStatuses.has(commitment.status) &&
    (!isFiniteNumber(commitment.amount) || commitment.amount > 0),
  )
}

function deriveBudgetAction(budget: MonthlyActionsInput['budget']): MonthlyAction | null {
  if (!budget) return null

  if (!budget.hasBudget) {
    return {
      id: 'budget:missing',
      kind: 'info',
      source: 'budget',
      title: 'Revisar plano do mes',
      message: 'Crie um limite de planejamento para acompanhar o mes.',
      destinationHash: '#orcamento',
      priority: 50,
    }
  }

  const percentageUsed = budget.percentageUsed
  const isOverLimit = budget.isOverLimit === true || (isFiniteNumber(percentageUsed) && percentageUsed > 1)

  if (isOverLimit) {
    return {
      id: 'budget:over-limit',
      kind: 'warning',
      source: 'budget',
      title: 'Revisar plano do mes',
      message: 'O uso passou do limite planejado; veja se os limites ainda fazem sentido para este mes.',
      destinationHash: '#orcamento',
      priority: 90,
    }
  }

  if (isFiniteNumber(percentageUsed) && percentageUsed >= 0.9) {
    return {
      id: 'budget:near-limit',
      kind: 'attention',
      source: 'budget',
      title: 'Revisar plano do mes',
      message: 'O uso esta perto do limite planejado; veja se os limites ainda fazem sentido para este mes.',
      destinationHash: '#orcamento',
      priority: 65,
    }
  }

  return null
}

function deriveRecurringAction(commitments: MonthlyActionCommitmentInput[]): MonthlyAction | null {
  if (!hasRelevantRecurringCommitment(commitments)) return null

  return {
    id: 'recurring:review',
    kind: 'attention',
    source: 'recurring',
    title: 'Conferir compromissos previstos',
    message: 'Revise o que ainda e previsao antes de confirmar como movimento real.',
    destinationHash: '#previsoes',
    priority: 80,
  }
}

function deriveCardAction(commitments: MonthlyActionCommitmentInput[]): MonthlyAction | null {
  if (!hasRelevantCardCommitment(commitments)) return null

  return {
    id: 'card:review-invoices',
    kind: 'attention',
    source: 'card',
    title: 'Revisar faturas do cartao',
    message: 'Compras no cartao aparecem como compromisso; pagamento de fatura e o movimento real.',
    destinationHash: '#cartoes',
    priority: 85,
  }
}

function deriveProjectionAction(projection: MonthlyActionsInput['projection']): MonthlyAction | null {
  if (!isFiniteNumber(projection?.projectedNet) || projection.projectedNet >= 0) return null

  return {
    id: 'projection:negative',
    kind: 'attention',
    source: 'projection',
    title: 'Revisar projecao do mes',
    message: 'A projecao indica um cenario estimado negativo; confira os itens previstos.',
    destinationHash: '#projecao',
    priority: 70,
  }
}

function deriveGoalAction(goal: MonthlyActionsInput['goal']): MonthlyAction | null {
  const isActive = goal?.active === true || goal?.status === 'active'
  if (!isActive) return null

  return {
    id: goal?.id ? `goal:follow:${goal.id}` : 'goal:follow',
    kind: 'info',
    source: 'goal',
    title: 'Acompanhar missoes',
    message: 'Veja o progresso das alocacoes sem criar movimento real automaticamente.',
    destinationHash: '#missoes',
    priority: 50,
  }
}

export function deriveMonthlyActions(input: MonthlyActionsInput): MonthlyAction[] {
  const commitments = [...(input.commitments ?? [])]
  const actions = [
    deriveBudgetAction(input.budget),
    deriveCardAction(commitments),
    deriveRecurringAction(commitments),
    deriveProjectionAction(input.projection),
    deriveGoalAction(input.goal),
  ].filter((action): action is MonthlyAction => action !== null)

  return actions.sort(compareActions)
}

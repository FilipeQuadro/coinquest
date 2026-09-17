import type { BudgetProgress } from '../budget/budget'
import type { FinancialHealth } from '../health/financialHealth'

export type WorldProgressionTier = 'starter' | 'stable' | 'focused' | 'thriving'

export interface WorldMissionProgressInput {
  activeGoals: number
  completedGoals: number
  contributionsThisMonth: number
}

export interface WorldProgressionInput {
  transactionCount: number
  budgetProgress?: Pick<BudgetProgress, 'hasBudget' | 'percentageUsed' | 'isOverLimit'> | null
  financialHealth?: Pick<FinancialHealth, 'level'> | null
  missions?: Partial<WorldMissionProgressInput> | null
}

export interface WorldProgressionState {
  tier: WorldProgressionTier
  title: string
  description: string
  reasons: string[]
  nextHint: string
  score: number
}

const tierCopy: Record<WorldProgressionTier, Pick<WorldProgressionState, 'title' | 'description'>> = {
  starter: {
    title: 'Base inicial',
    description: 'O mundo ainda precisa de mais sinais do mes para evoluir.',
  },
  stable: {
    title: 'Base estavel',
    description: 'O mes ja tem organizacao suficiente para o mundo responder melhor.',
  },
  focused: {
    title: 'Base focada',
    description: 'Orcamento, registros e missoes indicam um mes acompanhado.',
  },
  thriving: {
    title: 'Base prospera',
    description: 'O mundo reflete um mes forte, com bons sinais financeiros e progresso de missao.',
  },
}

function hasUsefulBudget(progress: WorldProgressionInput['budgetProgress']) {
  return Boolean(progress?.hasBudget)
}

function isBudgetRespected(progress: WorldProgressionInput['budgetProgress']) {
  if (!progress?.hasBudget || progress.percentageUsed === null) return false
  if (!Number.isFinite(progress.percentageUsed)) return false
  return progress.percentageUsed <= 1 && !progress.isOverLimit
}

function hasPositiveHealth(health: WorldProgressionInput['financialHealth']) {
  return health?.level === 'excellent' || health?.level === 'healthy'
}

function hasStrongHealth(health: WorldProgressionInput['financialHealth']) {
  return health?.level === 'excellent'
}

function safeCount(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? value : 0
}

function nextHint(input: {
  hasEnoughRecords: boolean
  hasBudget: boolean
  budgetRespected: boolean
  hasActiveGoal: boolean
  hasMissionProgress: boolean
  positiveHealth: boolean
}) {
  if (!input.hasEnoughRecords) return 'Registre algumas movimentacoes reais do mes para dar leitura ao mundo.'
  if (!input.hasBudget) return 'Defina um orcamento mensal para estabilizar a base.'
  if (!input.budgetRespected) return 'Acompanhe o orcamento para manter a base sob controle.'
  if (!input.hasActiveGoal) return 'Crie uma missao financeira para dar um objetivo ao mundo.'
  if (!input.hasMissionProgress) return 'Reserve ou ajuste uma missao quando fizer sentido para mostrar progresso.'
  if (!input.positiveHealth) return 'Melhorar a saude financeira mensal fortalece a progressao visual.'
  return 'Mantenha os registros, o orcamento e as missoes em dia.'
}

function tierFromScore(score: number, hasOrganizedMonth: boolean, positiveHealth: boolean, hasCompletedGoal: boolean): WorldProgressionTier {
  if (!hasOrganizedMonth) return 'starter'
  if (score >= 7 && (positiveHealth || hasCompletedGoal)) return 'thriving'
  if (score >= 5) return 'focused'
  if (score >= 2) return 'stable'
  return 'starter'
}

export function deriveWorldProgression(input: WorldProgressionInput): WorldProgressionState {
  const transactionCount = safeCount(input.transactionCount)
  const completedGoals = safeCount(input.missions?.completedGoals)
  const activeGoals = safeCount(input.missions?.activeGoals)
  const contributionsThisMonth = safeCount(input.missions?.contributionsThisMonth)
  const hasEnoughRecords = transactionCount >= 2
  const hasBudget = hasUsefulBudget(input.budgetProgress)
  const hasOrganizedMonth = hasEnoughRecords || hasBudget
  const budgetRespected = isBudgetRespected(input.budgetProgress)
  const positiveHealth = hasPositiveHealth(input.financialHealth)
  const strongHealth = hasStrongHealth(input.financialHealth)
  const hasActiveGoal = activeGoals > 0
  const hasCompletedGoal = completedGoals > 0
  const hasMissionProgress = contributionsThisMonth > 0
  const reasons: string[] = []
  let score = 0

  if (hasEnoughRecords) {
    score += 1
    reasons.push('Mes com registros suficientes para leitura.')
  }

  if (hasBudget) {
    score += 1
    reasons.push('Orcamento mensal configurado.')
  }

  if (budgetRespected) {
    score += 2
    reasons.push('Orcamento dentro do limite.')
  }

  if (hasActiveGoal) {
    score += 1
    reasons.push('Missao ativa em andamento.')
  }

  if (hasMissionProgress) {
    score += 1
    reasons.push('Missao recebeu progresso neste mes.')
  }

  if (positiveHealth) {
    score += strongHealth ? 2 : 1
    reasons.push(strongHealth ? 'Saude financeira excelente no mes.' : 'Saude financeira positiva no mes.')
  }

  if (hasCompletedGoal) {
    score += 2
    reasons.push('Missao concluida fortalece o mundo.')
  }

  if (reasons.length === 0) {
    reasons.push('Ainda ha poucos sinais financeiros para evoluir o mundo.')
  }

  const tier = tierFromScore(score, hasOrganizedMonth, positiveHealth, hasCompletedGoal)
  return {
    tier,
    ...tierCopy[tier],
    reasons,
    nextHint: nextHint({
      hasEnoughRecords,
      hasBudget,
      budgetRespected,
      hasActiveGoal,
      hasMissionProgress,
      positiveHealth,
    }),
    score,
  }
}

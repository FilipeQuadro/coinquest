import type { BudgetProgress } from '../budget/budget'
import type { FinancialHealth } from '../health/financialHealth'
import type { MonthlyProjection } from '../projection/projection'
import type { FeaturedGoal, MonthlyCommitment } from '../summary/monthlyHighlights'

export type FinancialInsightKind = 'positive' | 'info' | 'attention' | 'warning'
export type FinancialInsightSource = 'health' | 'budget' | 'category' | 'recurring' | 'card' | 'projection' | 'goal' | 'data'

export interface FinancialInsight {
  id: string
  kind: FinancialInsightKind
  source: FinancialInsightSource
  title: string
  message: string
  priority: number
  amount?: number
  category?: string
}

export interface CategoryInsightInput {
  /**
   * Amount already aggregated by the finance layer for insight reading.
   * It must not include duplicate card invoice payments when card commitments
   * were already counted for the same spending signal.
   */
  category: string
  amount: number
}

export interface GoalInsightInput extends Partial<FeaturedGoal> {
  id: string
  name: string
  allocatedAmount: number
  targetAmount: number
  percentageDisplay: number
  completed?: boolean
  contributionsThisMonth?: number
}

export interface FinancialInsightsInput {
  transactionCount: number
  financialHealth?: Pick<FinancialHealth, 'level' | 'expenseRatio' | 'messageKey'> | null
  budget?: Pick<BudgetProgress, 'hasBudget' | 'percentageUsed' | 'isOverLimit' | 'overLimitAmount' | 'spent'> | null
  categories?: CategoryInsightInput[] | null
  commitments?: Pick<MonthlyCommitment, 'id' | 'kind' | 'label' | 'amount' | 'status' | 'dueDate'>[] | null
  projection?: Pick<MonthlyProjection, 'projectedNet' | 'projectedIncome' | 'projectedExpense'> | null
  goal?: GoalInsightInput | null
}

const LOW_DATA_TRANSACTION_LIMIT = 2
const CATEGORY_CONCENTRATION_SHARE = 0.5
const HIGH_CATEGORY_CONCENTRATION_SHARE = 0.7

function isPositiveFinite(value: number) {
  return Number.isFinite(value) && value > 0
}

function safeCount(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function addInsight(insights: FinancialInsight[], insight: FinancialInsight) {
  if (insights.some((item) => item.id === insight.id)) return
  insights.push(insight)
}

function deriveHealthInsight(health: FinancialInsightsInput['financialHealth']): FinancialInsight | null {
  if (!health) return null

  if (health.level === 'critical') {
    return {
      id: 'health:critical',
      kind: 'warning',
      source: 'health',
      title: 'Mes em estado critico',
      message: 'Os sinais financeiros do mes indicam uma situacao critica para acompanhar com atencao.',
      priority: 95,
    }
  }

  if (health.level === 'tight') {
    return {
      id: 'health:tight',
      kind: 'warning',
      source: 'health',
      title: 'Mes apertado',
      message: 'Os sinais financeiros do mes indicam pouca margem para acompanhar de perto.',
      priority: 90,
    }
  }

  if (health.level === 'attention') {
    return {
      id: 'health:attention',
      kind: 'attention',
      source: 'health',
      title: 'Acompanhe o ritmo do mes',
      message: 'Os sinais financeiros do mes pedem acompanhamento antes de novas decisoes.',
      priority: 75,
    }
  }

  return null
}

function deriveBudgetInsights(budget: FinancialInsightsInput['budget']): FinancialInsight[] {
  if (!budget?.hasBudget) return []

  if (budget.isOverLimit) {
    return [{
      id: 'budget:over-limit',
      kind: 'warning',
      source: 'budget',
      title: 'Orcamento ultrapassado',
      message: 'O limite de planejamento do mes foi ultrapassado.',
      priority: 100,
      amount: budget.overLimitAmount,
    }]
  }

  if (budget.percentageUsed !== null && Number.isFinite(budget.percentageUsed) && budget.percentageUsed >= 0.9) {
    return [{
      id: 'budget:near-limit',
      kind: 'attention',
      source: 'budget',
      title: 'Orcamento perto do limite',
      message: 'O uso do limite de planejamento esta perto de 100%.',
      priority: 80,
      amount: budget.spent,
    }]
  }

  return []
}

function deriveCategoryInsight(categories: CategoryInsightInput[] | null | undefined): FinancialInsight | null {
  const validCategories = (categories ?? [])
    .filter((item) => item.category.trim() && isPositiveFinite(item.amount))
    .map((item) => ({ category: item.category.trim(), amount: item.amount }))
  const total = validCategories.reduce((sum, item) => sum + item.amount, 0)
  if (total <= 0) return null

  const topCategory = [...validCategories].sort((a, b) => {
    const amountDiff = b.amount - a.amount
    if (amountDiff !== 0) return amountDiff
    return a.category.localeCompare(b.category, 'pt-BR', { sensitivity: 'base' })
  })[0]
  const share = topCategory.amount / total
  if (share < CATEGORY_CONCENTRATION_SHARE) return null

  const highConcentration = share >= HIGH_CATEGORY_CONCENTRATION_SHARE

  return {
    id: `category:concentrated:${topCategory.category.toLocaleLowerCase('pt-BR')}`,
    kind: highConcentration ? 'attention' : 'info',
    source: 'category',
    title: 'Categoria concentrada no mes',
    message: 'Uma categoria concentra parte relevante das despesas consideradas.',
    priority: highConcentration ? 62 : 45,
    amount: topCategory.amount,
    category: topCategory.category,
  }
}

function deriveCommitmentInsight(commitments: FinancialInsightsInput['commitments']): FinancialInsight | null {
  const sortedCommitments = [...(commitments ?? [])]
    .filter((commitment) => commitment.amount > 0)
    .sort((a, b) => {
      const statusDiff = Number(b.status === 'overdue') - Number(a.status === 'overdue')
      if (statusDiff !== 0) return statusDiff
      const dateDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      if (Number.isFinite(dateDiff) && dateDiff !== 0) return dateDiff
      return a.id.localeCompare(b.id)
    })

  const commitment = sortedCommitments[0]
  if (!commitment) return null

  const source = commitment.kind === 'card-invoice' ? 'card' : 'recurring'
  const overdue = commitment.status === 'overdue'

  return {
    id: `${source}:${overdue ? 'overdue' : 'pending'}:${commitment.id}`,
    kind: overdue ? 'warning' : 'attention',
    source,
    title: overdue ? 'Compromisso atrasado' : 'Compromisso em aberto',
    message: source === 'card'
      ? 'Ha uma fatura em aberto no planejamento do mes.'
      : 'Ha uma recorrencia em aberto no planejamento do mes.',
    priority: overdue ? (source === 'card' ? 86 : 84) : 65,
    amount: commitment.amount,
  }
}

function deriveProjectionInsight(projection: FinancialInsightsInput['projection']): FinancialInsight | null {
  if (!projection || !Number.isFinite(projection.projectedNet) || projection.projectedNet >= 0) return null

  return {
    id: 'projection:negative-month',
    kind: 'attention',
    source: 'projection',
    title: 'Projecao mensal negativa',
    message: 'A estimativa do mes fica negativa com os registros e compromissos atuais.',
    priority: 72,
    amount: Math.abs(projection.projectedNet),
  }
}

function deriveGoalInsight(goal: FinancialInsightsInput['goal']): FinancialInsight | null {
  if (!goal) return null

  if (goal.completed || goal.percentageDisplay >= 100) {
    return {
      id: `goal:completed:${goal.id}`,
      kind: 'positive',
      source: 'goal',
      title: 'Missao concluida',
      message: 'A alocacao registrada atingiu o objetivo da missao; isso nao registra uma compra.',
      priority: 50,
      amount: goal.allocatedAmount,
    }
  }

  if (goal.percentageDisplay > 0 || safeCount(goal.contributionsThisMonth ?? 0) > 0) {
    return {
      id: `goal:progress:${goal.id}`,
      kind: 'positive',
      source: 'goal',
      title: 'Missao com progresso',
      message: 'A missao tem alocacao registrada, sem criar transacao financeira.',
      priority: 35,
      amount: goal.allocatedAmount,
    }
  }

  return null
}

export function deriveFinancialInsights(input: FinancialInsightsInput): FinancialInsight[] {
  const insights: FinancialInsight[] = []
  const transactionCount = safeCount(input.transactionCount)

  if (transactionCount < LOW_DATA_TRANSACTION_LIMIT) {
    addInsight(insights, {
      id: 'data:low-signal',
      kind: 'info',
      source: 'data',
      title: 'Poucos dados no mes',
      message: 'Ainda ha poucos registros reais para uma leitura confiavel do mes.',
      priority: 10,
    })
  }

  const healthInsight = deriveHealthInsight(input.financialHealth)
  if (healthInsight) addInsight(insights, healthInsight)

  deriveBudgetInsights(input.budget).forEach((insight) => addInsight(insights, insight))

  const categoryInsight = deriveCategoryInsight(input.categories)
  if (categoryInsight) addInsight(insights, categoryInsight)

  const commitmentInsight = deriveCommitmentInsight(input.commitments)
  if (commitmentInsight) addInsight(insights, commitmentInsight)

  const projectionInsight = deriveProjectionInsight(input.projection)
  if (projectionInsight) addInsight(insights, projectionInsight)

  const goalInsight = deriveGoalInsight(input.goal)
  if (goalInsight) addInsight(insights, goalInsight)

  return insights.sort((a, b) => {
    const priorityDiff = b.priority - a.priority
    if (priorityDiff !== 0) return priorityDiff
    return a.id.localeCompare(b.id)
  })
}

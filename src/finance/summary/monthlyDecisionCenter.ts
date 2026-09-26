import type { FinancialInsight, FinancialInsightKind, FinancialInsightSource } from '../insights/financialInsights'
import type { MonthlyAction, MonthlyActionKind, MonthlyActionSource } from './monthlyActions'
import type { MonthlyHighlights } from './monthlyHighlights'
import type { MonthlyOverview } from './monthlyOverview'

export type MonthlyDecisionStatus = 'empty' | 'stable' | 'review' | 'attention'

export type MonthlyDecisionSource =
  | 'overview'
  | 'budget'
  | 'history'
  | 'recurring'
  | 'card'
  | 'projection'
  | 'goal'
  | 'insight'
  | 'data'

export type MonthlyDecisionKind = 'context' | 'review' | 'attention'

export interface MonthlyDecisionItem {
  id: string
  kind: MonthlyDecisionKind
  source: MonthlyDecisionSource
  title: string
  message: string
  destinationHash: string
  priority: number
}

export interface MonthlyDecisionReport {
  status: MonthlyDecisionStatus
  headline: string
  summaryMessage: string
  primaryItems: MonthlyDecisionItem[]
  secondaryItems: MonthlyDecisionItem[]
}

export interface MonthlyDecisionCenterInput {
  overview?: MonthlyOverview | null
  actions?: MonthlyAction[] | null
  highlights?: MonthlyHighlights | null
  insights?: FinancialInsight[] | null
  maxPrimaryItems?: number
}

interface MonthlyDecisionCandidate extends MonthlyDecisionItem {
  dedupeKey: string
}

const DEFAULT_PRIMARY_LIMIT = 3
const BUDGET_NEAR_LIMIT_THRESHOLD = 0.9

const ALLOWED_DESTINATION_HASHES = new Set([
  '#historico',
  '#orcamento',
  '#previsoes',
  '#cartoes',
  '#projecao',
  '#missoes',
  '#backup',
])

const statusCopy: Record<MonthlyDecisionStatus, Pick<MonthlyDecisionReport, 'headline' | 'summaryMessage'>> = {
  empty: {
    headline: 'Sem dados suficientes para revisar o mes',
    summaryMessage: 'Registre movimentacoes reais ou planos do mes para formar uma leitura local.',
  },
  stable: {
    headline: 'Mes com sinais estaveis',
    summaryMessage: 'Ha dados locais para acompanhar, sem ponto principal de atencao no momento.',
  },
  review: {
    headline: 'Pontos para revisar no mes',
    summaryMessage: 'Alguns sinais locais ajudam a orientar a revisao do mes.',
  },
  attention: {
    headline: 'Prioridades de atencao do mes',
    summaryMessage: 'Ha pontos do mes que vale revisar com calma antes de novas decisoes.',
  },
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasPositiveAmount(value: unknown) {
  return isFiniteNumber(value) && value > 0
}

function normalizePrimaryLimit(value: unknown) {
  if (!Number.isInteger(value) || Number(value) <= 0) return DEFAULT_PRIMARY_LIMIT
  return Number(value)
}

function compareDecisionItems(a: MonthlyDecisionItem, b: MonthlyDecisionItem) {
  const priorityDiff = b.priority - a.priority
  if (priorityDiff !== 0) return priorityDiff

  const sourceDiff = a.source.localeCompare(b.source)
  if (sourceDiff !== 0) return sourceDiff

  return a.id.localeCompare(b.id)
}

function decisionKindFromAction(kind: MonthlyActionKind): MonthlyDecisionKind {
  if (kind === 'warning' || kind === 'attention') return 'attention'
  return 'review'
}

function decisionKindFromInsight(kind: FinancialInsightKind): MonthlyDecisionKind {
  if (kind === 'warning' || kind === 'attention') return 'attention'
  if (kind === 'info') return 'review'
  return 'context'
}

function sourceFromAction(source: MonthlyActionSource): MonthlyDecisionSource {
  return source
}

function sourceFromInsight(source: FinancialInsightSource): MonthlyDecisionSource {
  if (
    source === 'budget' ||
    source === 'recurring' ||
    source === 'card' ||
    source === 'projection' ||
    source === 'goal' ||
    source === 'data'
  ) {
    return source
  }

  return 'insight'
}

function fallbackDestinationForSource(source: MonthlyDecisionSource) {
  switch (source) {
    case 'budget':
      return '#orcamento'
    case 'recurring':
      return '#previsoes'
    case 'card':
      return '#cartoes'
    case 'projection':
      return '#projecao'
    case 'goal':
      return '#missoes'
    case 'data':
      return '#backup'
    case 'history':
    case 'insight':
    case 'overview':
    default:
      return '#historico'
  }
}

function normalizeDestinationHash(destinationHash: string | undefined, source: MonthlyDecisionSource) {
  if (destinationHash && ALLOWED_DESTINATION_HASHES.has(destinationHash)) return destinationHash
  return fallbackDestinationForSource(source)
}

function titleForSource(source: MonthlyDecisionSource, kind: MonthlyDecisionKind) {
  switch (source) {
    case 'budget':
      return 'Revisar planejamento do mes'
    case 'recurring':
      return 'Conferir compromissos previstos'
    case 'card':
      return 'Revisar faturas do cartao'
    case 'projection':
      return 'Revisar estimativa do mes'
    case 'goal':
      return 'Acompanhar missoes'
    case 'history':
      return 'Revisar movimentacoes reais'
    case 'data':
      return 'Revisar dados locais'
    case 'insight':
      return kind === 'attention' ? 'Ponto de atencao do mes' : 'Leitura do mes'
    case 'overview':
    default:
      return 'Acompanhar o mes'
  }
}

function messageForSource(source: MonthlyDecisionSource, kind: MonthlyDecisionKind) {
  switch (source) {
    case 'budget':
      return 'Veja se os limites planejados ainda fazem sentido para este mes.'
    case 'recurring':
      return 'Revise o que ainda e previsto antes de confirmar como movimento real.'
    case 'card':
      return 'Compras no cartao aparecem como compromisso; pagamento de fatura e movimento real.'
    case 'projection':
      return 'A estimativa indica um ponto para conferir junto dos itens previstos.'
    case 'goal':
      return 'Veja o progresso das alocacoes sem criar movimento real automaticamente.'
    case 'history':
      return 'Acompanhe as movimentacoes reais registradas neste mes.'
    case 'data':
      return 'Revise sinais locais e backups sem depender de sincronizacao em nuvem.'
    case 'insight':
      return kind === 'attention'
        ? 'Ha um sinal local que vale revisar no contexto do mes.'
        : 'Ha uma leitura local para acompanhar no mes.'
    case 'overview':
    default:
      return 'Use os dados locais para acompanhar o mes com calma.'
  }
}

function dedupeKeyForSource(source: MonthlyDecisionSource, id: string) {
  if (source === 'insight') return `insight:${id.split(':')[0]}`
  return source
}

function createCandidate(
  item: MonthlyDecisionItem,
  dedupeKey = dedupeKeyForSource(item.source, item.id),
): MonthlyDecisionCandidate {
  return {
    ...item,
    destinationHash: normalizeDestinationHash(item.destinationHash, item.source),
    dedupeKey,
  }
}

function candidatesFromOverview(overview: MonthlyOverview | null | undefined): MonthlyDecisionCandidate[] {
  if (!overview) return []

  const candidates: MonthlyDecisionCandidate[] = []

  if (overview.actual.transactionCount > 0) {
    candidates.push(createCandidate({
      id: 'overview:movements',
      kind: 'context',
      source: 'history',
      title: titleForSource('history', 'context'),
      message: messageForSource('history', 'context'),
      destinationHash: '#historico',
      priority: 20,
    }, 'history'))
  }

  if (!overview.budget.hasBudget) {
    candidates.push(createCandidate({
      id: 'overview:budget-missing',
      kind: 'review',
      source: 'budget',
      title: titleForSource('budget', 'review'),
      message: messageForSource('budget', 'review'),
      destinationHash: '#orcamento',
      priority: 48,
    }, 'budget'))
  } else if (overview.budget.isOverLimit) {
    candidates.push(createCandidate({
      id: 'overview:budget-over-limit',
      kind: 'attention',
      source: 'budget',
      title: titleForSource('budget', 'attention'),
      message: messageForSource('budget', 'attention'),
      destinationHash: '#orcamento',
      priority: 88,
    }, 'budget'))
  } else if (
    isFiniteNumber(overview.budget.percentageUsed) &&
    overview.budget.percentageUsed >= BUDGET_NEAR_LIMIT_THRESHOLD
  ) {
    candidates.push(createCandidate({
      id: 'overview:budget-near-limit',
      kind: 'attention',
      source: 'budget',
      title: titleForSource('budget', 'attention'),
      message: messageForSource('budget', 'attention'),
      destinationHash: '#orcamento',
      priority: 64,
    }, 'budget'))
  }

  if (hasPositiveAmount(overview.outlook.plannedRecurringExpense)) {
    candidates.push(createCandidate({
      id: 'overview:recurring-planned',
      kind: 'review',
      source: 'recurring',
      title: titleForSource('recurring', 'review'),
      message: messageForSource('recurring', 'review'),
      destinationHash: '#previsoes',
      priority: 58,
    }, 'recurring'))
  }

  if (hasPositiveAmount(overview.outlook.committedCardExpense)) {
    candidates.push(createCandidate({
      id: 'overview:card-commitment',
      kind: 'review',
      source: 'card',
      title: titleForSource('card', 'review'),
      message: messageForSource('card', 'review'),
      destinationHash: '#cartoes',
      priority: 62,
    }, 'card'))
  }

  if (isFiniteNumber(overview.outlook.projectedNet) && overview.outlook.projectedNet < 0) {
    candidates.push(createCandidate({
      id: 'overview:projection-negative',
      kind: 'attention',
      source: 'projection',
      title: titleForSource('projection', 'attention'),
      message: messageForSource('projection', 'attention'),
      destinationHash: '#projecao',
      priority: 68,
    }, 'projection'))
  }

  return candidates
}

function candidatesFromActions(actions: MonthlyAction[] | null | undefined): MonthlyDecisionCandidate[] {
  return (actions ?? []).map((action) => {
    const source = sourceFromAction(action.source)
    const kind = decisionKindFromAction(action.kind)

    return createCandidate({
      id: `action:${action.id}`,
      kind,
      source,
      title: titleForSource(source, kind),
      message: messageForSource(source, kind),
      destinationHash: action.destinationHash,
      priority: action.priority,
    }, source)
  })
}

function candidatesFromHighlights(highlights: MonthlyHighlights | null | undefined): MonthlyDecisionCandidate[] {
  if (!highlights) return []

  const candidates: MonthlyDecisionCandidate[] = []

  for (const commitment of highlights.commitments) {
    const source: MonthlyDecisionSource = commitment.kind === 'card-invoice' ? 'card' : 'recurring'
    const kind: MonthlyDecisionKind = commitment.status === 'overdue' ? 'attention' : 'review'
    const priority = commitment.status === 'overdue'
      ? (source === 'card' ? 84 : 79)
      : (source === 'card' ? 76 : 72)

    candidates.push(createCandidate({
      id: `highlight:${commitment.kind}:${commitment.id}`,
      kind,
      source,
      title: titleForSource(source, kind),
      message: messageForSource(source, kind),
      destinationHash: fallbackDestinationForSource(source),
      priority,
    }, source))
  }

  if (highlights.featuredGoal) {
    candidates.push(createCandidate({
      id: `highlight:goal:${highlights.featuredGoal.id}`,
      kind: 'review',
      source: 'goal',
      title: titleForSource('goal', 'review'),
      message: messageForSource('goal', 'review'),
      destinationHash: '#missoes',
      priority: 42,
    }, 'goal'))
  }

  return candidates
}

function candidatesFromInsights(insights: FinancialInsight[] | null | undefined): MonthlyDecisionCandidate[] {
  return (insights ?? []).map((insight) => {
    const source = sourceFromInsight(insight.source)
    const kind = decisionKindFromInsight(insight.kind)
    const dedupeKey = insight.source === 'category' || insight.source === 'health'
      ? `insight:${insight.source}`
      : source

    return createCandidate({
      id: `insight:${insight.id}`,
      kind,
      source,
      title: titleForSource(source, kind),
      message: messageForSource(source, kind),
      destinationHash: fallbackDestinationForInsight(insight.source),
      priority: insight.priority,
    }, dedupeKey)
  })
}

function fallbackDestinationForInsight(source: FinancialInsightSource) {
  switch (source) {
    case 'budget':
      return '#orcamento'
    case 'recurring':
      return '#previsoes'
    case 'card':
      return '#cartoes'
    case 'projection':
      return '#projecao'
    case 'goal':
      return '#missoes'
    case 'data':
      return '#backup'
    case 'category':
    case 'health':
    default:
      return '#historico'
  }
}

function dedupeCandidates(candidates: MonthlyDecisionCandidate[]): MonthlyDecisionItem[] {
  const sorted = [...candidates].sort(compareDecisionItems)
  const byKey = new Map<string, MonthlyDecisionCandidate>()

  for (const candidate of sorted) {
    if (!byKey.has(candidate.dedupeKey)) {
      byKey.set(candidate.dedupeKey, candidate)
    }
  }

  return [...byKey.values()]
    .map(({ dedupeKey: _dedupeKey, ...item }) => item)
    .sort(compareDecisionItems)
}

function hasRelevantOverviewData(overview: MonthlyOverview | null | undefined) {
  if (!overview) return false
  if (overview.actual.transactionCount > 0) return true
  if (!overview.budget.hasBudget) return true
  if (overview.budget.hasBudget) return true
  if (hasPositiveAmount(overview.outlook.plannedRecurringIncome)) return true
  if (hasPositiveAmount(overview.outlook.plannedRecurringExpense)) return true
  if (hasPositiveAmount(overview.outlook.committedCardExpense)) return true
  if (hasPositiveAmount(overview.outlook.projectedIncome)) return true
  if (hasPositiveAmount(overview.outlook.projectedExpense)) return true
  return isFiniteNumber(overview.outlook.projectedNet) && overview.outlook.projectedNet !== 0
}

function hasRelevantInput(input: MonthlyDecisionCenterInput) {
  if (hasRelevantOverviewData(input.overview)) return true
  if ((input.actions ?? []).length > 0) return true
  if ((input.insights ?? []).length > 0) return true
  if ((input.highlights?.commitments ?? []).length > 0) return true
  return Boolean(input.highlights?.featuredGoal)
}

function statusFromItems(items: MonthlyDecisionItem[], hasData: boolean): MonthlyDecisionStatus {
  if (!hasData) return 'empty'
  if (items.some((item) => item.kind === 'attention')) return 'attention'
  if (items.some((item) => item.kind === 'review')) return 'review'
  return 'stable'
}

export function buildMonthlyDecisionReport(input: MonthlyDecisionCenterInput): MonthlyDecisionReport {
  const hasData = hasRelevantInput(input)

  if (!hasData) {
    return {
      status: 'empty',
      ...statusCopy.empty,
      primaryItems: [],
      secondaryItems: [],
    }
  }

  const items = dedupeCandidates([
    ...candidatesFromOverview(input.overview),
    ...candidatesFromActions(input.actions),
    ...candidatesFromHighlights(input.highlights),
    ...candidatesFromInsights(input.insights),
  ])

  const primaryLimit = normalizePrimaryLimit(input.maxPrimaryItems)
  const status = statusFromItems(items, hasData)

  return {
    status,
    ...statusCopy[status],
    primaryItems: items.slice(0, primaryLimit),
    secondaryItems: items.slice(primaryLimit),
  }
}

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { formatMonthYear, type SelectedMonth } from '../finance/month'
import { buildMonthlyHighlights } from '../finance/summary/monthlyHighlights'
import { buildMonthlyOverview } from '../finance/summary/monthlyOverview'
import { formatBRL } from '../lib/money'

interface MonthlyOverviewPanelProps {
  selectedMonth: SelectedMonth
}

function formatPercent(value: number | null) {
  if (value === null) return 'Sem orcamento'
  if (!Number.isFinite(value)) return 'Acima do limite'
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value * 100)}%`
}

function budgetTone(percentageUsed: number | null) {
  if (percentageUsed === null) return 'unknown'
  if (!Number.isFinite(percentageUsed) || percentageUsed > 1) return 'critical'
  if (percentageUsed >= 0.9) return 'tight'
  if (percentageUsed >= 0.75) return 'attention'
  return 'healthy'
}

function barWidth(percentageUsed: number | null) {
  if (percentageUsed === null) return 0
  if (!Number.isFinite(percentageUsed)) return 100
  return Math.max(0, Math.min(percentageUsed * 100, 100))
}

function valueTone(value: number) {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'neutral'
}

function formatShortDate(isoDate: string) {
  const date = new Date(isoDate)
  if (!Number.isFinite(date.getTime())) return '--/--'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date)
}

export function MonthlyOverviewPanel({ selectedMonth }: MonthlyOverviewPanelProps) {
  const overviewData = useLiveQuery(async () => {
    const [
      transactions,
      recurringRules,
      recurringOverrides,
      creditCards,
      cardPurchases,
      cardInvoicePayments,
      monthlyBudget,
      goals,
      goalContributions,
    ] = await Promise.all([
      db.transactions.toArray(),
      db.recurringRules.toArray(),
      db.recurringOccurrenceOverrides.where('[year+month]').equals([selectedMonth.year, selectedMonth.month]).toArray(),
      db.creditCards.toArray(),
      db.cardPurchases.toArray(),
      db.cardInvoicePayments.toArray(),
      db.monthlyBudgets.where('[year+month]').equals([selectedMonth.year, selectedMonth.month]).first(),
      db.goals.toArray(),
      db.goalContributions.toArray(),
    ])

    return {
      transactions,
      recurringRules,
      recurringOverrides,
      creditCards,
      cardPurchases,
      cardInvoicePayments,
      monthlyBudget: monthlyBudget ?? null,
      goals,
      goalContributions,
    }
  }, [selectedMonth.year, selectedMonth.month])

  const summary = useMemo(() => {
    if (!overviewData) return null

    const overview = buildMonthlyOverview({
      selectedMonth,
      transactions: overviewData.transactions,
      recurringRules: overviewData.recurringRules,
      recurringOverrides: overviewData.recurringOverrides,
      creditCards: overviewData.creditCards,
      cardPurchases: overviewData.cardPurchases,
      cardInvoicePayments: overviewData.cardInvoicePayments,
      monthlyBudget: overviewData.monthlyBudget,
    })

    const highlights = buildMonthlyHighlights({
      selectedMonth,
      transactions: overviewData.transactions,
      recurringRules: overviewData.recurringRules,
      recurringOverrides: overviewData.recurringOverrides,
      creditCards: overviewData.creditCards,
      cardPurchases: overviewData.cardPurchases,
      cardInvoicePayments: overviewData.cardInvoicePayments,
      goals: overviewData.goals,
      goalContributions: overviewData.goalContributions,
    })

    return { overview, highlights }
  }, [overviewData, selectedMonth])

  if (!summary) {
    return (
      <section className="panel monthly-overview" aria-busy="true" aria-live="polite">
        <div className="monthly-overview-head">
          <div>
            <span className="eyebrow">CENTRAL DO MES</span>
            <h2>{formatMonthYear(selectedMonth)}</h2>
          </div>
        </div>
        <div className="monthly-overview-loading">Carregando resumo do mes...</div>
      </section>
    )
  }

  const { overview, highlights } = summary
  const tone = budgetTone(overview.budget.percentageUsed)
  const percentLabel = formatPercent(overview.budget.percentageUsed)
  const budgetUsageLabel = `Uso do orcamento: ${percentLabel}`
  const budgetAriaNow = overview.budget.percentageUsed === null
    ? undefined
    : Math.round(barWidth(overview.budget.percentageUsed))
  const featuredGoalPercent = highlights.featuredGoal?.percentageDisplay ?? 0

  return (
    <section className="panel monthly-overview" aria-labelledby="monthly-overview-title" data-testid="monthly-overview-panel">
      <div className="monthly-overview-head">
        <div>
          <span className="eyebrow">CENTRAL DO MES</span>
          <h2 id="monthly-overview-title">{formatMonthYear(overview.month)}</h2>
        </div>
        <span className="monthly-overview-chip">Realizado + outlook</span>
      </div>

      <div className="monthly-overview-grid">
        <article className={`monthly-overview-hero tone-${valueTone(overview.actual.net)}`}>
          <span>Resultado realizado</span>
          <strong data-testid="summary-balance">{formatBRL(overview.actual.net)}</strong>
          <p>Dinheiro que realmente entrou e saiu neste mes selecionado.</p>
        </article>

        <article className="monthly-overview-metrics" aria-label="Metricas realizadas">
          <div>
            <span>Receitas</span>
            <strong className="income" data-testid="summary-income">{formatBRL(overview.actual.income)}</strong>
          </div>
          <div>
            <span>Despesas</span>
            <strong className="expense" data-testid="summary-expenses">{formatBRL(overview.actual.expenses)}</strong>
          </div>
          <div>
            <span>Registros</span>
            <strong data-testid="summary-count">{overview.actual.transactionCount}</strong>
          </div>
        </article>

        <article className={`monthly-overview-budget tone-${tone}`}>
          <div className="monthly-overview-card-title">
            <div>
              <span className="eyebrow">ORCAMENTO</span>
              <h3>Plano do mes</h3>
            </div>
            {overview.budget.hasBudget ? <strong>{percentLabel}</strong> : null}
          </div>

          {overview.budget.hasBudget ? (
            <>
              <div
                className="budget-progress monthly-overview-budget-bar"
                role="meter"
                aria-label={budgetUsageLabel}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={budgetAriaNow}
              >
                <span style={{ width: `${barWidth(overview.budget.percentageUsed)}%` }} />
              </div>
              <div className="budget-meta">
                <span>Usado {formatBRL(overview.budget.spent)}</span>
                <span>Limite {formatBRL(overview.budget.limit)}</span>
                <span>
                  {overview.budget.isOverLimit
                    ? `Passou ${formatBRL(overview.budget.overLimitAmount)}`
                    : `Restam ${formatBRL(overview.budget.remaining)}`}
                </span>
              </div>
            </>
          ) : (
            <div className="monthly-overview-empty">
              <p>Sem orcamento definido para este mes.</p>
              <a className="button ghost compact" href="#orcamento">Ir para orcamento</a>
            </div>
          )}
        </article>

        <article className="monthly-overview-outlook">
          <div className="monthly-overview-card-title">
            <div>
              <span className="eyebrow">OUTLOOK</span>
              <h3>Visao ate o fim do mes</h3>
            </div>
          </div>
          <div className="monthly-overview-outlook-grid">
            <div>
              <span>Receitas previstas</span>
              <strong className="income">{formatBRL(overview.outlook.plannedRecurringIncome)}</strong>
            </div>
            <div>
              <span>Recorrencias previstas</span>
              <strong className="expense">{formatBRL(overview.outlook.plannedRecurringExpense)}</strong>
            </div>
            <div>
              <span>Cartao comprometido</span>
              <strong className="expense">{formatBRL(overview.outlook.committedCardExpense)}</strong>
            </div>
            <div>
              <span>Resultado projetado</span>
              <strong
                className={`monthly-overview-projected tone-${valueTone(overview.outlook.projectedNet)}`}
                data-testid="monthly-overview-projected-net"
              >
                {formatBRL(overview.outlook.projectedNet)}
              </strong>
            </div>
          </div>
        </article>

        <article className="monthly-overview-commitments">
          <div className="monthly-overview-card-title">
            <div>
              <span className="eyebrow">PROXIMOS COMPROMISSOS</span>
              <h3>Agenda financeira</h3>
            </div>
          </div>

          {highlights.commitments.length > 0 ? (
            <div className="monthly-overview-commitment-list">
              {highlights.commitments.map((commitment) => (
                <div className={`monthly-overview-commitment status-${commitment.status}`} key={commitment.id}>
                  <div>
                    <strong>{commitment.label}</strong>
                    <span>
                      {formatShortDate(commitment.dueDate)} · {formatBRL(commitment.amount)}
                    </span>
                  </div>
                  {commitment.status === 'overdue' && <span className="commitment-status">ATRASADO</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="monthly-overview-empty-text">Nenhum compromisso pendente neste mes.</p>
          )}
        </article>

        <article className="monthly-overview-featured-goal">
          <div className="monthly-overview-card-title">
            <div>
              <span className="eyebrow">META EM DESTAQUE</span>
              <h3>{highlights.featuredGoal ? highlights.featuredGoal.name : 'Nenhuma meta ativa'}</h3>
            </div>
            {highlights.featuredGoal && <strong>{formatPercent(featuredGoalPercent / 100)}</strong>}
          </div>

          {highlights.featuredGoal ? (
            <>
              <div
                className="goal-progress monthly-overview-goal-progress"
                aria-label={`Progresso da meta em destaque: ${formatPercent(featuredGoalPercent / 100)}`}
              >
                <span style={{ width: `${featuredGoalPercent}%` }} />
              </div>
              <div className="monthly-overview-goal-meta">
                <span>
                  {formatBRL(highlights.featuredGoal.allocatedAmount)} de {formatBRL(highlights.featuredGoal.targetAmount)}
                </span>
                <span>Faltam {formatBRL(highlights.featuredGoal.remainingAmount)}</span>
              </div>
              <a className="button ghost compact" href="#missoes">Ver metas</a>
            </>
          ) : (
            <div className="monthly-overview-empty">
              <p>Nenhuma meta ativa.</p>
              <a className="button ghost compact" href="#missoes">Ver metas</a>
            </div>
          )}
        </article>
      </div>
    </section>
  )
}

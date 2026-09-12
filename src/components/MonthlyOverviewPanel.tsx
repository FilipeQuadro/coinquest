import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { formatMonthYear, type SelectedMonth } from '../finance/month'
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
    ] = await Promise.all([
      db.transactions.toArray(),
      db.recurringRules.toArray(),
      db.recurringOccurrenceOverrides.where('[year+month]').equals([selectedMonth.year, selectedMonth.month]).toArray(),
      db.creditCards.toArray(),
      db.cardPurchases.toArray(),
      db.cardInvoicePayments.toArray(),
      db.monthlyBudgets.where('[year+month]').equals([selectedMonth.year, selectedMonth.month]).first(),
    ])

    return {
      transactions,
      recurringRules,
      recurringOverrides,
      creditCards,
      cardPurchases,
      cardInvoicePayments,
      monthlyBudget: monthlyBudget ?? null,
    }
  }, [selectedMonth.year, selectedMonth.month])

  const overview = useMemo(() => {
    if (!overviewData) return null

    return buildMonthlyOverview({
      selectedMonth,
      transactions: overviewData.transactions,
      recurringRules: overviewData.recurringRules,
      recurringOverrides: overviewData.recurringOverrides,
      creditCards: overviewData.creditCards,
      cardPurchases: overviewData.cardPurchases,
      cardInvoicePayments: overviewData.cardInvoicePayments,
      monthlyBudget: overviewData.monthlyBudget,
    })
  }, [overviewData, selectedMonth])

  if (!overview) {
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

  const tone = budgetTone(overview.budget.percentageUsed)
  const percentLabel = formatPercent(overview.budget.percentageUsed)
  const budgetUsageLabel = `Uso do orcamento: ${percentLabel}`
  const budgetAriaNow = overview.budget.percentageUsed === null
    ? undefined
    : Math.round(barWidth(overview.budget.percentageUsed))

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
          <strong data-testid="monthly-overview-actual-net">{formatBRL(overview.actual.net)}</strong>
          <p>Dinheiro que realmente entrou e saiu neste mes selecionado.</p>
        </article>

        <article className="monthly-overview-metrics" aria-label="Metricas realizadas">
          <div>
            <span>Receitas</span>
            <strong className="income">{formatBRL(overview.actual.income)}</strong>
          </div>
          <div>
            <span>Despesas</span>
            <strong className="expense">{formatBRL(overview.actual.expenses)}</strong>
          </div>
          <div>
            <span>Registros</span>
            <strong>{overview.actual.transactionCount}</strong>
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
      </div>
    </section>
  )
}

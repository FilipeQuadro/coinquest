import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { addMonths, formatMonthYear, type SelectedMonth } from '../finance/month'
import { projectMonths, type MonthlyProjection } from '../finance/projection/projection'
import { formatBRL } from '../lib/money'

const horizonOptions = [3, 6, 12] as const

interface ProjectionPanelProps {
  selectedMonth: SelectedMonth
}

function formatShortMonth(month: SelectedMonth) {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
    .format(new Date(month.year, month.month, 1, 12))
    .replace('.', '')
    .toUpperCase()

  return `${label}/${String(month.year).slice(-2)}`
}

function projectionTone(value: number) {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'neutral'
}

function monthHasNoData(month: MonthlyProjection) {
  return month.actualIncome === 0
    && month.actualExpense === 0
    && month.plannedRecurringIncome === 0
    && month.plannedRecurringExpense === 0
    && month.committedCardExpense === 0
}

export function ProjectionPanel({ selectedMonth }: ProjectionPanelProps) {
  const [horizon, setHorizon] = useState<(typeof horizonOptions)[number]>(6)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const recurringRules = useLiveQuery(() => db.recurringRules.toArray(), [])
  const recurringOverrides = useLiveQuery(() => db.recurringOccurrenceOverrides.toArray(), [])
  const creditCards = useLiveQuery(() => db.creditCards.toArray(), [])
  const cardPurchases = useLiveQuery(() => db.cardPurchases.toArray(), [])
  const cardInvoicePayments = useLiveQuery(() => db.cardInvoicePayments.toArray(), [])
  const monthlyBudgets = useLiveQuery(() => db.monthlyBudgets.toArray(), [])

  useEffect(() => {
    setSelectedIndex(0)
  }, [selectedMonth.year, selectedMonth.month, horizon])

  const loaded = transactions
    && recurringRules
    && recurringOverrides
    && creditCards
    && cardPurchases
    && cardInvoicePayments
    && monthlyBudgets

  const projectionState = useMemo(() => {
    if (!loaded) return { projection: null, error: '' }

    try {
      return {
        projection: projectMonths(selectedMonth, horizon, {
          transactions,
          recurringRules,
          recurringOverrides,
          creditCards,
          cardPurchases,
          cardInvoicePayments,
          monthlyBudgets,
        }),
        error: '',
      }
    } catch (error) {
      return {
        projection: null,
        error: error instanceof Error ? error.message : 'N\u00e3o foi poss\u00edvel calcular a proje\u00e7\u00e3o.',
      }
    }
  }, [
    loaded,
    transactions,
    recurringRules,
    recurringOverrides,
    creditCards,
    cardPurchases,
    cardInvoicePayments,
    monthlyBudgets,
    selectedMonth,
    horizon,
  ])

  const projection = projectionState.projection
  const selectedProjection = projection?.months[selectedIndex] ?? null
  const periodEnd = addMonths(selectedMonth, horizon - 1)
  const positiveMonths = projection?.months.filter((month) => month.projectedNet > 0).length ?? 0
  const negativeMonths = projection?.months.filter((month) => month.projectedNet < 0).length ?? 0
  const maxAbsNet = Math.max(1, ...(projection?.months.map((month) => Math.abs(month.projectedNet)) ?? [0]))

  return (
    <section className="panel projection-panel" data-testid="projection-panel" aria-labelledby="projection-title">
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">{'PROJE\u00c7\u00c3O'}</span>
          <h2 id="projection-title">{'Proje\u00e7\u00e3o dos pr\u00f3ximos meses'}</h2>
          <p className="muted">{'Estimativa baseada nos lan\u00e7amentos, recorr\u00eancias e compromissos cadastrados.'}</p>
        </div>
        <label className="projection-horizon">
          Horizonte
          <select
            data-testid="projection-horizon"
            value={horizon}
            onChange={(event) => setHorizon(Number(event.target.value) as typeof horizon)}
          >
            {horizonOptions.map((option) => (
              <option key={option} value={option}>{option} meses</option>
            ))}
          </select>
        </label>
      </div>

      {!loaded && <div className="empty-state" data-testid="projection-loading">{'Carregando proje\u00e7\u00e3o...'}</div>}

      {projectionState.error && (
        <div className="message error" data-testid="projection-error">{projectionState.error}</div>
      )}

      {projection && selectedProjection && (
        <>
          <div className="projection-summary">
            <article>
              <span>{'PER\u00cdODO'}</span>
              <strong data-testid="projection-period">{formatShortMonth(selectedMonth)} {'->'} {formatShortMonth(periodEnd)}</strong>
            </article>
            <article>
              <span>{'RESULTADO ACUMULADO DO PER\u00cdODO'}</span>
              <strong data-testid="projection-cumulative" className={projection.totalProjectedNet >= 0 ? 'income' : 'expense'}>
                {formatBRL(projection.totalProjectedNet)}
              </strong>
              <small>{'Soma dos resultados mensais projetados. N\u00e3o representa o saldo da sua conta.'}</small>
            </article>
            <article>
              <span>MESES</span>
              <strong data-testid="projection-month-counts">{positiveMonths} positivos / {negativeMonths} negativos</strong>
            </article>
          </div>

          <div className="projection-chart" role="img" aria-label="Gr\u00e1fico de barras do resultado projetado por m\u00eas">
            <div className="projection-zero-line" aria-hidden="true" />
            {projection.months.map((month, index) => {
              const height = `${Math.max(5, Math.round((Math.abs(month.projectedNet) / maxAbsNet) * 46))}%`
              const tone = projectionTone(month.projectedNet)
              return (
                <button
                  key={`${month.year}-${month.month}`}
                  className={`projection-bar ${tone} ${index === selectedIndex ? 'active' : ''}`}
                  type="button"
                  data-testid="projection-bar"
                  aria-pressed={index === selectedIndex}
                  aria-label={`${formatMonthYear(month)}: resultado projetado ${formatBRL(month.projectedNet)}`}
                  onClick={() => setSelectedIndex(index)}
                >
                  <span className="projection-bar-track">
                    <span style={{ height }} />
                  </span>
                  <strong>{formatShortMonth(month)}</strong>
                  <small>{month.projectedNet < 0 ? 'negativo' : month.projectedNet > 0 ? 'positivo' : 'zero'}</small>
                </button>
              )
            })}
          </div>

          <div className="projection-timeline" aria-label="Meses projetados">
            {projection.months.map((month, index) => (
              <button
                key={`${month.year}-${month.month}`}
                className={`projection-month-card ${projectionTone(month.projectedNet)} ${index === selectedIndex ? 'active' : ''}`}
                type="button"
                data-testid="projection-month-card"
                aria-pressed={index === selectedIndex}
                onClick={() => setSelectedIndex(index)}
              >
                <span>{formatShortMonth(month)}</span>
                <strong>{formatBRL(month.projectedNet)}</strong>
                <small>{month.projectedNet < 0 ? 'Resultado projetado negativo' : month.projectedNet > 0 ? 'Resultado projetado positivo' : 'Resultado projetado zero'}</small>
              </button>
            ))}
          </div>

          <div className="projection-breakdown" data-testid="projection-breakdown">
            <div className="panel-title-row">
              <div>
                <span className="eyebrow">{formatMonthYear(selectedProjection)}</span>
                <h3>Resultado projetado</h3>
              </div>
              <strong className={selectedProjection.projectedNet >= 0 ? 'income' : 'expense'} data-testid="projection-selected-net">
                {formatBRL(selectedProjection.projectedNet)}
              </strong>
            </div>

            {monthHasNoData(selectedProjection) && (
              <p className="message info" data-testid="projection-empty-month">{'Sem movimenta\u00e7\u00f5es ou compromissos cadastrados.'}</p>
            )}

            <div className="projection-breakdown-grid">
              <article>
                <span>REALIZADO</span>
                <div><small>Receitas</small><strong>{formatBRL(selectedProjection.actualIncome)}</strong></div>
                <div><small>Despesas</small><strong>{formatBRL(selectedProjection.actualExpense)}</strong></div>
              </article>
              <article>
                <span>PREVISTO RESTANTE</span>
                <div><small>Receitas recorrentes</small><strong>{formatBRL(selectedProjection.plannedRecurringIncome)}</strong></div>
                <div><small>Despesas recorrentes</small><strong>{formatBRL(selectedProjection.plannedRecurringExpense)}</strong></div>
                <div><small>{'Compromissos do cart\u00e3o'}</small><strong>{formatBRL(selectedProjection.committedCardExpense)}</strong></div>
              </article>
              <article>
                <span>LEITURA</span>
                <div><small>Receita projetada</small><strong>{formatBRL(selectedProjection.projectedIncome)}</strong></div>
                <div><small>Despesa projetada</small><strong>{formatBRL(selectedProjection.projectedExpense)}</strong></div>
                {selectedProjection.budgetLimit !== undefined && (
                  <div><small>{'Or\u00e7amento de refer\u00eancia'}</small><strong>{formatBRL(selectedProjection.budgetLimit)}</strong></div>
                )}
              </article>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

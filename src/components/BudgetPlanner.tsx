import { useEffect, useState, type FormEvent } from 'react'
import { hasEquivalentCategory } from '../lib/categories'
import { useCategoryOptions } from '../lib/useCategoryOptions'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import {
  calculateBudgetProgress,
  calculateCategoryBudgetProgress,
  deleteBudgetPlan,
  deleteCategoryBudget,
  parseBudgetLimit,
  saveCategoryBudget,
  saveMonthlyBudget,
} from '../finance/budget/budget'
import { buildCreditCardInvoices, getCommittedCardExpenses } from '../finance/cards/cards'
import type { SelectedMonth } from '../finance/month'
import { formatMonthYear } from '../finance/month'
import { formatBRL } from '../lib/money'

function formatPercent(value: number | null) {
  if (value === null) return 'Sem orcamento'
  if (!Number.isFinite(value)) return 'Acima do limite'
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value * 100) + '%'
}

function progressTone(percentageUsed: number | null) {
  if (percentageUsed === null) return 'unknown'
  if (!Number.isFinite(percentageUsed) || percentageUsed > 1) return 'critical'
  if (percentageUsed >= 0.9) return 'tight'
  if (percentageUsed >= 0.75) return 'attention'
  return 'healthy'
}

interface BudgetPlannerProps {
  selectedMonth: SelectedMonth
}

export function BudgetPlanner({ selectedMonth }: BudgetPlannerProps) {
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [])
  const budget = useLiveQuery(
    () => db.monthlyBudgets.where('[year+month]').equals([selectedMonth.year, selectedMonth.month]).first(),
    [selectedMonth.year, selectedMonth.month],
  )
  const categoryBudgets = useLiveQuery(
    () => db.categoryBudgets.where('[year+month]').equals([selectedMonth.year, selectedMonth.month]).sortBy('category'),
    [selectedMonth.year, selectedMonth.month],
    [],
  )
  const cards = useLiveQuery(() => db.creditCards.toArray(), [], [])
  const cardPurchases = useLiveQuery(() => db.cardPurchases.toArray(), [], [])
  const cardPayments = useLiveQuery(() => db.cardInvoicePayments.toArray(), [], [])
  const [totalLimit, setTotalLimit] = useState('')
  const [category, setCategory] = useState('Alimentacao')
  const categories = useCategoryOptions('budget')
  const [categoryLimit, setCategoryLimit] = useState('')
  const [error, setError] = useState('')
  const cardInvoices = buildCreditCardInvoices(cards, cardPurchases, cardPayments, selectedMonth, transactions)
  const committedCardExpenses = getCommittedCardExpenses(cardInvoices)
  const progress = calculateBudgetProgress(budget, transactions, selectedMonth, committedCardExpenses)
  const categoryProgress = calculateCategoryBudgetProgress(categoryBudgets, transactions, selectedMonth, committedCardExpenses)
  const tone = progressTone(progress.percentageUsed)
  const barWidth = progress.percentageUsed === null
    ? 0
    : Math.max(0, Math.min(100, Number.isFinite(progress.percentageUsed) ? progress.percentageUsed * 100 : 100))

  useEffect(() => {
    if (categories[0] && !hasEquivalentCategory(categories, category)) setCategory(categories[0])
  }, [categories, category])

  async function saveTotal(event: FormEvent) {
    event.preventDefault()
    const parsed = parseBudgetLimit(totalLimit)

    if (parsed === null) {
      setError('Informe um orcamento valido, como R$ 1000,00.')
      return
    }

    await saveMonthlyBudget(selectedMonth, parsed)
    setTotalLimit('')
    setError('')
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault()
    const parsed = parseBudgetLimit(categoryLimit)

    if (parsed === null) {
      setError('Informe um limite de categoria valido.')
      return
    }

    await saveCategoryBudget(selectedMonth, category, parsed)
    setCategoryLimit('')
    setError('')
  }

  async function removePlan() {
    await deleteBudgetPlan(selectedMonth)
    setError('')
  }

  return (
    <section className="panel budget-panel" data-testid="budget-panel">
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">PLANEJAMENTO</span>
          <h2>Orcamento de {formatMonthYear(selectedMonth)}</h2>
        </div>
        {progress.hasBudget && (
          <button className="button ghost danger" type="button" data-testid="budget-remove" onClick={removePlan}>
            Remover
          </button>
        )}
      </div>

      <div className={`budget-summary tone-${tone}`} data-testid="budget-card">
        <div>
          <span>USO DO ORCAMENTO</span>
          <strong data-testid="budget-spent">{formatBRL(progress.spent)} / {progress.hasBudget ? formatBRL(progress.limit) : 'sem limite'}</strong>
        </div>
        <div className="budget-progress" aria-label={`Uso do orcamento: ${formatPercent(progress.percentageUsed)}`}>
          <span style={{ width: `${barWidth}%` }} />
        </div>
        <div className="budget-meta">
          <span data-testid="budget-percentage">{formatPercent(progress.percentageUsed)}</span>
          <span data-testid="budget-remaining">
            {progress.hasBudget
              ? progress.isOverLimit
                ? `Limite ultrapassado em ${formatBRL(progress.overLimitAmount)}`
                : `${formatBRL(progress.remaining)} disponiveis`
              : 'Defina um limite para acompanhar o mes'}
          </span>
        </div>
      </div>

      <form className="budget-form" onSubmit={saveTotal}>
        <label>
          Orcamento total
          <input
            data-testid="budget-total-input"
            value={totalLimit}
            onChange={(event) => setTotalLimit(event.target.value)}
            inputMode="decimal"
            placeholder={budget ? formatBRL(budget.totalLimit) : 'R$ 1.000,00'}
            autoComplete="off"
          />
        </label>
        <button className="button primary" data-testid="budget-save" type="submit">{budget ? 'Atualizar' : 'Salvar'}</button>
      </form>

      {progress.hasBudget && (
        <>
          <form className="budget-form category-budget-form" onSubmit={saveCategory}>
            <label>
              Categoria
              <select data-testid="budget-category-select" value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Limite
              <input
                data-testid="budget-category-input"
                value={categoryLimit}
                onChange={(event) => setCategoryLimit(event.target.value)}
                inputMode="decimal"
                placeholder="R$ 300,00"
                autoComplete="off"
              />
            </label>
            <button className="button secondary" data-testid="budget-category-save" type="submit">Adicionar limite</button>
          </form>

          {categoryProgress.length > 0 && (
            <div className="category-budget-list" aria-label="Limites por categoria">
              {categoryProgress.map((item) => {
                const categoryTone = progressTone(item.percentageUsed)
                const categoryWidth = Math.max(0, Math.min(100, Number.isFinite(item.percentageUsed ?? 0) ? (item.percentageUsed ?? 0) * 100 : 100))

                return (
                  <article className={`category-budget tone-${categoryTone}`} data-testid="category-budget-item" key={item.category}>
                    <div>
                      <strong>{item.category}</strong>
                      <span>{formatBRL(item.spent)} / {formatBRL(item.limit)}</span>
                    </div>
                    <div className="budget-progress mini" aria-label={`${item.category}: ${formatPercent(item.percentageUsed)}`}>
                      <span style={{ width: `${categoryWidth}%` }} />
                    </div>
                    <div className="budget-meta">
                      <span>{formatPercent(item.percentageUsed)}</span>
                      <span>{item.isOverLimit ? `Ultrapassou ${formatBRL(item.overLimitAmount)}` : `${formatBRL(item.remaining)} livres`}</span>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Remover limite de ${item.category}`}
                      onClick={() => deleteCategoryBudget(selectedMonth, item.category)}
                    >
                      x
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}

      {error && <div className="message error">{error}</div>}
    </section>
  )
}

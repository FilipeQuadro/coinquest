import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type Phaser from 'phaser'
import { db } from '../db/database'
import { calculateBudgetProgress } from '../finance/budget/budget'
import { buildCreditCardInvoices, getCommittedCardExpenses, getUnpaidInvoiceCommitment } from '../finance/cards/cards'
import { calculateFinancialHealth, type FinancialHealth } from '../finance/health/financialHealth'
import type { SelectedMonth } from '../finance/month'
import { formatMonthName, isDateInMonth, referenceDateFromMonth } from '../finance/month'
import { buildRecurringOccurrences, calculateMonthlyOutlook } from '../finance/recurring/recurring'
import { getMonthlySummary } from '../finance/transactions'
import { deriveWorldProgression } from '../finance/world/worldProgression'
import { createCoinQuestGame } from '../game/createGame'
import { emitFinancialHealth, emitWorldProgression } from '../game/events'
import { formatBRL } from '../lib/money'

const healthCopy: Record<FinancialHealth['level'], { icon: string; label: string; hint: string }> = {
  unknown: {
    icon: '?',
    label: 'Sem leitura',
    hint: 'Ainda nao ha dados suficientes neste mes.',
  },
  excellent: {
    icon: '++',
    label: 'Excelente',
    hint: 'Despesas bem abaixo das receitas na regra V1.',
  },
  healthy: {
    icon: '+',
    label: 'Saudavel',
    hint: 'Mes positivo ou com gastos confortaveis na regra V1.',
  },
  attention: {
    icon: '!',
    label: 'Atencao',
    hint: 'Despesas se aproximando das receitas na regra V1.',
  },
  tight: {
    icon: '~',
    label: 'Apertado',
    hint: 'Receitas quase totalmente consumidas na regra V1.',
  },
  critical: {
    icon: '!!',
    label: 'Critico',
    hint: 'Despesas acima das receitas ou sem receita registrada.',
  },
}

interface GameWorldProps {
  selectedMonth: SelectedMonth
}

export function GameWorld({ selectedMonth }: GameWorldProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [])
  const budget = useLiveQuery(
    () => db.monthlyBudgets.where('[year+month]').equals([selectedMonth.year, selectedMonth.month]).first(),
    [selectedMonth.year, selectedMonth.month],
  )
  const rules = useLiveQuery(
    async () => (await db.recurringRules.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [],
    [],
  )
  const overrides = useLiveQuery(
    () => db.recurringOccurrenceOverrides.where('[year+month]').equals([selectedMonth.year, selectedMonth.month]).toArray(),
    [selectedMonth.year, selectedMonth.month],
    [],
  )
  const cards = useLiveQuery(() => db.creditCards.toArray(), [], [])
  const cardPurchases = useLiveQuery(() => db.cardPurchases.toArray(), [], [])
  const cardPayments = useLiveQuery(() => db.cardInvoicePayments.toArray(), [], [])
  const goals = useLiveQuery(() => db.goals.toArray(), [], [])
  const goalContributions = useLiveQuery(() => db.goalContributions.toArray(), [], [])
  const summary = getMonthlySummary(transactions, referenceDateFromMonth(selectedMonth))
  const cardInvoices = buildCreditCardInvoices(cards, cardPurchases, cardPayments, selectedMonth, transactions)
  const committedCardExpenses = getCommittedCardExpenses(cardInvoices)
  const budgetProgress = calculateBudgetProgress(budget, transactions, selectedMonth, committedCardExpenses)
  const occurrences = buildRecurringOccurrences(rules, overrides, selectedMonth, transactions)
  const monthlyOutlook = calculateMonthlyOutlook(transactions, occurrences, selectedMonth, getUnpaidInvoiceCommitment(cardInvoices))
  const health = calculateFinancialHealth(summary, budgetProgress)
  const worldProgression = deriveWorldProgression({
    transactionCount: summary.count,
    budgetProgress,
    financialHealth: health,
    missions: {
      activeGoals: goals.filter((goal) => goal.status === 'active').length,
      completedGoals: goals.filter((goal) => goal.status === 'completed').length,
      contributionsThisMonth: goalContributions.filter((contribution) => isDateInMonth(contribution.date, selectedMonth)).length,
    },
  })
  const healthInfo = healthCopy[health.level]
  const monthLabel = formatMonthName(selectedMonth)

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return
    const parent = containerRef.current
    parent.replaceChildren()
    gameRef.current = createCoinQuestGame(parent)

    return () => {
      gameRef.current?.destroy(true)
      gameRef.current = null
      parent.replaceChildren()
    }
  }, [])

  useEffect(() => {
    emitFinancialHealth({ health, summary, budgetProgress, monthlyOutlook })
    emitWorldProgression(worldProgression)
  }, [
    health.level,
    health.expenseRatio,
    health.messageKey,
    summary.income,
    summary.expenses,
    summary.balance,
    summary.count,
    budgetProgress.hasBudget,
    budgetProgress.limit,
    budgetProgress.spent,
    budgetProgress.remaining,
    budgetProgress.percentageUsed,
    monthlyOutlook.plannedIncome,
    monthlyOutlook.plannedExpense,
    monthlyOutlook.committedCardExpense,
    monthlyOutlook.pendingCount,
    monthlyOutlook.overdueCount,
    worldProgression.tier,
    worldProgression.title,
    worldProgression.description,
    worldProgression.nextHint,
    worldProgression.score,
    worldProgression.reasons.join('|'),
  ])

  return (
    <section className={`game-shell health-${health.level}`}>
      <div className="world-panel-bar">
        <div>
          <span className="eyebrow">MUNDO</span>
          <h2>Sua base financeira</h2>
        </div>
        <span className="status-chip">LOCAL-FIRST</span>
      </div>

      <div ref={containerRef} className="game-canvas" aria-label="Mundo pixel art do CoinQuest" />

      <div className="game-hud" aria-label="HUD financeiro do mundo">
        <div>
          <span>SALDO</span>
          <strong data-testid="game-hud-balance">{formatBRL(summary.balance)}</strong>
        </div>
        <div>
          <span>MES</span>
          <strong>{monthLabel}</strong>
        </div>
        <div>
          <span>STATUS</span>
          <strong data-testid="game-hud-health">{healthInfo.label}</strong>
        </div>
      </div>

      <div className="health-card" data-testid="financial-health-card">
        <span className="health-icon" aria-hidden="true">{healthInfo.icon}</span>
        <div>
          <strong>Estado do mes: {healthInfo.label}</strong>
          <span>{healthInfo.hint}</span>
        </div>
      </div>
    </section>
  )
}

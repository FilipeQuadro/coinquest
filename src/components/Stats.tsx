import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { SelectedMonth } from '../finance/month'
import { referenceDateFromMonth } from '../finance/month'
import { getMonthlySummary } from '../finance/transactions'
import { formatBRL } from '../lib/money'

interface StatsProps {
  selectedMonth: SelectedMonth
}

export function Stats({ selectedMonth }: StatsProps) {
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [])
  const summary = getMonthlySummary(transactions, referenceDateFromMonth(selectedMonth))

  return (
    <section className="stats-grid" aria-label="Resumo financeiro do mes">
      <article className="stat-card panel">
        <span>SALDO DO MES</span>
        <strong data-testid="summary-balance" className={summary.balance >= 0 ? 'income' : 'expense'}>{formatBRL(summary.balance)}</strong>
      </article>
      <article className="stat-card panel">
        <span>RECEITAS</span>
        <strong data-testid="summary-income" className="income">{formatBRL(summary.income)}</strong>
      </article>
      <article className="stat-card panel">
        <span>DESPESAS</span>
        <strong data-testid="summary-expenses" className="expense">{formatBRL(summary.expenses)}</strong>
      </article>
      <article className="stat-card panel">
        <span>REGISTROS</span>
        <strong data-testid="summary-count">{summary.count}</strong>
      </article>
    </section>
  )
}

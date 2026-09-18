import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { SelectedMonth } from '../finance/month'
import { formatMonthYear } from '../finance/month'
import {
  defaultHistoryFilters,
  filterTransactionsForHistory,
  getAvailableHistoryCategories,
  type HistoryFilters,
} from '../finance/history/historyFilter'
import { deleteTransaction } from '../finance/transactions'
import { formatBRL } from '../lib/money'
import { TransactionEditor } from './TransactionEditor'

const paymentLabels: Record<string, string> = {
  pix: 'PIX',
  debit: 'Debito',
  credit: 'Credito',
  cash: 'Dinheiro',
  transfer: 'Transferencia',
  other: 'Outro',
}

interface HistoryProps {
  selectedMonth: SelectedMonth
}

export function History({ selectedMonth }: HistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [filters, setFilters] = useState<HistoryFilters>(defaultHistoryFilters)
  const allTransactions = useLiveQuery(
    () => db.transactions.orderBy('occurredAt').reverse().toArray(),
    [],
    [],
  )
  const transactions = filterTransactionsForHistory(allTransactions, selectedMonth, filters)
  const monthTransactions = filterTransactionsForHistory(allTransactions, selectedMonth, defaultHistoryFilters)
  const availableCategories = getAvailableHistoryCategories(allTransactions, selectedMonth)
  const activeFiltersCount = [
    filters.query.trim() !== '',
    filters.type !== 'all',
    filters.category !== null,
    filters.paymentMethod !== null,
  ].filter(Boolean).length
  const hasActiveFilters = activeFiltersCount > 0
  const counterText = hasActiveFilters
    ? `${transactions.length} de ${monthTransactions.length} registros`
    : `${monthTransactions.length} ${monthTransactions.length === 1 ? 'registro' : 'registros'}`
  const activeFiltersText = `${activeFiltersCount} ${activeFiltersCount === 1 ? 'filtro ativo' : 'filtros ativos'}`

  useEffect(() => {
    if (!filters.category) return
    if (availableCategories.includes(filters.category)) return

    setFilters((current) => (
      current.category === filters.category
        ? { ...current, category: null }
        : current
    ))
  }, [availableCategories, filters.category, selectedMonth.month, selectedMonth.year])

  function updateFilters(nextFilters: Partial<HistoryFilters>) {
    setFilters((current) => ({ ...current, ...nextFilters }))
  }

  async function confirmDelete(id: string) {
    await deleteTransaction(id)
    setPendingDeleteId(null)
    if (editingId === id) setEditingId(null)
  }

  return (
    <section className="panel history-panel">
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">LOG FINANCEIRO</span>
          <h2>Historico do sistema</h2>
          <p className="muted">Registros realizados em {formatMonthYear(selectedMonth)}.</p>
        </div>
        <div className="history-status-row">
          <span className="muted" data-testid="history-counter">{counterText}</span>
          {hasActiveFilters && (
            <>
              <span className="history-active-filters" data-testid="history-active-filters">
                {activeFiltersText}
              </span>
              <button
                className="button ghost compact history-clear"
                type="button"
                data-testid="history-clear-filters"
                onClick={() => setFilters(defaultHistoryFilters)}
              >
                Limpar filtros
              </button>
            </>
          )}
        </div>
      </div>

      <div className="history-toolbar" aria-label="Filtros do historico">
        <label className="history-search">
          <span>Buscar</span>
          <input
            aria-label="Buscar por descricao ou categoria"
            data-testid="history-search"
            value={filters.query}
            onChange={(event) => updateFilters({ query: event.target.value })}
            placeholder="Buscar por descricao ou categoria..."
          />
        </label>

        <div className="history-type-filter" aria-label="Tipo de movimentacao">
          <button
            className={filters.type === 'all' ? 'active' : ''}
            type="button"
            aria-pressed={filters.type === 'all'}
            data-testid="history-type-all"
            onClick={() => updateFilters({ type: 'all' })}
          >
            Todos
          </button>
          <button
            className={filters.type === 'income' ? 'active' : ''}
            type="button"
            aria-pressed={filters.type === 'income'}
            data-testid="history-type-income"
            onClick={() => updateFilters({ type: 'income' })}
          >
            Entradas
          </button>
          <button
            className={filters.type === 'expense' ? 'active' : ''}
            type="button"
            aria-pressed={filters.type === 'expense'}
            data-testid="history-type-expense"
            onClick={() => updateFilters({ type: 'expense' })}
          >
            Saidas
          </button>
        </div>

        <label className="history-filter-field">
          <span>Categoria</span>
          <select
            data-testid="history-category-filter"
            value={filters.category ?? ''}
            onChange={(event) => updateFilters({ category: event.target.value || null })}
          >
            <option value="">Todas as categorias</option>
            {availableCategories.map((category) => (
              <option value={category} key={category}>{category}</option>
            ))}
          </select>
        </label>

        <label className="history-filter-field">
          <span>Forma</span>
          <select
            data-testid="history-payment-filter"
            value={filters.paymentMethod ?? ''}
            onChange={(event) => updateFilters({ paymentMethod: event.target.value ? event.target.value as HistoryFilters['paymentMethod'] : null })}
          >
            <option value="">Todas as formas</option>
            {Object.entries(paymentLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {monthTransactions.length === 0 ? (
        <div className="empty-state empty-state-guide">
          <strong>Nenhuma movimentacao real neste mes.</strong>
          <span>Use Registrar para adicionar entradas ou saidas que ja aconteceram. Previsoes e simulacoes ficam separadas.</span>
          <a className="inline-link" href="#registrar">Ir para Registrar</a>
        </div>
      ) : transactions.length === 0 ? (
        <div className="empty-state empty-state-guide">
          <strong>Nenhum registro encontrado.</strong>
          <span>Ajuste a busca ou limpe os filtros para ver outras movimentacoes reais do mes.</span>
        </div>
      ) : (
        <div className="history-list">
          {transactions.map((item) => (
            <article className="history-item" data-testid="history-item" key={item.id}>
              <div className="history-icon">{item.type === 'income' ? '+' : '-'}</div>
              <div className="history-main">
                <strong>{item.description}</strong>
                <span>{item.category} - {paymentLabels[item.paymentMethod] ?? item.paymentMethod} - {new Date(item.occurredAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
              <strong className={item.type === 'income' ? 'income' : 'expense'}>
                {item.type === 'income' ? '+' : '-'} {formatBRL(item.amount)}
              </strong>
              <div className="history-actions">
                <button
                  className="button ghost compact"
                  data-testid="edit-transaction"
                  type="button"
                  onClick={() => {
                    setEditingId(item.id)
                    setPendingDeleteId(null)
                  }}
                >
                  Editar
                </button>
                {pendingDeleteId === item.id ? (
                  <button
                    className="button ghost danger compact"
                    data-testid="confirm-delete-transaction"
                    type="button"
                    onClick={() => confirmDelete(item.id)}
                  >
                    Confirmar
                  </button>
                ) : (
                  <button
                    className="button ghost compact"
                    data-testid="delete-transaction"
                    type="button"
                    onClick={() => setPendingDeleteId(item.id)}
                  >
                    Excluir
                  </button>
                )}
              </div>
              {editingId === item.id && (
                <TransactionEditor
                  transaction={item}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => setEditingId(null)}
                />
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

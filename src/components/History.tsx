import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { SelectedMonth } from '../finance/month'
import { formatMonthYear, isDateInMonth } from '../finance/month'
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
  const transactions = useLiveQuery(
    () => db.transactions.orderBy('occurredAt').reverse().toArray(),
    [],
    [],
  ).filter((item) => isDateInMonth(item.occurredAt, selectedMonth))

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
        <span className="muted">{transactions.length} exibidas</span>
      </div>

      {transactions.length === 0 ? (
        <div className="empty-state">O log deste mes esta vazio. Registros futuros planejados ficam fora de transacoes realizadas.</div>
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

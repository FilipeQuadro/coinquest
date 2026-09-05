import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { SyncConflict } from '../db/types'
import { resolveSyncConflict, type SyncConflictResolutionStrategy } from '../sync/syncConflictResolution'
import { syncCoordinator } from '../sync/syncCoordinator'
import type { SyncEntitySnapshot, SyncEntityType } from '../sync/syncTypes'

const entityLabels: Record<SyncEntityType, string> = {
  transaction: 'Lancamento',
  goal: 'Missao',
  goalContribution: 'Reserva de missao',
  setting: 'Configuracao',
  monthlyBudget: 'Orcamento mensal',
  categoryBudget: 'Orcamento por categoria',
  recurringRule: 'Recorrencia',
  recurringOccurrenceOverride: 'Previsao recorrente',
  creditCard: 'Cartao',
  cardPurchase: 'Compra no cartao',
  cardInvoicePayment: 'Pagamento de fatura',
}

function money(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function dateText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function payloadRecord(snapshot: SyncEntitySnapshot): Record<string, unknown> {
  return (snapshot.payload && typeof snapshot.payload === 'object')
    ? snapshot.payload as unknown as Record<string, unknown>
    : {}
}

export function pendingConflictCountLabel(count: number): string {
  return count === 1 ? '1 conflito pendente' : `${count} conflitos pendentes`
}

export function conflictEntityLabel(entityType: SyncEntityType): string {
  return entityLabels[entityType]
}

export function formatConflictSnapshot(snapshot: SyncEntitySnapshot | null, source: 'local' | 'remote'): string {
  if (!snapshot) return 'Sem registro nesta versao.'
  if (snapshot.deleted) return source === 'local' ? 'Excluido neste dispositivo' : 'Excluido na nuvem'

  const payload = payloadRecord(snapshot)
  switch (snapshot.entityType) {
    case 'transaction': {
      const amount = money(payload.amount)
      return [
        payload.description,
        amount,
        payload.type === 'income' ? 'receita' : payload.type === 'expense' ? 'despesa' : null,
        dateText(payload.occurredAt),
      ].filter(Boolean).join(' - ') || 'Lancamento existente'
    }
    case 'goal':
      return [payload.name, money(payload.targetAmount)].filter(Boolean).join(' - ') || 'Missao existente'
    case 'goalContribution':
      return [money(payload.amount), dateText(payload.date), payload.note].filter(Boolean).join(' - ') || 'Reserva existente'
    case 'monthlyBudget':
      return [`${payload.month}/${payload.year}`, money(payload.totalLimit)].filter(Boolean).join(' - ') || 'Orcamento mensal existente'
    case 'categoryBudget':
      return [payload.category, `${payload.month}/${payload.year}`, money(payload.limit)].filter(Boolean).join(' - ') || 'Orcamento por categoria existente'
    case 'recurringRule':
      return [payload.description, money(payload.amount), payload.dayOfMonth ? `dia ${payload.dayOfMonth}` : null].filter(Boolean).join(' - ') || 'Recorrencia existente'
    case 'recurringOccurrenceOverride':
      return [payload.status, `${payload.month}/${payload.year}`].filter(Boolean).join(' - ') || 'Previsao recorrente existente'
    case 'creditCard':
      return typeof payload.name === 'string' && payload.name ? payload.name : 'Cartao existente'
    case 'cardPurchase':
      return [payload.description, money(payload.totalAmount), dateText(payload.purchaseDate)].filter(Boolean).join(' - ') || 'Compra no cartao existente'
    case 'cardInvoicePayment':
      return [`${payload.invoiceMonth}/${payload.invoiceYear}`, money(payload.amount), dateText(payload.paymentDate)].filter(Boolean).join(' - ') || 'Pagamento de fatura existente'
    case 'setting':
      return [payload.key, typeof payload.value === 'string' ? payload.value : null].filter(Boolean).join(' - ') || 'Configuracao existente'
    default: {
      const exhaustive: never = snapshot.entityType
      return exhaustive
    }
  }
}

export function resolutionFeedbackMessage(result: Awaited<ReturnType<typeof resolveSyncConflict>>): string {
  if (result.ok) return 'Conflito resolvido. A sincronizacao sera atualizada.'
  if (result.error === 'not-found') return 'Este conflito ja foi resolvido.'
  return 'Nao foi possivel resolver o conflito.'
}

function detectedAtText(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function SyncConflictCard({ conflict }: { conflict: SyncConflict }) {
  const [pendingStrategy, setPendingStrategy] = useState<SyncConflictResolutionStrategy | null>(null)
  const [busyStrategy, setBusyStrategy] = useState<SyncConflictResolutionStrategy | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function confirmResolution(strategy: SyncConflictResolutionStrategy) {
    setBusyStrategy(strategy)
    setMessage('Resolvendo...')
    setError('')

    const result = await resolveSyncConflict(conflict.entityKey, strategy)
    if (!result.ok) {
      setMessage('')
      setError(resolutionFeedbackMessage(result))
      setBusyStrategy(null)
      return
    }

    setMessage(resolutionFeedbackMessage(result))
    setPendingStrategy(null)
    setBusyStrategy(null)
    void syncCoordinator.requestSync({ reason: 'manual' }).catch(() => undefined)
  }

  return (
    <article className="sync-conflict-card">
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">{conflictEntityLabel(conflict.entityType)}</span>
          <h3>Conflito de sincronizacao</h3>
          <p>Dois aparelhos alteraram este dado. Escolha qual versao deve ser preservada.</p>
        </div>
        <span>{detectedAtText(conflict.detectedAt)}</span>
      </div>

      <div className="sync-conflict-versions">
        <div>
          <strong>Versao deste dispositivo</strong>
          <span>{formatConflictSnapshot(conflict.local, 'local')}</span>
        </div>
        <div>
          <strong>Versao da nuvem</strong>
          <span>{formatConflictSnapshot(conflict.remote, 'remote')}</span>
        </div>
      </div>

      <div className="sync-conflict-actions">
        <button className="button secondary" type="button" onClick={() => setPendingStrategy('keep-local')} disabled={Boolean(busyStrategy)}>
          Manter deste dispositivo
        </button>
        <button className="button secondary" type="button" onClick={() => setPendingStrategy('use-remote')} disabled={Boolean(busyStrategy)}>
          Usar versao da nuvem
        </button>
      </div>

      {pendingStrategy && (
        <div className="sync-conflict-confirm">
          <p>Esta escolha pode descartar a outra versao deste dado.</p>
          <div className="goal-form-actions">
            <button className="button primary" type="button" onClick={() => void confirmResolution(pendingStrategy)} disabled={Boolean(busyStrategy)}>
              {busyStrategy === pendingStrategy ? 'Resolvendo...' : 'Confirmar'}
            </button>
            <button className="button ghost" type="button" onClick={() => setPendingStrategy(null)} disabled={Boolean(busyStrategy)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {message && <p className="success-text">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </article>
  )
}

export function SyncConflictsPanel() {
  const conflicts = useLiveQuery(
    () => db.syncConflicts.where('status').equals('pending').toArray(),
    [],
    undefined,
  )

  if (conflicts === undefined) return <p className="muted">Verificando conflitos...</p>
  if (!conflicts.length) return null

  return (
    <div className="sync-conflicts-panel" data-testid="sync-conflicts-panel">
      <div className="section-heading">
        <h3>Conflitos pendentes</h3>
        <span>{conflicts.length}</span>
      </div>
      <p className="muted">Resolva cada conflito explicitamente. O CoinQuest nao escolhe uma versao automaticamente.</p>
      <div className="sync-conflict-list">
        {conflicts.map((conflict) => <SyncConflictCard key={conflict.id} conflict={conflict} />)}
      </div>
    </div>
  )
}

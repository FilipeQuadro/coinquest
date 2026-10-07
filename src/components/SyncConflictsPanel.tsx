import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { SyncConflict } from '../db/types'
import { resolveSyncConflict, type SyncConflictResolutionStrategy } from '../sync/syncConflictResolution'
import { syncCoordinator } from '../sync/syncCoordinator'
import type { SyncEntitySnapshot, SyncEntityType } from '../sync/syncTypes'

const entityLabels: Record<SyncEntityType, string> = {
  transaction: 'Lançamento',
  goal: 'Missão',
  goalContribution: 'Reserva de missão',
  setting: 'Configuração',
  monthlyBudget: 'Orçamento mensal',
  categoryBudget: 'Orçamento por categoria',
  recurringRule: 'Recorrência',
  recurringOccurrenceOverride: 'Previsão recorrente',
  creditCard: 'Cartão',
  cardPurchase: 'Compra no cartão',
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
  if (!snapshot) return 'Sem registro nesta versão.'
  if (snapshot.deleted) return source === 'local' ? 'Excluído neste dispositivo' : 'Excluído na nuvem'

  const payload = payloadRecord(snapshot)
  switch (snapshot.entityType) {
    case 'transaction': {
      const amount = money(payload.amount)
      return [
        payload.description,
        amount,
        payload.type === 'income' ? 'receita' : payload.type === 'expense' ? 'despesa' : null,
        dateText(payload.occurredAt),
      ].filter(Boolean).join(' - ') || 'Lançamento existente'
    }
    case 'goal':
      return [payload.name, money(payload.targetAmount)].filter(Boolean).join(' - ') || 'Missão existente'
    case 'goalContribution':
      return [money(payload.amount), dateText(payload.date), payload.note].filter(Boolean).join(' - ') || 'Reserva existente'
    case 'monthlyBudget':
      return [`${payload.month}/${payload.year}`, money(payload.totalLimit)].filter(Boolean).join(' - ') || 'Orçamento mensal existente'
    case 'categoryBudget':
      return [payload.category, `${payload.month}/${payload.year}`, money(payload.limit)].filter(Boolean).join(' - ') || 'Orçamento por categoria existente'
    case 'recurringRule':
      return [payload.description, money(payload.amount), payload.dayOfMonth ? `dia ${payload.dayOfMonth}` : null].filter(Boolean).join(' - ') || 'Recorrência existente'
    case 'recurringOccurrenceOverride':
      return [payload.status, `${payload.month}/${payload.year}`].filter(Boolean).join(' - ') || 'Previsão recorrente existente'
    case 'creditCard':
      return typeof payload.name === 'string' && payload.name ? payload.name : 'Cartão existente'
    case 'cardPurchase':
      return [payload.description, money(payload.totalAmount), dateText(payload.purchaseDate)].filter(Boolean).join(' - ') || 'Compra no cartão existente'
    case 'cardInvoicePayment':
      return [`${payload.invoiceMonth}/${payload.invoiceYear}`, money(payload.amount), dateText(payload.paymentDate)].filter(Boolean).join(' - ') || 'Pagamento de fatura existente'
    case 'setting':
      return [payload.key, typeof payload.value === 'string' ? payload.value : null].filter(Boolean).join(' - ') || 'Configuração existente'
    default: {
      const exhaustive: never = snapshot.entityType
      return exhaustive
    }
  }
}

export function resolutionFeedbackMessage(result: Awaited<ReturnType<typeof resolveSyncConflict>>): string {
  if (result.ok) return 'Conflito resolvido. A sincronização será atualizada.'
  if (result.error === 'not-found') return 'Este conflito já foi resolvido.'
  return 'Não foi possível resolver o conflito.'
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
          <h3>Conflito de sincronização</h3>
          <p>Dois aparelhos alteraram este dado. Escolha qual versão deve ser preservada.</p>
        </div>
        <span>{detectedAtText(conflict.detectedAt)}</span>
      </div>

      <div className="sync-conflict-versions">
        <div>
          <strong>Versão deste dispositivo</strong>
          <span>{formatConflictSnapshot(conflict.local, 'local')}</span>
        </div>
        <div>
          <strong>Versão da nuvem</strong>
          <span>{formatConflictSnapshot(conflict.remote, 'remote')}</span>
        </div>
      </div>

      <div className="sync-conflict-actions">
        <button className="button secondary" type="button" onClick={() => setPendingStrategy('keep-local')} disabled={Boolean(busyStrategy)}>
          Manter deste dispositivo
        </button>
        <button className="button secondary" type="button" onClick={() => setPendingStrategy('use-remote')} disabled={Boolean(busyStrategy)}>
          Usar versão da nuvem
        </button>
      </div>

      {pendingStrategy && (
        <div className="sync-conflict-confirm">
          <p>Esta escolha pode descartar a outra versão deste dado.</p>
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
      <p className="muted">Resolva cada conflito explicitamente. O CoinQuest não escolhe uma versão automaticamente.</p>
      <div className="sync-conflict-list">
        {conflicts.map((conflict) => <SyncConflictCard key={conflict.id} conflict={conflict} />)}
      </div>
    </div>
  )
}

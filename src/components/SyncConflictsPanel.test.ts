import { describe, expect, it } from 'vitest'
import { createSyncSnapshot, createSyncTombstone } from '../sync/syncIdentity'
import {
  conflictEntityLabel,
  formatConflictSnapshot,
  pendingConflictCountLabel,
  resolutionFeedbackMessage,
} from './SyncConflictsPanel'

describe('SyncConflictsPanel helpers', () => {
  it('formats empty conflict count with singular and plural labels', () => {
    expect(pendingConflictCountLabel(1)).toBe('1 conflito pendente')
    expect(pendingConflictCountLabel(2)).toBe('2 conflitos pendentes')
  })

  it('formats tombstones as human conflict summaries', () => {
    const tombstone = createSyncTombstone('setting', 'setting:sound')

    expect(formatConflictSnapshot(tombstone, 'local')).toBe('Excluido neste dispositivo')
    expect(formatConflictSnapshot(tombstone, 'remote')).toBe('Excluido na nuvem')
  })

  it('summarizes transactions without dumping raw JSON', () => {
    const snapshot = createSyncSnapshot('transaction', {
      id: 'tx-1',
      type: 'expense',
      kind: 'standard',
      amount: 120,
      description: 'Mercado',
      category: 'Alimentacao',
      paymentMethod: 'pix',
      occurredAt: '2026-09-05',
      createdAt: '2026-09-05T10:00:00.000Z',
    })

    expect(formatConflictSnapshot(snapshot, 'local')).toContain('Mercado')
    expect(formatConflictSnapshot(snapshot, 'local')).toContain('R$')
    expect(formatConflictSnapshot(snapshot, 'local')).not.toContain('"payload"')
  })

  it('has friendly entity labels and fallback summaries', () => {
    expect(conflictEntityLabel('goal')).toBe('Missao')
    expect(formatConflictSnapshot(null, 'remote')).toBe('Sem registro nesta versao.')
  })

  it('formats resolution feedback without exposing technical causes', () => {
    expect(resolutionFeedbackMessage({ ok: true, strategy: 'keep-local', entityKey: 'setting:sound' })).toBe(
      'Conflito resolvido. A sincronizacao sera atualizada.',
    )
    expect(resolutionFeedbackMessage({ ok: false, error: 'not-found' })).toBe('Este conflito ja foi resolvido.')
    expect(resolutionFeedbackMessage({ ok: false, error: 'apply-failed', cause: new Error('boom') })).toBe(
      'Nao foi possivel resolver o conflito.',
    )
  })
})

import { describe, expect, it } from 'vitest'
import type {
  AppSetting,
  CardInvoicePayment,
  CategoryBudget,
  MonthlyBudget,
  RecurringOccurrenceOverride,
  Transaction,
} from '../db/types'
import { createSyncSnapshot, createSyncTombstone } from './syncIdentity'
import { contentFingerprint, decideSyncMerge, normalizeSyncPayloadForComparison, stableSerialize } from './syncMerge'

function settingSnapshot(value: string, extra?: Record<string, unknown>) {
  return createSyncSnapshot('setting', {
    key: 'sync-setting',
    value,
    ...extra,
  } as AppSetting)
}

function monthlyBudgetSnapshot(id: string, totalLimit: number) {
  return createSyncSnapshot('monthlyBudget', {
    id,
    year: 2026,
    month: 8,
    totalLimit,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  } satisfies MonthlyBudget)
}

function categoryBudgetSnapshot(id: string, limit: number) {
  return createSyncSnapshot('categoryBudget', {
    id,
    year: 2026,
    month: 8,
    category: 'Alimentacao',
    limit,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  } satisfies CategoryBudget)
}

function recurringOverrideSnapshot(id: string, status: RecurringOccurrenceOverride['status']) {
  return createSyncSnapshot('recurringOccurrenceOverride', {
    id,
    ruleId: 'rule-1',
    year: 2026,
    month: 8,
    status,
    linkedTransactionId: status === 'realized' ? 'tx-1' : undefined,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  } satisfies RecurringOccurrenceOverride)
}

function cardInvoicePaymentSnapshot(id: string, paymentDate: string) {
  return createSyncSnapshot('cardInvoicePayment', {
    id,
    cardId: 'card-1',
    invoiceYear: 2026,
    invoiceMonth: 8,
    linkedTransactionId: 'tx-1',
    paymentDate,
    paidAt: '2026-09-02T10:00:00.000Z',
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
  } satisfies CardInvoicePayment)
}

describe('sync merge', () => {
  it('returns noop when base, local and remote are equal', () => {
    const base = settingSnapshot('on')

    expect(decideSyncMerge(base, base, base)).toEqual({ action: 'noop' })
  })

  it('pushes local when only local changed', () => {
    const base = settingSnapshot('on')
    const local = settingSnapshot('off')

    expect(decideSyncMerge(base, local, base)).toEqual({ action: 'push-local', snapshot: local })
  })

  it('pulls remote when only remote changed', () => {
    const base = settingSnapshot('on')
    const remote = settingSnapshot('off')

    expect(decideSyncMerge(base, base, remote)).toEqual({ action: 'pull-remote', snapshot: remote })
  })

  it('converges when local and remote independently changed to the same content', () => {
    const base = settingSnapshot('on')
    const local = settingSnapshot('off')
    const remote = settingSnapshot('off')

    expect(decideSyncMerge(base, local, remote)).toEqual({ action: 'already-converged', snapshot: local })
  })

  it('returns conflict when local and remote changed differently', () => {
    const base = settingSnapshot('base')
    const local = settingSnapshot('local')
    const remote = settingSnapshot('remote')

    expect(decideSyncMerge(base, local, remote).action).toBe('conflict')
  })

  it('handles first sync with local only', () => {
    const local = settingSnapshot('local')

    expect(decideSyncMerge(null, local, null)).toEqual({ action: 'push-local', snapshot: local })
  })

  it('handles first sync with remote only', () => {
    const remote = settingSnapshot('remote')

    expect(decideSyncMerge(undefined, undefined, remote)).toEqual({ action: 'pull-remote', snapshot: remote })
  })

  it('handles first sync when both sides are equal', () => {
    const local = settingSnapshot('same')
    const remote = settingSnapshot('same')

    expect(decideSyncMerge(null, local, remote)).toEqual({ action: 'already-converged', snapshot: local })
  })

  it('conflicts on first sync when both sides exist with different content', () => {
    const local = settingSnapshot('local')
    const remote = settingSnapshot('remote')

    expect(decideSyncMerge(null, local, remote).action).toBe('conflict')
  })

  it('conflicts on first sync when one side has present content and the other has a tombstone', () => {
    const present = settingSnapshot('local')
    const tombstone = createSyncTombstone('setting', present.entityKey)

    expect(decideSyncMerge(null, present, tombstone).action).toBe('conflict')
    expect(decideSyncMerge(null, tombstone, present).action).toBe('conflict')
  })

  it('returns noop on first sync when both sides are missing or tombstones without history', () => {
    const tombstone = createSyncTombstone('setting', 'setting:sync-setting')

    expect(decideSyncMerge(null, null, undefined)).toEqual({ action: 'noop' })
    expect(decideSyncMerge(null, tombstone, undefined)).toEqual({ action: 'noop' })
    expect(decideSyncMerge(null, undefined, tombstone)).toEqual({ action: 'noop' })
    expect(decideSyncMerge(null, tombstone, tombstone)).toEqual({ action: 'noop' })
  })

  it('pushes delete when local deleted and remote did not change', () => {
    const base = settingSnapshot('on')
    const tombstone = createSyncTombstone('setting', base.entityKey)

    expect(decideSyncMerge(base, tombstone, base)).toEqual({ action: 'push-delete', tombstone })
  })

  it('deletes local when remote deleted and local did not change', () => {
    const base = settingSnapshot('on')
    const tombstone = createSyncTombstone('setting', base.entityKey)

    expect(decideSyncMerge(base, base, tombstone)).toEqual({ action: 'delete-local', tombstone })
  })

  it('conflicts when local deleted and remote edited', () => {
    const base = settingSnapshot('base')
    const tombstone = createSyncTombstone('setting', base.entityKey)
    const remote = settingSnapshot('remote')

    expect(decideSyncMerge(base, tombstone, remote).action).toBe('conflict')
  })

  it('conflicts when remote deleted and local edited', () => {
    const base = settingSnapshot('base')
    const local = settingSnapshot('local')
    const tombstone = createSyncTombstone('setting', base.entityKey)

    expect(decideSyncMerge(base, local, tombstone).action).toBe('conflict')
  })

  it('converges when both sides deleted an existing entity', () => {
    const base = settingSnapshot('base')
    const local = createSyncTombstone('setting', base.entityKey)
    const remote = createSyncTombstone('setting', base.entityKey)

    expect(decideSyncMerge(base, local, remote)).toEqual({ action: 'already-converged', snapshot: local })
  })

  it('uses canonical serialization so key order does not affect comparison', () => {
    const base = settingSnapshot('base')
    const local = settingSnapshot('same', { nested: { b: 2, a: 1 } })
    const remote = settingSnapshot('same', { nested: { a: 1, b: 2 } })

    expect(stableSerialize({ b: 2, a: 1 })).toBe(stableSerialize({ a: 1, b: 2 }))
    expect(contentFingerprint(local)).toBe(contentFingerprint(remote))
    expect(decideSyncMerge(base, local, remote)).toEqual({ action: 'already-converged', snapshot: local })
  })

  it('ignores only the local id for monthly budgets with the same canonical identity', () => {
    const base = monthlyBudgetSnapshot('base-id', 500)
    const local = monthlyBudgetSnapshot('local-id', 1000)
    const remote = monthlyBudgetSnapshot('remote-id', 1000)

    expect(contentFingerprint(local)).toBe(contentFingerprint(remote))
    expect(normalizeSyncPayloadForComparison(local)).not.toHaveProperty('id')
    expect(decideSyncMerge(base, local, remote)).toEqual({ action: 'already-converged', snapshot: local })
    expect(decideSyncMerge(base, local, monthlyBudgetSnapshot('remote-id', 1200)).action).toBe('conflict')
  })

  it('ignores only the local id for category budgets with the same canonical identity', () => {
    const base = categoryBudgetSnapshot('base-id', 200)
    const local = categoryBudgetSnapshot('local-id', 300)
    const remote = categoryBudgetSnapshot('remote-id', 300)

    expect(contentFingerprint(local)).toBe(contentFingerprint(remote))
    expect(decideSyncMerge(base, local, remote)).toEqual({ action: 'already-converged', snapshot: local })
    expect(decideSyncMerge(base, local, categoryBudgetSnapshot('remote-id', 350)).action).toBe('conflict')
  })

  it('ignores only the local id for recurring occurrence overrides with the same canonical identity', () => {
    const base = recurringOverrideSnapshot('base-id', 'skipped')
    const local = recurringOverrideSnapshot('local-id', 'realized')
    const remote = recurringOverrideSnapshot('remote-id', 'realized')
    const remotePayload = remote.payload as RecurringOccurrenceOverride
    const remoteWithDifferentLinkedTransaction = createSyncSnapshot('recurringOccurrenceOverride', {
      ...remotePayload,
      linkedTransactionId: 'tx-2',
    } satisfies RecurringOccurrenceOverride)

    expect(contentFingerprint(local)).toBe(contentFingerprint(remote))
    expect(decideSyncMerge(base, local, remote)).toEqual({ action: 'already-converged', snapshot: local })
    expect(decideSyncMerge(base, local, remoteWithDifferentLinkedTransaction).action).toBe('conflict')
  })

  it('ignores only the local id for card invoice payments with the same canonical identity', () => {
    const base = cardInvoicePaymentSnapshot('base-id', '2026-09-02')
    const local = cardInvoicePaymentSnapshot('local-id', '2026-09-03')
    const remote = cardInvoicePaymentSnapshot('remote-id', '2026-09-03')

    expect(contentFingerprint(local)).toBe(contentFingerprint(remote))
    expect(decideSyncMerge(base, local, remote)).toEqual({ action: 'already-converged', snapshot: local })
    expect(decideSyncMerge(base, local, cardInvoicePaymentSnapshot('remote-id', '2026-09-04')).action).toBe('conflict')
  })

  it('keeps local id as financial identity for entities identified by id', () => {
    const local = createSyncSnapshot('transaction', {
      id: 'tx-local',
      type: 'expense',
      kind: 'standard',
      amount: 100,
      description: 'Mouse',
      category: 'Compras',
      paymentMethod: 'pix',
      occurredAt: '2026-09-01',
      createdAt: '2026-09-01T10:00:00.000Z',
    } satisfies Transaction)
    const localPayload = local.payload as Transaction
    const remote = createSyncSnapshot('transaction', {
      ...localPayload,
      id: 'tx-remote',
    } satisfies Transaction)

    expect(contentFingerprint(local)).not.toBe(contentFingerprint(remote))
  })

  it('does not mutate input snapshots or payloads', () => {
    const base = settingSnapshot('base')
    const local = settingSnapshot('local')
    const remote = settingSnapshot('base')
    const before = JSON.stringify({ base, local, remote })

    decideSyncMerge(base, local, remote)

    expect(JSON.stringify({ base, local, remote })).toBe(before)
  })
})

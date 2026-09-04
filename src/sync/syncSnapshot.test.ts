import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MonthlyBudget, SyncMetadata } from '../db/types'
import { db } from '../db/database'
import { backupTableNames, exportBackup } from '../backup/backup'
import { createSyncSnapshot, createSyncTombstone } from './syncIdentity'
import { contentFingerprint } from './syncMerge'
import { createLocalSyncSnapshot, createLocalSyncSnapshotFromDb, diffLocalSnapshot } from './syncSnapshot'

const now = '2026-09-01T10:00:00.000Z'

function metadataFor(snapshot: ReturnType<typeof createSyncSnapshot>, overrides: Partial<SyncMetadata> = {}): SyncMetadata {
  return {
    entityKey: snapshot.entityKey,
    entityType: snapshot.entityType,
    baseSnapshot: snapshot,
    lastSyncedFingerprint: contentFingerprint(snapshot),
    lastSyncedAt: now,
    ...overrides,
  }
}

async function seedAllSyncEntities() {
  await db.transactions.add({
    id: 'tx-1',
    type: 'expense',
    kind: 'standard',
    amount: 120,
    description: 'Mercado',
    category: 'Alimentacao',
    paymentMethod: 'pix',
    occurredAt: '2026-09-01',
    createdAt: now,
  })
  await db.goals.add({
    id: 'goal-1',
    name: 'Novo PC',
    targetAmount: 5000,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })
  await db.goalContributions.add({
    id: 'contribution-1',
    goalId: 'goal-1',
    amount: 500,
    date: '2026-09-01',
    note: 'Reserva inicial',
    createdAt: now,
  })
  await db.settings.add({ key: 'sound', value: 'on' })
  await db.monthlyBudgets.add({
    id: 'monthly-budget-uuid-a',
    year: 2026,
    month: 8,
    totalLimit: 2000,
    createdAt: now,
    updatedAt: now,
  })
  await db.categoryBudgets.add({
    id: 'category-budget-uuid-a',
    year: 2026,
    month: 8,
    category: 'Alimentacao',
    limit: 500,
    createdAt: now,
    updatedAt: now,
  })
  await db.recurringRules.add({
    id: 'rule-1',
    type: 'income',
    description: 'Salario',
    amount: 1500,
    category: 'Receita',
    paymentMethod: 'transfer',
    cadence: 'monthly',
    dayOfMonth: 5,
    startYear: 2026,
    startMonth: 8,
    active: true,
    createdAt: now,
    updatedAt: now,
  })
  await db.recurringOccurrenceOverrides.add({
    id: 'override-uuid-a',
    ruleId: 'rule-1',
    year: 2026,
    month: 8,
    status: 'skipped',
    createdAt: now,
    updatedAt: now,
  })
  await db.creditCards.add({
    id: 'card-1',
    name: 'Nubank',
    creditLimit: 3000,
    closingDay: 25,
    dueDay: 2,
    active: true,
    createdAt: now,
    updatedAt: now,
  })
  await db.cardPurchases.add({
    id: 'purchase-1',
    cardId: 'card-1',
    description: 'Notebook',
    category: 'Compras',
    totalAmount: 1200,
    purchaseDate: '2026-09-01',
    installmentCount: 4,
    createdAt: now,
    updatedAt: now,
  })
  await db.cardInvoicePayments.add({
    id: 'invoice-payment-uuid-a',
    cardId: 'card-1',
    invoiceYear: 2026,
    invoiceMonth: 8,
    linkedTransactionId: 'tx-1',
    paymentDate: '2026-09-02',
    paidAt: now,
    createdAt: now,
    updatedAt: now,
  })
}

describe('local sync snapshot', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('includes all syncable entities with canonical keys', async () => {
    await seedAllSyncEntities()

    const snapshot = await createLocalSyncSnapshotFromDb()

    expect(snapshot.size).toBe(11)
    expect([...snapshot.keys()].sort()).toEqual([
      'cardInvoicePayment:card-1:2026:8',
      'cardPurchase:purchase-1',
      'categoryBudget:2026:8:Alimentacao',
      'creditCard:card-1',
      'goal:goal-1',
      'goalContribution:contribution-1',
      'monthlyBudget:2026:8',
      'recurringOverride:rule-1:2026:8',
      'recurringRule:rule-1',
      'setting:sound',
      'transaction:tx-1',
    ])
  })

  it('uses natural sync identity even when local UUIDs differ', async () => {
    const monthlyA = createSyncSnapshot('monthlyBudget', {
      id: 'uuid-a',
      year: 2026,
      month: 8,
      totalLimit: 1000,
      createdAt: now,
      updatedAt: now,
    })
    const monthlyPayload = monthlyA.payload as MonthlyBudget
    const monthlyB = createSyncSnapshot('monthlyBudget', {
      ...monthlyPayload,
      id: 'uuid-b',
    })

    expect(monthlyB.entityKey).toBe(monthlyA.entityKey)
  })

  it('throws when local records create duplicate canonical entity keys', async () => {
    expect(() => createLocalSyncSnapshot({
      transactions: [],
      goals: [],
      goalContributions: [],
      settings: [],
      monthlyBudgets: [
        { id: 'uuid-a', year: 2026, month: 8, totalLimit: 1000, createdAt: now, updatedAt: now },
        { id: 'uuid-b', year: 2026, month: 8, totalLimit: 1000, createdAt: now, updatedAt: now },
      ],
      categoryBudgets: [],
      recurringRules: [],
      recurringOccurrenceOverrides: [],
      creditCards: [],
      cardPurchases: [],
      cardInvoicePayments: [],
    })).toThrow('Snapshot local contem entityKey duplicada: monthlyBudget:2026:8.')
  })

  it('does not include sync infrastructure tables in financial backups', async () => {
    const transaction = {
      id: 'tx-1',
      type: 'expense' as const,
      kind: 'standard' as const,
      amount: 120,
      description: 'Mercado',
      category: 'Alimentacao',
      paymentMethod: 'pix' as const,
      occurredAt: '2026-09-01',
      createdAt: now,
    }
    const snapshot = createSyncSnapshot('transaction', transaction)
    await db.transactions.add(transaction)
    await db.syncState.add({ key: 'default', deviceId: 'device-1' })
    await db.syncMetadata.add(metadataFor(snapshot))
    await db.syncConflicts.add({
      id: 'conflict-1',
      entityKey: snapshot.entityKey,
      entityType: snapshot.entityType,
      base: snapshot,
      local: snapshot,
      remote: null,
      detectedAt: now,
      status: 'pending',
    })

    const backup = JSON.parse(await exportBackup()) as { appData: Record<string, unknown[]> }

    expect(Object.keys(backup.appData).sort()).toEqual([...backupTableNames].sort())
    expect(backup.appData).not.toHaveProperty('syncMetadata')
    expect(backup.appData).not.toHaveProperty('syncState')
    expect(backup.appData).not.toHaveProperty('syncConflicts')
  })
})

describe('local snapshot diff', () => {
  it('classifies new records when current exists without metadata', () => {
    const snapshot = createSyncSnapshot('setting', { key: 'sound', value: 'on' })
    const current = new Map([[snapshot.entityKey, snapshot]])

    expect(diffLocalSnapshot(current, [])).toEqual([{ status: 'new', entityKey: snapshot.entityKey, snapshot }])
  })

  it('classifies unchanged records when current fingerprint matches metadata', () => {
    const snapshot = createSyncSnapshot('setting', { key: 'sound', value: 'on' })
    const metadata = metadataFor(snapshot)

    expect(diffLocalSnapshot(new Map([[snapshot.entityKey, snapshot]]), [metadata])).toEqual([
      { status: 'unchanged', entityKey: snapshot.entityKey, snapshot, metadata },
    ])
  })

  it('classifies changed records when current fingerprint differs from metadata', () => {
    const base = createSyncSnapshot('setting', { key: 'sound', value: 'on' })
    const current = createSyncSnapshot('setting', { key: 'sound', value: 'off' })
    const metadata = metadataFor(base)

    expect(diffLocalSnapshot(new Map([[current.entityKey, current]]), [metadata])).toEqual([
      { status: 'changed', entityKey: current.entityKey, snapshot: current, metadata },
    ])
  })

  it('infers tombstone deletes only when metadata has a previous non-deleted base', () => {
    const base = createSyncSnapshot('setting', { key: 'sound', value: 'on' })
    const metadata = metadataFor(base)

    expect(diffLocalSnapshot(new Map(), [metadata])).toEqual([
      {
        status: 'deleted',
        entityKey: base.entityKey,
        tombstone: createSyncTombstone(base.entityType, base.entityKey),
        metadata,
      },
    ])
  })

  it('does not invent deletes for never-seen records', () => {
    expect(diffLocalSnapshot(new Map(), [])).toEqual([])
  })

  it('does not generate endless delete changes when base is already a tombstone', () => {
    const tombstone = createSyncTombstone('setting', 'setting:sound')
    const metadata: SyncMetadata = {
      entityKey: tombstone.entityKey,
      entityType: tombstone.entityType,
      baseSnapshot: tombstone,
      lastSyncedFingerprint: contentFingerprint(tombstone),
      lastSyncedAt: now,
    }

    expect(diffLocalSnapshot(new Map(), [metadata])).toEqual([
      { status: 'unchanged', entityKey: tombstone.entityKey, snapshot: null, metadata },
    ])
  })

  it('does not mutate snapshots or metadata while diffing', () => {
    const base = createSyncSnapshot('setting', { key: 'sound', value: 'on' })
    const current = createSyncSnapshot('setting', { key: 'sound', value: 'off' })
    const metadata = [metadataFor(base)]
    const snapshot = new Map([[current.entityKey, current]])
    const before = JSON.stringify({ current, metadata })

    diffLocalSnapshot(snapshot, metadata)

    expect(JSON.stringify({ current, metadata })).toBe(before)
  })
})

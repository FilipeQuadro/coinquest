import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import type { SyncMetadata } from '../db/types'
import { createSyncSnapshot, createSyncTombstone } from './syncIdentity'
import { contentFingerprint } from './syncMerge'
import { resolveSyncConflict } from './syncConflictResolution'
import { runSync, type SyncRunResult } from './syncOrchestrator'
import type { RemoteSyncRecord, RemoteSyncResult, RemoteSyncWriteInput } from './remote/remoteSyncTypes'
import type { SyncEntitySnapshot } from './syncTypes'

const now = '2026-09-01T10:00:00.000Z'
const later = '2026-09-01T10:01:00.000Z'

function settingSnapshot(value: string, key = 'sound') {
  return createSyncSnapshot('setting', { key, value })
}

function monthlyBudgetSnapshot(id: string, totalLimit: number) {
  return createSyncSnapshot('monthlyBudget', {
    id,
    year: 2026,
    month: 8,
    totalLimit,
    createdAt: now,
    updatedAt: now,
  })
}

function categoryBudgetSnapshot(id: string, limit: number) {
  return createSyncSnapshot('categoryBudget', {
    id,
    year: 2026,
    month: 8,
    category: 'Alimentacao',
    limit,
    createdAt: now,
    updatedAt: now,
  })
}

function recurringOverrideSnapshot(id: string, status: 'skipped' | 'realized') {
  return createSyncSnapshot('recurringOccurrenceOverride', {
    id,
    ruleId: 'rule-1',
    year: 2026,
    month: 8,
    status,
    linkedTransactionId: status === 'realized' ? 'tx-1' : undefined,
    createdAt: now,
    updatedAt: now,
  })
}

function cardInvoicePaymentSnapshot(id: string, paymentDate: string) {
  return createSyncSnapshot('cardInvoicePayment', {
    id,
    cardId: 'card-1',
    invoiceYear: 2026,
    invoiceMonth: 8,
    linkedTransactionId: 'tx-1',
    paymentDate,
    paidAt: now,
    createdAt: now,
    updatedAt: now,
  })
}

function metadataFor(snapshot: SyncEntitySnapshot, revision?: number): SyncMetadata {
  return {
    entityKey: snapshot.entityKey,
    entityType: snapshot.entityType,
    baseSnapshot: snapshot,
    lastSyncedFingerprint: contentFingerprint(snapshot),
    remoteRevision: revision,
    lastSyncedAt: now,
  }
}

function remoteRecord(snapshot: SyncEntitySnapshot, revision = 1): RemoteSyncRecord {
  return {
    userId: 'user-1',
    entityKey: snapshot.entityKey,
    entityType: snapshot.entityType,
    payload: snapshot.deleted ? null : snapshot.payload,
    deleted: snapshot.deleted,
    revision,
    deviceId: 'remote-device',
    createdAt: now,
    updatedAt: now,
  }
}

async function createConflict(
  base: SyncEntitySnapshot,
  local: SyncEntitySnapshot | null,
  remote: SyncEntitySnapshot | null,
) {
  await db.syncMetadata.put(metadataFor(base, 1))
  await db.syncConflicts.put({
    id: 'conflict-1',
    entityKey: base.entityKey,
    entityType: base.entityType,
    base,
    local,
    remote,
    detectedAt: now,
    status: 'pending',
  })
}

class FakeRemoteRepository {
  records = new Map<string, RemoteSyncRecord>()
  updateCalls: Array<{ input: RemoteSyncWriteInput; expectedRevision: number }> = []
  tombstoneCalls: Array<{ snapshot: SyncEntitySnapshot; expectedRevision: number }> = []

  async getAllRemoteRecords(): Promise<RemoteSyncResult<RemoteSyncRecord[]>> {
    return { ok: true, data: [...this.records.values()] }
  }

  async getRemoteRecord(entityKey: string): Promise<RemoteSyncResult<RemoteSyncRecord | null>> {
    return { ok: true, data: this.records.get(entityKey) ?? null }
  }

  async createRemoteRecord(input: RemoteSyncWriteInput): Promise<RemoteSyncResult<RemoteSyncRecord>> {
    const record = remoteRecord(input.snapshot, 1)
    this.records.set(record.entityKey, record)
    return { ok: true, data: record }
  }

  async updateRemoteRecord(
    input: RemoteSyncWriteInput,
    expectedRevision: number,
  ): Promise<RemoteSyncResult<RemoteSyncRecord>> {
    this.updateCalls.push({ input, expectedRevision })
    const existing = this.records.get(input.snapshot.entityKey)
    if (!existing) return { ok: false, error: 'not-found' }
    if (existing.revision !== expectedRevision) return { ok: false, error: 'revision-conflict' }
    const record = remoteRecord(input.snapshot, existing.revision + 1)
    this.records.set(record.entityKey, record)
    return { ok: true, data: record }
  }

  async writeTombstone(
    snapshot: SyncEntitySnapshot,
    deviceId: string,
    expectedRevision: number,
  ): Promise<RemoteSyncResult<RemoteSyncRecord>> {
    this.tombstoneCalls.push({ snapshot, expectedRevision })
    return this.updateRemoteRecord({
      snapshot: {
        entityType: snapshot.entityType,
        entityKey: snapshot.entityKey,
        payload: null,
        deleted: true,
      },
      deviceId,
    }, expectedRevision)
  }
}

async function runWith(repository: FakeRemoteRepository): Promise<SyncRunResult> {
  return runSync({
    repository,
    now: () => later,
  })
}

describe('sync conflict resolution', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('uses remote present content locally, promotes BASE and clears the conflict', async () => {
    const base = settingSnapshot('base')
    const local = settingSnapshot('local')
    const remote = settingSnapshot('remote')
    await db.settings.put(local.payload!)
    await createConflict(base, local, remote)

    await expect(resolveSyncConflict(base.entityKey, 'use-remote', { now: () => later })).resolves.toEqual({
      ok: true,
      strategy: 'use-remote',
      entityKey: base.entityKey,
    })

    await expect(db.settings.get('sound')).resolves.toEqual(remote.payload)
    const metadata = await db.syncMetadata.get(base.entityKey)
    expect(metadata).toMatchObject({
      baseSnapshot: remote,
      lastSyncedFingerprint: contentFingerprint(remote),
    })
    expect(metadata).not.toHaveProperty('remoteRevision')
    await expect(db.syncConflicts.toArray()).resolves.toEqual([])
  })

  it('converges on the next sync after using an unchanged remote version', async () => {
    const base = settingSnapshot('base')
    const local = settingSnapshot('local')
    const remote = settingSnapshot('remote')
    const repository = new FakeRemoteRepository()
    repository.records.set(base.entityKey, remoteRecord(remote, 3))
    await db.settings.put(local.payload!)
    await createConflict(base, local, remote)

    await resolveSyncConflict(base.entityKey, 'use-remote', { now: () => later })
    const sync = await runWith(repository)

    expect(sync).toMatchObject({ status: 'success', converged: 1, pushed: 0, conflicts: 0 })
    expect(repository.updateCalls).toHaveLength(0)
    await expect(db.syncConflicts.toArray()).resolves.toEqual([])
  })

  it('uses remote tombstone by deleting local state and making the tombstone BASE', async () => {
    const base = settingSnapshot('base')
    const local = settingSnapshot('local')
    const remote = createSyncTombstone('setting', base.entityKey)
    await db.settings.put(local.payload!)
    await createConflict(base, local, remote)

    await resolveSyncConflict(base.entityKey, 'use-remote', { now: () => later })

    await expect(db.settings.get('sound')).resolves.toBeUndefined()
    await expect(db.syncMetadata.get(base.entityKey)).resolves.toMatchObject({ baseSnapshot: remote })
    await expect(db.syncConflicts.toArray()).resolves.toEqual([])
  })

  it('uses remote present content when local side was a tombstone', async () => {
    const base = settingSnapshot('base')
    const local = createSyncTombstone('setting', base.entityKey)
    const remote = settingSnapshot('remote')
    await createConflict(base, local, remote)

    await resolveSyncConflict(base.entityKey, 'use-remote', { now: () => later })

    await expect(db.settings.get('sound')).resolves.toEqual(remote.payload)
    await expect(db.syncMetadata.get(base.entityKey)).resolves.toMatchObject({ baseSnapshot: remote })
  })

  it('preserves natural local ids when using the remote version', async () => {
    const base = monthlyBudgetSnapshot('base-id', 1000)
    const local = monthlyBudgetSnapshot('local-id', 1200)
    const remote = monthlyBudgetSnapshot('remote-id', 1300)
    await db.monthlyBudgets.put(local.payload!)
    await createConflict(base, local, remote)

    await resolveSyncConflict(base.entityKey, 'use-remote', { now: () => later })

    await expect(db.monthlyBudgets.toArray()).resolves.toMatchObject([
      { id: 'local-id', totalLimit: 1300 },
    ])
    await expect(db.syncMetadata.get(base.entityKey)).resolves.toMatchObject({ baseSnapshot: remote })
  })

  it('preserves category budget local id when using the remote version', async () => {
    const base = categoryBudgetSnapshot('base-id', 300)
    const local = categoryBudgetSnapshot('local-id', 350)
    const remote = categoryBudgetSnapshot('remote-id', 400)
    await db.categoryBudgets.put(local.payload!)
    await createConflict(base, local, remote)

    await resolveSyncConflict(base.entityKey, 'use-remote', { now: () => later })

    await expect(db.categoryBudgets.toArray()).resolves.toMatchObject([
      { id: 'local-id', limit: 400 },
    ])
  })

  it('preserves recurring override local id when using the remote version', async () => {
    const base = recurringOverrideSnapshot('base-id', 'skipped')
    const local = recurringOverrideSnapshot('local-id', 'skipped')
    const remote = recurringOverrideSnapshot('remote-id', 'realized')
    await db.recurringOccurrenceOverrides.put(local.payload!)
    await createConflict(base, local, remote)

    await resolveSyncConflict(base.entityKey, 'use-remote', { now: () => later })

    await expect(db.recurringOccurrenceOverrides.toArray()).resolves.toMatchObject([
      { id: 'local-id', status: 'realized', linkedTransactionId: 'tx-1' },
    ])
  })

  it('preserves card invoice payment local id when using the remote version', async () => {
    const base = cardInvoicePaymentSnapshot('base-id', '2026-09-01')
    const local = cardInvoicePaymentSnapshot('local-id', '2026-09-02')
    const remote = cardInvoicePaymentSnapshot('remote-id', '2026-09-03')
    await db.cardInvoicePayments.put(local.payload!)
    await createConflict(base, local, remote)

    await resolveSyncConflict(base.entityKey, 'use-remote', { now: () => later })

    await expect(db.cardInvoicePayments.toArray()).resolves.toMatchObject([
      { id: 'local-id', paymentDate: '2026-09-03' },
    ])
  })

  it('keeps local present content intact, rebases BASE to remote and lets the next sync push through OCC', async () => {
    const base = settingSnapshot('base')
    const local = settingSnapshot('local')
    const remote = settingSnapshot('remote')
    const repository = new FakeRemoteRepository()
    repository.records.set(base.entityKey, remoteRecord(remote, 7))
    await db.settings.put(local.payload!)
    await createConflict(base, local, remote)

    await resolveSyncConflict(base.entityKey, 'keep-local', { now: () => later })

    await expect(db.settings.get('sound')).resolves.toEqual(local.payload)
    await expect(db.syncMetadata.get(base.entityKey)).resolves.toMatchObject({ baseSnapshot: remote })
    await expect(db.syncConflicts.toArray()).resolves.toEqual([])

    const sync = await runWith(repository)

    expect(sync).toMatchObject({ status: 'success', pushed: 1 })
    expect(repository.updateCalls[0].expectedRevision).toBe(7)
    expect(repository.records.get(base.entityKey)).toMatchObject({ payload: local.payload, revision: 8 })
  })

  it('keeps a local present record over a remote tombstone and recreates the remote record through OCC', async () => {
    const base = settingSnapshot('base')
    const local = settingSnapshot('local')
    const remote = createSyncTombstone('setting', base.entityKey)
    const repository = new FakeRemoteRepository()
    repository.records.set(base.entityKey, remoteRecord(remote, 4))
    await db.settings.put(local.payload!)
    await createConflict(base, local, remote)

    await resolveSyncConflict(base.entityKey, 'keep-local', { now: () => later })
    const sync = await runWith(repository)

    expect(sync).toMatchObject({ status: 'success', pushed: 1 })
    expect(repository.updateCalls[0].expectedRevision).toBe(4)
    expect(repository.records.get(base.entityKey)).toMatchObject({ deleted: false, payload: local.payload })
  })

  it('keeps a local tombstone over remote present content and writes a remote tombstone through OCC', async () => {
    const base = settingSnapshot('base')
    const local = createSyncTombstone('setting', base.entityKey)
    const remote = settingSnapshot('remote')
    const repository = new FakeRemoteRepository()
    repository.records.set(base.entityKey, remoteRecord(remote, 5))
    await createConflict(base, local, remote)

    await resolveSyncConflict(base.entityKey, 'keep-local', { now: () => later })
    const sync = await runWith(repository)

    expect(sync).toMatchObject({ status: 'success', remoteDeletes: 1 })
    expect(repository.tombstoneCalls[0].expectedRevision).toBe(5)
    expect(repository.records.get(base.entityKey)).toMatchObject({ deleted: true, payload: null })
  })

  it('creates a new conflict if remote changes again after keep-local rebase', async () => {
    const base = settingSnapshot('base')
    const local = settingSnapshot('local')
    const remoteA = settingSnapshot('remote-a')
    const remoteB = settingSnapshot('remote-b')
    const repository = new FakeRemoteRepository()
    repository.records.set(base.entityKey, remoteRecord(remoteB, 8))
    await db.settings.put(local.payload!)
    await createConflict(base, local, remoteA)

    await resolveSyncConflict(base.entityKey, 'keep-local', { now: () => later })
    const sync = await runWith(repository)

    expect(sync).toMatchObject({ status: 'success', conflicts: 1, pushed: 0 })
    expect(repository.updateCalls).toHaveLength(0)
    await expect(db.syncConflicts.toArray()).resolves.toHaveLength(1)
  })

  it('is idempotent after resolution and a successful sync convergence', async () => {
    const base = settingSnapshot('base')
    const local = settingSnapshot('local')
    const remote = settingSnapshot('remote')
    const repository = new FakeRemoteRepository()
    repository.records.set(base.entityKey, remoteRecord(remote, 2))
    await db.settings.put(local.payload!)
    await createConflict(base, local, remote)

    await resolveSyncConflict(base.entityKey, 'keep-local', { now: () => later })
    await runWith(repository)
    const second = await runWith(repository)

    expect(second).toMatchObject({ status: 'success', converged: 1, pushed: 0, conflicts: 0 })
    expect(repository.updateCalls).toHaveLength(1)
    await expect(db.syncConflicts.toArray()).resolves.toEqual([])
  })

  it('does not resolve the same conflict twice', async () => {
    const base = settingSnapshot('base')
    const local = settingSnapshot('local')
    const remote = settingSnapshot('remote')
    await db.settings.put(local.payload!)
    await createConflict(base, local, remote)

    await resolveSyncConflict(base.entityKey, 'use-remote', { now: () => later })

    await expect(resolveSyncConflict(base.entityKey, 'use-remote', { now: () => later })).resolves.toEqual({
      ok: false,
      error: 'not-found',
    })
  })

  it('fails closed when the conflict has no remote snapshot', async () => {
    const base = settingSnapshot('base')
    const local = settingSnapshot('local')
    await createConflict(base, local, null)

    await expect(resolveSyncConflict(base.entityKey, 'use-remote', { now: () => later })).resolves.toEqual({
      ok: false,
      error: 'invalid-conflict',
    })
    await expect(db.syncConflicts.toArray()).resolves.toHaveLength(1)
  })

  it('fails closed without promoting metadata when the remote snapshot is invalid', async () => {
    const base = settingSnapshot('base')
    const local = settingSnapshot('local')
    const invalidRemote = {
      ...settingSnapshot('remote'),
      payload: { key: 'other', value: 'remote' },
    }
    await db.settings.put(local.payload!)
    await createConflict(base, local, invalidRemote)

    const result = await resolveSyncConflict(base.entityKey, 'use-remote', { now: () => later })

    expect(result).toMatchObject({ ok: false, error: 'apply-failed' })
    await expect(db.settings.get('sound')).resolves.toEqual(local.payload)
    await expect(db.syncMetadata.get(base.entityKey)).resolves.toMatchObject({ baseSnapshot: base })
    await expect(db.syncConflicts.toArray()).resolves.toHaveLength(1)
  })
})

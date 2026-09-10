import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import type { SyncMetadata, Transaction } from '../db/types'
import { createSyncSnapshot, createSyncTombstone } from './syncIdentity'
import { contentFingerprint } from './syncMerge'
import { runSync, type SyncRunResult } from './syncOrchestrator'
import type { RemoteSyncRecord, RemoteSyncResult, RemoteSyncWriteInput } from './remote/remoteSyncTypes'
import type { SyncEntitySnapshot } from './syncTypes'

const now = '2026-09-01T10:00:00.000Z'
const later = '2026-09-01T10:01:00.000Z'
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function deterministicGetRandomValues<T extends ArrayBufferView | null>(array: T): T {
  if (array instanceof Uint8Array) {
    for (let index = 0; index < array.length; index += 1) {
      array[index] = index
    }
  }
  return array
}

async function withCrypto<T>(cryptoValue: unknown, callback: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: cryptoValue,
  })
  try {
    return await callback()
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'crypto', original)
    } else {
      Reflect.deleteProperty(globalThis, 'crypto')
    }
  }
}

function settingSnapshot(value: string, key = 'sound') {
  return createSyncSnapshot('setting', { key, value })
}

function transactionFixture(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    type: 'expense',
    kind: 'standard',
    amount: 42,
    description: 'Diagnostico sync',
    category: 'Teste',
    paymentMethod: 'pix',
    occurredAt: '2026-09-05',
    createdAt: now,
    ...overrides,
  }
}

function metadataFor(snapshot: SyncEntitySnapshot, revision = 1): SyncMetadata {
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

class FakeRemoteRepository {
  records = new Map<string, RemoteSyncRecord>()
  getAllError?: RemoteSyncResult<RemoteSyncRecord[]> & { ok: false }
  createAlreadyExists = new Set<string>()
  updateErrors = new Set<string>()
  hiddenFromGetAll = new Set<string>()
  createCalls: RemoteSyncWriteInput[] = []
  updateCalls: Array<{ input: RemoteSyncWriteInput; expectedRevision: number }> = []
  tombstoneCalls: Array<{ snapshot: SyncEntitySnapshot; expectedRevision: number }> = []
  getOneCalls: string[] = []

  async getAllRemoteRecords(): Promise<RemoteSyncResult<RemoteSyncRecord[]>> {
    if (this.getAllError) return this.getAllError
    return { ok: true, data: [...this.records.values()].filter((record) => !this.hiddenFromGetAll.has(record.entityKey)) }
  }

  async getRemoteRecord(entityKey: string): Promise<RemoteSyncResult<RemoteSyncRecord | null>> {
    this.getOneCalls.push(entityKey)
    return { ok: true, data: this.records.get(entityKey) ?? null }
  }

  async createRemoteRecord(input: RemoteSyncWriteInput): Promise<RemoteSyncResult<RemoteSyncRecord>> {
    this.createCalls.push(input)
    if (this.createAlreadyExists.has(input.snapshot.entityKey)) {
      return { ok: false, error: 'already-exists' }
    }
    if (this.records.has(input.snapshot.entityKey)) {
      return { ok: false, error: 'already-exists' }
    }
    const record = remoteRecord(input.snapshot, 1)
    this.records.set(record.entityKey, record)
    return { ok: true, data: record }
  }

  async updateRemoteRecord(
    input: RemoteSyncWriteInput,
    expectedRevision: number,
  ): Promise<RemoteSyncResult<RemoteSyncRecord>> {
    this.updateCalls.push({ input, expectedRevision })
    if (this.updateErrors.has(input.snapshot.entityKey)) {
      return { ok: false, error: 'remote-error', cause: new Error('remote failed') }
    }
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

describe('sync orchestrator', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('returns not-configured or not-authenticated without touching financial data', async () => {
    const repository = new FakeRemoteRepository()
    repository.getAllError = { ok: false, error: 'not-configured' }

    const result = await runWith(repository)

    expect(result.status).toBe('not-configured')
    await expect(db.transactions.toArray()).resolves.toEqual([])

    repository.getAllError = { ok: false, error: 'not-authenticated' }
    await expect(runWith(repository)).resolves.toMatchObject({ status: 'not-authenticated' })
  })

  it('creates a remote record for first local-only sync and promotes metadata', async () => {
    await db.settings.add({ key: 'sound', value: 'on' })
    const repository = new FakeRemoteRepository()

    const result = await runWith(repository)

    expect(result).toMatchObject({ status: 'success', pushed: 1 })
    expect(repository.createCalls).toHaveLength(1)
    await expect(db.syncMetadata.get('setting:sound')).resolves.toMatchObject({ remoteRevision: 1 })
  })

  it('runs first sync on contexts without randomUUID when getRandomValues exists', async () => {
    await db.settings.add({ key: 'sound', value: 'on' })
    const repository = new FakeRemoteRepository()

    await withCrypto({ getRandomValues: deterministicGetRandomValues }, async () => {
      const result = await runWith(repository)

      expect(result).toMatchObject({ status: 'success', pushed: 1 })
      expect(repository.createCalls).toHaveLength(1)
      expect(repository.createCalls[0].deviceId).toMatch(uuidV4Pattern)
      await expect(db.syncState.get('default')).resolves.toMatchObject({
        deviceId: repository.createCalls[0].deviceId,
      })
    })
  })

  it('syncs a transaction lifecycle through create, idempotent noop, update and tombstone', async () => {
    const transaction = transactionFixture()
    const repository = new FakeRemoteRepository()
    await db.transactions.add(transaction)

    const first = await runWith(repository)

    expect(first).toMatchObject({ status: 'success', pushed: 1 })
    expect(repository.createCalls).toHaveLength(1)
    expect(repository.records.get(`transaction:${transaction.id}`)).toMatchObject({
      entityType: 'transaction',
      deleted: false,
      revision: 1,
      payload: transaction,
    })
    await expect(db.syncMetadata.get(`transaction:${transaction.id}`)).resolves.toMatchObject({
      entityType: 'transaction',
      remoteRevision: 1,
    })

    const second = await runWith(repository)

    expect(second).toMatchObject({ status: 'success', converged: 1 })
    expect(repository.createCalls).toHaveLength(1)
    expect(repository.updateCalls).toHaveLength(0)

    const updatedTransaction = { ...transaction, amount: 84 }
    await db.transactions.put(updatedTransaction)

    const update = await runWith(repository)

    expect(update).toMatchObject({ status: 'success', pushed: 1 })
    expect(repository.updateCalls).toHaveLength(1)
    expect(repository.updateCalls[0].expectedRevision).toBe(1)
    expect(repository.records.get(`transaction:${transaction.id}`)).toMatchObject({
      deleted: false,
      revision: 2,
      payload: updatedTransaction,
    })

    await db.transactions.delete(transaction.id)

    const deletion = await runWith(repository)

    expect(deletion).toMatchObject({ status: 'success', remoteDeletes: 1 })
    expect(repository.tombstoneCalls).toHaveLength(1)
    expect(repository.tombstoneCalls[0].expectedRevision).toBe(2)
    expect(repository.records.get(`transaction:${transaction.id}`)).toMatchObject({
      entityType: 'transaction',
      deleted: true,
      payload: null,
      revision: 3,
    })
  })

  it('pulls remote-only records into Dexie and promotes metadata', async () => {
    const repository = new FakeRemoteRepository()
    repository.records.set('setting:sound', remoteRecord(settingSnapshot('on'), 4))

    const result = await runWith(repository)

    expect(result).toMatchObject({ status: 'success', pulled: 1 })
    await expect(db.settings.get('sound')).resolves.toEqual({ key: 'sound', value: 'on' })
    await expect(db.syncMetadata.get('setting:sound')).resolves.toMatchObject({ remoteRevision: 4 })
  })

  it('pushes local updates using the current remote revision instead of stale metadata revision', async () => {
    const base = settingSnapshot('on')
    const local = settingSnapshot('off')
    const repository = new FakeRemoteRepository()
    repository.records.set(base.entityKey, remoteRecord(base, 6))
    await db.settings.add(local.payload as { key: string; value: string })
    await db.syncMetadata.add(metadataFor(base, 4))

    const result = await runWith(repository)

    expect(result).toMatchObject({ status: 'success', pushed: 1 })
    expect(repository.updateCalls[0].expectedRevision).toBe(6)
    await expect(db.syncMetadata.get(base.entityKey)).resolves.toMatchObject({ remoteRevision: 7 })
  })

  it('pulls remote updates when local matches base', async () => {
    const base = settingSnapshot('on')
    const remote = settingSnapshot('off')
    const repository = new FakeRemoteRepository()
    repository.records.set(base.entityKey, remoteRecord(remote, 2))
    await db.settings.add(base.payload as { key: string; value: string })
    await db.syncMetadata.add(metadataFor(base, 1))

    const result = await runWith(repository)

    expect(result).toMatchObject({ status: 'success', pulled: 1 })
    await expect(db.settings.get('sound')).resolves.toEqual({ key: 'sound', value: 'off' })
  })

  it('pushes local deletes as remote tombstones and deletes local from remote tombstones', async () => {
    const base = settingSnapshot('on')
    const repository = new FakeRemoteRepository()
    repository.records.set(base.entityKey, remoteRecord(base, 2))
    await db.syncMetadata.add(metadataFor(base, 1))

    const pushDelete = await runWith(repository)

    expect(pushDelete).toMatchObject({ status: 'success', remoteDeletes: 1 })
    expect(repository.tombstoneCalls[0].expectedRevision).toBe(2)
    expect(repository.records.get(base.entityKey)).toMatchObject({ deleted: true, payload: null, revision: 3 })

    await db.settings.add(base.payload as { key: string; value: string })
    const tombstone = createSyncTombstone('setting', base.entityKey)
    repository.records.set(base.entityKey, remoteRecord(tombstone, 4))
    await db.syncMetadata.put(metadataFor(base, 3))

    const localDelete = await runWith(repository)

    expect(localDelete).toMatchObject({ status: 'success', localDeletes: 1 })
    await expect(db.settings.get('sound')).resolves.toBeUndefined()
  })

  it('promotes metadata and clears conflicts when both sides converged', async () => {
    const base = settingSnapshot('on')
    const changed = settingSnapshot('off')
    const repository = new FakeRemoteRepository()
    repository.records.set(base.entityKey, remoteRecord(changed, 7))
    await db.settings.add(changed.payload as { key: string; value: string })
    await db.syncMetadata.add(metadataFor(base, 1))
    await db.syncConflicts.add({
      id: 'conflict-1',
      entityKey: base.entityKey,
      entityType: base.entityType,
      base,
      local: settingSnapshot('local'),
      remote: settingSnapshot('remote'),
      detectedAt: now,
      status: 'pending',
    })

    const result = await runWith(repository)

    expect(result).toMatchObject({ status: 'success', converged: 1 })
    await expect(db.syncMetadata.get(base.entityKey)).resolves.toMatchObject({ remoteRevision: 7, baseSnapshot: changed })
    await expect(db.syncConflicts.toArray()).resolves.toEqual([])
  })

  it('persists one pending conflict for divergent local and remote changes', async () => {
    const base = settingSnapshot('on')
    const repository = new FakeRemoteRepository()
    repository.records.set(base.entityKey, remoteRecord(settingSnapshot('remote'), 2))
    await db.settings.add(settingSnapshot('local').payload as { key: string; value: string })
    await db.syncMetadata.add(metadataFor(base, 1))

    const first = await runWith(repository)
    const second = await runWith(repository)

    expect(first).toMatchObject({ status: 'success', conflicts: 1 })
    expect(second).toMatchObject({ status: 'success', conflicts: 1 })
    await expect(db.syncConflicts.toArray()).resolves.toHaveLength(1)
    await expect(db.syncMetadata.get(base.entityKey)).resolves.toMatchObject({ remoteRevision: 1 })
  })

  it('handles first-create race by refetching remote once', async () => {
    await db.settings.add({ key: 'sound', value: 'on' })
    const local = settingSnapshot('on')
    const repository = new FakeRemoteRepository()
    repository.createAlreadyExists.add(local.entityKey)
    repository.records.set(local.entityKey, remoteRecord(local, 1))
    repository.hiddenFromGetAll.add(local.entityKey)

    const result = await runWith(repository)

    expect(result).toMatchObject({ status: 'success', converged: 1 })
    expect(repository.getOneCalls).toEqual([local.entityKey])
    await expect(db.syncMetadata.get(local.entityKey)).resolves.toMatchObject({ remoteRevision: 1 })
  })

  it('refreshes observed remote revision for noop without rewriting content', async () => {
    const base = settingSnapshot('on')
    const repository = new FakeRemoteRepository()
    repository.records.set(base.entityKey, remoteRecord(base, 6))
    await db.settings.add(base.payload as { key: string; value: string })
    await db.syncMetadata.add(metadataFor(base, 4))

    const result = await runWith(repository)

    expect(result).toMatchObject({ status: 'success', converged: 1 })
    await expect(db.syncMetadata.get(base.entityKey)).resolves.toMatchObject({ remoteRevision: 6 })
  })

  it('rejects invalid remote records fail-closed', async () => {
    const repository = new FakeRemoteRepository()
    repository.records.set('setting:sound', {
      ...remoteRecord(settingSnapshot('on'), 1),
      entityKey: 'setting:sound',
      payload: { key: 'other', value: 'on' },
    })

    const result = await runWith(repository)

    expect(result.status).toBe('failed')
    expect(result.errors).toMatchObject([{ code: 'remote-invalid', entityKey: 'setting:sound' }])
    await expect(db.settings.toArray()).resolves.toEqual([])
    await expect(db.syncMetadata.toArray()).resolves.toEqual([])
  })

  it('does not promote metadata for remote errors and returns partial after other progress', async () => {
    const okBase = settingSnapshot('base', 'ok')
    const okLocal = settingSnapshot('local', 'ok')
    const failBase = settingSnapshot('base', 'fail')
    const failLocal = settingSnapshot('local', 'fail')
    const repository = new FakeRemoteRepository()
    repository.records.set(okBase.entityKey, remoteRecord(okBase, 1))
    repository.records.set(failBase.entityKey, remoteRecord(failBase, 1))
    repository.updateErrors.add(failBase.entityKey)
    await db.settings.bulkAdd([
      okLocal.payload as { key: string; value: string },
      failLocal.payload as { key: string; value: string },
    ])
    await db.syncMetadata.bulkAdd([metadataFor(okBase, 1), metadataFor(failBase, 1)])

    const result = await runWith(repository)

    expect(result.status).toBe('partial')
    expect(result.pushed).toBe(1)
    expect(result.errors).toMatchObject([{ code: 'remote-error', entityKey: failBase.entityKey }])
    await expect(db.syncMetadata.get(okBase.entityKey)).resolves.toMatchObject({ remoteRevision: 2 })
    await expect(db.syncMetadata.get(failBase.entityKey)).resolves.toMatchObject({ remoteRevision: 1 })
  })
})

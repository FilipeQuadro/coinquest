import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import { createSyncSnapshot } from './syncIdentity'
import { clearPendingSyncConflict, persistSyncConflict } from './syncConflictStore'

const now = '2026-09-01T10:00:00.000Z'

function settingSnapshot(value: string) {
  return createSyncSnapshot('setting', { key: 'sound', value })
}

describe('sync conflict store', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('persists one pending conflict per entity key', async () => {
    const base = settingSnapshot('on')
    const local = settingSnapshot('off')
    const remote = settingSnapshot('muted')

    const first = await persistSyncConflict({
      entityKey: base.entityKey,
      entityType: base.entityType,
      base,
      local,
      remote,
      detectedAt: now,
    })
    const second = await persistSyncConflict({
      entityKey: base.entityKey,
      entityType: base.entityType,
      base,
      local: settingSnapshot('local-again'),
      remote,
      detectedAt: '2026-09-01T11:00:00.000Z',
    })

    expect(second.id).toBe(first.id)
    await expect(db.syncConflicts.toArray()).resolves.toMatchObject([
      {
        id: first.id,
        entityKey: base.entityKey,
        status: 'pending',
        detectedAt: '2026-09-01T11:00:00.000Z',
      },
    ])
  })

  it('clears pending conflicts for an entity key', async () => {
    const snapshot = settingSnapshot('on')
    await persistSyncConflict({
      entityKey: snapshot.entityKey,
      entityType: snapshot.entityType,
      base: snapshot,
      local: settingSnapshot('local'),
      remote: settingSnapshot('remote'),
      detectedAt: now,
    })

    await clearPendingSyncConflict(snapshot.entityKey)

    await expect(db.syncConflicts.toArray()).resolves.toEqual([])
  })
})

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import { getOrCreateDeviceId, getOrCreateSyncState } from './syncLocalState'

describe('sync local state', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('creates a persistent device id on first call', async () => {
    const syncState = await getOrCreateSyncState()

    expect(syncState.key).toBe('default')
    expect(syncState.deviceId).toEqual(expect.any(String))
    expect(syncState.deviceId.length).toBeGreaterThan(0)
  })

  it('returns the same device id on subsequent calls', async () => {
    const first = await getOrCreateDeviceId()
    const second = await getOrCreateDeviceId()

    expect(second).toBe(first)
    await expect(db.syncState.toArray()).resolves.toHaveLength(1)
  })

  it('keeps the same device id after database reopen', async () => {
    const first = await getOrCreateDeviceId()

    db.close()
    await db.open()

    await expect(getOrCreateDeviceId()).resolves.toBe(first)
  })
})

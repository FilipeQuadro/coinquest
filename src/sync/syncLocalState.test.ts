import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { createSecureUuidV4, getOrCreateDeviceId, getOrCreateSyncState } from './syncLocalState'

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

  it('uses native crypto.randomUUID when available', () => {
    const randomUUID = vi.fn(() => '11111111-1111-4111-8111-111111111111')

    expect(createSecureUuidV4({
      randomUUID,
      getRandomValues: deterministicGetRandomValues,
    })).toBe('11111111-1111-4111-8111-111111111111')
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('falls back to crypto.getRandomValues and generates a valid UUID v4', () => {
    const uuid = createSecureUuidV4({ getRandomValues: deterministicGetRandomValues })

    expect(uuid).toMatch(uuidV4Pattern)
    expect(uuid[14]).toBe('4')
    expect(['8', '9', 'a', 'b']).toContain(uuid[19])
  })

  it('fails explicitly when no secure UUID API is available', () => {
    expect(() => createSecureUuidV4({})).toThrow('Secure UUID generation requires')
  })

  it('creates a persistent device id when randomUUID is unavailable but getRandomValues exists', async () => {
    await withCrypto({ getRandomValues: deterministicGetRandomValues }, async () => {
      const syncState = await getOrCreateSyncState()
      const second = await getOrCreateDeviceId()

      expect(syncState.deviceId).toMatch(uuidV4Pattern)
      expect(second).toBe(syncState.deviceId)
      await expect(db.syncState.toArray()).resolves.toHaveLength(1)
    })
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

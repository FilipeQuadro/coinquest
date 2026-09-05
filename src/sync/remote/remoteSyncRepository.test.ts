import { describe, expect, it } from 'vitest'
import { createSyncSnapshot, createSyncTombstone } from '../syncIdentity'
import type { DbSyncRecord } from './remoteSyncTypes'
import { createRemoteSyncRepository, mapDbSyncRecord } from './remoteSyncRepository'

const userId = 'user-1'
const deviceId = 'device-1'
const now = '2026-09-04T10:00:00.000Z'

function dbRecord(overrides: Partial<DbSyncRecord> = {}): DbSyncRecord {
  return {
    user_id: userId,
    entity_key: 'setting:sound',
    entity_type: 'setting',
    payload: { key: 'sound', value: 'on' },
    deleted: false,
    revision: 1,
    device_id: deviceId,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

function createFakeClient(options: {
  user?: { id: string } | null
  authError?: unknown
  rows?: DbSyncRecord[]
  singleRow?: DbSyncRecord | null
  insertError?: unknown
  rpcData?: unknown
  rpcError?: unknown
} = {}) {
  const calls: { inserted?: unknown; rpcArgs?: Record<string, unknown>; selectedTable?: string } = {}

  const query = {
    select: () => query,
    eq: () => query,
    insert: (value: unknown) => {
      calls.inserted = value
      return query
    },
    order: async () => ({ data: options.rows ?? [], error: null }),
    maybeSingle: async () => ({ data: options.singleRow ?? null, error: null }),
    single: async () => ({
      data: options.singleRow ?? dbRecord({
        ...(calls.inserted as Partial<DbSyncRecord>),
        created_at: now,
        updated_at: now,
      }),
      error: options.insertError ?? null,
    }),
  }

  return {
    calls,
    client: {
      auth: {
        getUser: async () => ({
          data: { user: options.user === undefined ? { id: userId } : options.user },
          error: options.authError ?? null,
        }),
      },
      from: (table: 'sync_records') => {
        calls.selectedTable = table
        return query
      },
      rpc: async (_functionName: string, args: Record<string, unknown>) => {
        calls.rpcArgs = args
        return { data: options.rpcData, error: options.rpcError ?? null }
      },
    },
  }
}

describe('remote sync repository', () => {
  it('maps DB snake_case records to TypeScript camelCase records', () => {
    expect(mapDbSyncRecord(dbRecord())).toEqual({
      userId,
      entityKey: 'setting:sound',
      entityType: 'setting',
      payload: { key: 'sound', value: 'on' },
      deleted: false,
      revision: 1,
      deviceId,
      createdAt: now,
      updatedAt: now,
    })
  })

  it('keeps present payloads and tombstones explicit in mapping', () => {
    const present = mapDbSyncRecord(dbRecord({ deleted: false, payload: { key: 'sound', value: 'on' } }))
    const tombstone = mapDbSyncRecord(dbRecord({ deleted: true, payload: null }))

    expect(present.deleted).toBe(false)
    expect(present.payload).toEqual({ key: 'sound', value: 'on' })
    expect(tombstone.deleted).toBe(true)
    expect(tombstone.payload).toBeNull()
  })

  it('returns not-configured when no Supabase client is available', async () => {
    const repository = createRemoteSyncRepository({ client: null })

    await expect(repository.getAllRemoteRecords()).resolves.toEqual({ ok: false, error: 'not-configured' })
  })

  it('returns not-authenticated without a current user', async () => {
    const { client } = createFakeClient({ user: null })
    const repository = createRemoteSyncRepository({ client })

    await expect(repository.getAllRemoteRecords()).resolves.toEqual({ ok: false, error: 'not-authenticated' })
  })

  it('does not let caller choose userId when creating a remote record', async () => {
    const { client, calls } = createFakeClient()
    const repository = createRemoteSyncRepository({ client })
    const snapshot = createSyncSnapshot('setting', { key: 'sound', value: 'on' })

    const result = await repository.createRemoteRecord({ snapshot, deviceId })

    expect(result.ok).toBe(true)
    expect(calls.inserted).toMatchObject({
      user_id: userId,
      entity_key: 'setting:sound',
      entity_type: 'setting',
      payload: { key: 'sound', value: 'on' },
      deleted: false,
      revision: 1,
      device_id: deviceId,
    })
  })

  it('maps unique violation during create to already-exists', async () => {
    const { client } = createFakeClient({ insertError: { code: '23505' } })
    const repository = createRemoteSyncRepository({ client })
    const snapshot = createSyncSnapshot('setting', { key: 'sound', value: 'on' })

    await expect(repository.createRemoteRecord({ snapshot, deviceId })).resolves.toMatchObject({
      ok: false,
      error: 'already-exists',
    })
  })

  it('updates through OCC RPC and maps revision increment result', async () => {
    const updated = dbRecord({ revision: 2, payload: { key: 'sound', value: 'off' } })
    const { client, calls } = createFakeClient({
      rpcData: { status: 'updated', record: updated },
    })
    const repository = createRemoteSyncRepository({ client })
    const snapshot = createSyncSnapshot('setting', { key: 'sound', value: 'off' })

    await expect(repository.updateRemoteRecord({ snapshot, deviceId }, 1)).resolves.toEqual({
      ok: true,
      data: mapDbSyncRecord(updated),
    })
    expect(calls.rpcArgs).toMatchObject({
      p_entity_key: 'setting:sound',
      p_entity_type: 'setting',
      p_payload: { key: 'sound', value: 'off' },
      p_deleted: false,
      p_expected_revision: 1,
      p_device_id: deviceId,
    })
  })

  it('maps OCC revision conflict without overwriting', async () => {
    const { client } = createFakeClient({ rpcData: { status: 'revision-conflict' } })
    const repository = createRemoteSyncRepository({ client })
    const snapshot = createSyncSnapshot('setting', { key: 'sound', value: 'off' })

    await expect(repository.updateRemoteRecord({ snapshot, deviceId }, 1)).resolves.toEqual({
      ok: false,
      error: 'revision-conflict',
    })
  })

  it('maps missing remote record during update to not-found', async () => {
    const { client } = createFakeClient({ rpcData: { status: 'not-found' } })
    const repository = createRemoteSyncRepository({ client })
    const snapshot = createSyncSnapshot('setting', { key: 'sound', value: 'off' })

    await expect(repository.updateRemoteRecord({ snapshot, deviceId }, 1)).resolves.toEqual({
      ok: false,
      error: 'not-found',
    })
  })

  it('writes tombstones through the same OCC path', async () => {
    const tombstone = createSyncTombstone('setting', 'setting:sound')
    const { client, calls } = createFakeClient({
      rpcData: { status: 'updated', record: dbRecord({ deleted: true, payload: null, revision: 2 }) },
    })
    const repository = createRemoteSyncRepository({ client })

    const result = await repository.writeTombstone(tombstone, deviceId, 1)

    expect(result.ok).toBe(true)
    expect(calls.rpcArgs).toMatchObject({
      p_entity_key: 'setting:sound',
      p_entity_type: 'setting',
      p_payload: null,
      p_deleted: true,
      p_expected_revision: 1,
    })
  })

  it('maps remote errors to typed remote-error with cause', async () => {
    const cause = { message: 'network down' }
    const { client } = createFakeClient({ rpcError: cause })
    const repository = createRemoteSyncRepository({ client })
    const snapshot = createSyncSnapshot('setting', { key: 'sound', value: 'off' })

    await expect(repository.updateRemoteRecord({ snapshot, deviceId }, 1)).resolves.toEqual({
      ok: false,
      error: 'remote-error',
      cause,
    })
  })
})

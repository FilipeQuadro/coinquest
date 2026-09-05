import type { User } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabaseClient'
import type {
  DbSyncRecord,
  RemoteSyncRecord,
  RemoteSyncResult,
  RemoteSyncWriteInput,
} from './remoteSyncTypes'
import { syncEntityTypes, type SyncEntitySnapshot, type SyncEntityType } from '../syncTypes'

interface AuthLike {
  getUser(): Promise<{ data: { user: Pick<User, 'id'> | null }; error: unknown | null }>
}

interface QueryLike<T = unknown> {
  select(columns?: string): QueryLike<T>
  order(column: string, options?: { ascending?: boolean }): Promise<{ data: T[] | null; error: unknown | null }>
  eq(column: string, value: unknown): QueryLike<T>
  maybeSingle(): Promise<{ data: T | null; error: unknown | null }>
  insert(value: unknown): QueryLike<T>
  single(): Promise<{ data: T | null; error: unknown | null }>
}

interface SupabaseLike {
  auth: AuthLike
  from(table: 'sync_records'): QueryLike<DbSyncRecord>
  rpc(functionName: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown | null }>
}

export interface RemoteSyncRepositoryOptions {
  client?: SupabaseLike | null
  clientProvider?: () => SupabaseLike | null
}

function isSyncEntityType(value: string): value is SyncEntityType {
  return (syncEntityTypes as readonly string[]).includes(value)
}

export function mapDbSyncRecord(record: DbSyncRecord): RemoteSyncRecord {
  if (!isSyncEntityType(record.entity_type)) {
    throw new Error(`Tipo remoto de sync invalido: ${record.entity_type}.`)
  }

  return {
    userId: record.user_id,
    entityKey: record.entity_key,
    entityType: record.entity_type,
    payload: record.payload,
    deleted: record.deleted,
    revision: record.revision,
    deviceId: record.device_id,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  }
}

function mapSnapshotToInsert(snapshot: SyncEntitySnapshot, userId: string, deviceId: string) {
  return {
    user_id: userId,
    entity_key: snapshot.entityKey,
    entity_type: snapshot.entityType,
    payload: snapshot.deleted ? null : snapshot.payload,
    deleted: snapshot.deleted,
    revision: 1,
    device_id: deviceId,
  }
}

function remoteError<T>(cause: unknown): RemoteSyncResult<T> {
  return { ok: false, error: 'remote-error', cause }
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
}

function parseRpcResult(data: unknown): { status: string; record?: DbSyncRecord } | null {
  if (!data || typeof data !== 'object') return null
  const result = data as { status?: unknown; record?: unknown }
  if (typeof result.status !== 'string') return null
  return {
    status: result.status,
    record: result.record && typeof result.record === 'object' ? result.record as DbSyncRecord : undefined,
  }
}

export function createRemoteSyncRepository(options: RemoteSyncRepositoryOptions = {}) {
  const getClient = options.clientProvider
    ?? (() => 'client' in options ? options.client ?? null : getSupabaseClient() as SupabaseLike | null)

  async function getAuthenticatedUser(client: SupabaseLike): Promise<RemoteSyncResult<Pick<User, 'id'>>> {
    const { data, error } = await client.auth.getUser()
    if (error) return { ok: false, error: 'not-authenticated', cause: error }
    if (!data.user) return { ok: false, error: 'not-authenticated' }
    return { ok: true, data: data.user }
  }

  function getConfiguredClient(): RemoteSyncResult<SupabaseLike> {
    const client = getClient()
    if (!client) return { ok: false, error: 'not-configured' }
    return { ok: true, data: client }
  }

  async function getAllRemoteRecords(): Promise<RemoteSyncResult<RemoteSyncRecord[]>> {
    const clientResult = getConfiguredClient()
    if (!clientResult.ok) return clientResult
    const userResult = await getAuthenticatedUser(clientResult.data)
    if (!userResult.ok) return userResult

    const { data, error } = await clientResult.data
      .from('sync_records')
      .select('*')
      .order('entity_key', { ascending: true })

    if (error) return remoteError(error)
    return { ok: true, data: (data ?? []).map(mapDbSyncRecord) }
  }

  async function getRemoteRecord(entityKey: string): Promise<RemoteSyncResult<RemoteSyncRecord | null>> {
    const clientResult = getConfiguredClient()
    if (!clientResult.ok) return clientResult
    const userResult = await getAuthenticatedUser(clientResult.data)
    if (!userResult.ok) return userResult

    const { data, error } = await clientResult.data
      .from('sync_records')
      .select('*')
      .eq('entity_key', entityKey)
      .maybeSingle()

    if (error) return remoteError(error)
    return { ok: true, data: data ? mapDbSyncRecord(data) : null }
  }

  async function createRemoteRecord(input: RemoteSyncWriteInput): Promise<RemoteSyncResult<RemoteSyncRecord>> {
    const clientResult = getConfiguredClient()
    if (!clientResult.ok) return clientResult
    const userResult = await getAuthenticatedUser(clientResult.data)
    if (!userResult.ok) return userResult

    const { data, error } = await clientResult.data
      .from('sync_records')
      .insert(mapSnapshotToInsert(input.snapshot, userResult.data.id, input.deviceId))
      .select('*')
      .single()

    if (error) return isUniqueViolation(error) ? { ok: false, error: 'already-exists', cause: error } : remoteError(error)
    if (!data) return remoteError(new Error('Supabase did not return created sync record.'))
    return { ok: true, data: mapDbSyncRecord(data) }
  }

  async function updateRemoteRecord(
    input: RemoteSyncWriteInput,
    expectedRevision: number,
  ): Promise<RemoteSyncResult<RemoteSyncRecord>> {
    const clientResult = getConfiguredClient()
    if (!clientResult.ok) return clientResult
    const userResult = await getAuthenticatedUser(clientResult.data)
    if (!userResult.ok) return userResult

    const { data, error } = await clientResult.data.rpc('coinquest_update_sync_record', {
      p_entity_key: input.snapshot.entityKey,
      p_entity_type: input.snapshot.entityType,
      p_payload: input.snapshot.deleted ? null : input.snapshot.payload,
      p_deleted: input.snapshot.deleted,
      p_expected_revision: expectedRevision,
      p_device_id: input.deviceId,
    })

    if (error) return remoteError(error)

    const result = parseRpcResult(data)
    if (!result) return remoteError(new Error('Resposta invalida da RPC de sync.'))
    if (result.status === 'not-found') return { ok: false, error: 'not-found' }
    if (result.status === 'revision-conflict') return { ok: false, error: 'revision-conflict' }
    if (result.status !== 'updated' || !result.record) return remoteError(new Error(`Status inesperado da RPC de sync: ${result.status}.`))

    return { ok: true, data: mapDbSyncRecord(result.record) }
  }

  async function writeTombstone(
    snapshot: SyncEntitySnapshot,
    deviceId: string,
    expectedRevision: number,
  ): Promise<RemoteSyncResult<RemoteSyncRecord>> {
    return updateRemoteRecord({
      snapshot: {
        entityType: snapshot.entityType,
        entityKey: snapshot.entityKey,
        payload: null,
        deleted: true,
      },
      deviceId,
    }, expectedRevision)
  }

  return {
    getAllRemoteRecords,
    getRemoteRecord,
    createRemoteRecord,
    updateRemoteRecord,
    writeTombstone,
  }
}

export const remoteSyncRepository = createRemoteSyncRepository()

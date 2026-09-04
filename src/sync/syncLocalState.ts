import { db } from '../db/database'
import type { SyncConflict, SyncMetadata, SyncState } from '../db/types'

export const defaultSyncStateKey = 'default'

export async function getOrCreateSyncState(): Promise<SyncState> {
  const existing = await db.syncState.get(defaultSyncStateKey)
  if (existing) return existing

  const syncState: SyncState = {
    key: defaultSyncStateKey,
    deviceId: crypto.randomUUID(),
  }

  await db.syncState.put(syncState)
  return syncState
}

export async function getOrCreateDeviceId(): Promise<string> {
  const syncState = await getOrCreateSyncState()
  return syncState.deviceId
}

export function listSyncMetadata(): Promise<SyncMetadata[]> {
  return db.syncMetadata.toArray()
}

export function getSyncMetadata(entityKey: string): Promise<SyncMetadata | undefined> {
  return db.syncMetadata.get(entityKey)
}

export function saveSyncMetadata(metadata: SyncMetadata): Promise<string> {
  return db.syncMetadata.put(metadata)
}

export function removeSyncMetadata(entityKey: string): Promise<void> {
  return db.syncMetadata.delete(entityKey)
}

export function saveSyncConflict(conflict: SyncConflict): Promise<string> {
  return db.syncConflicts.put(conflict)
}

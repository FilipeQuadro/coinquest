import type { SyncEntitySnapshot, SyncEntityType } from '../syncTypes'

export interface RemoteSyncRecord {
  userId: string
  entityKey: string
  entityType: SyncEntityType
  payload: SyncEntitySnapshot['payload']
  deleted: boolean
  revision: number
  deviceId: string
  createdAt: string
  updatedAt: string
}

export interface DbSyncRecord {
  user_id: string
  entity_key: string
  entity_type: string
  payload: SyncEntitySnapshot['payload']
  deleted: boolean
  revision: number
  device_id: string
  created_at: string
  updated_at: string
}

export interface RemoteSyncWriteInput {
  snapshot: SyncEntitySnapshot
  deviceId: string
}

export type RemoteSyncErrorCode =
  | 'not-configured'
  | 'not-authenticated'
  | 'not-found'
  | 'already-exists'
  | 'revision-conflict'
  | 'remote-error'

export type RemoteSyncResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: RemoteSyncErrorCode; cause?: unknown }

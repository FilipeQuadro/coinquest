import { db } from '../db/database'
import type { SyncConflict } from '../db/types'
import { createSecureUuidV4 } from '../utils/createSecureUuidV4'
import type { SyncEntitySnapshot, SyncEntityType } from './syncTypes'

export interface PersistSyncConflictInput {
  entityKey: string
  entityType: SyncEntityType
  base: SyncEntitySnapshot | null
  local: SyncEntitySnapshot | null
  remote: SyncEntitySnapshot | null
  detectedAt: string
}

export async function persistSyncConflict(input: PersistSyncConflictInput): Promise<SyncConflict> {
  const existing = await db.syncConflicts
    .where('entityKey')
    .equals(input.entityKey)
    .and((conflict) => conflict.status === 'pending')
    .first()

  const conflict: SyncConflict = {
    id: existing?.id ?? createSecureUuidV4(),
    entityKey: input.entityKey,
    entityType: input.entityType,
    base: input.base,
    local: input.local,
    remote: input.remote,
    detectedAt: input.detectedAt,
    status: 'pending',
  }

  await db.syncConflicts.put(conflict)
  return conflict
}

export async function clearPendingSyncConflict(entityKey: string) {
  const conflicts = await db.syncConflicts
    .where('entityKey')
    .equals(entityKey)
    .and((conflict) => conflict.status === 'pending')
    .toArray()

  await Promise.all(conflicts.map((conflict) => db.syncConflicts.delete(conflict.id)))
}

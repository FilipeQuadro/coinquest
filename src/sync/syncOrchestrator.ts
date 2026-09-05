import { db } from '../db/database'
import type { SyncMetadata, SyncState } from '../db/types'
import { createSyncTombstone } from './syncIdentity'
import { applyRemoteSnapshotToDb, assertSnapshotIdentity } from './syncLocalApply'
import { getOrCreateSyncState, listSyncMetadata } from './syncLocalState'
import { decideSyncMerge, contentFingerprint, type SyncMergeDecision } from './syncMerge'
import { createLocalSyncSnapshotFromDb, type LocalSyncSnapshot } from './syncSnapshot'
import { remoteSyncRepository } from './remote/remoteSyncRepository'
import type {
  RemoteSyncErrorCode,
  RemoteSyncRecord,
  RemoteSyncResult,
  RemoteSyncWriteInput,
} from './remote/remoteSyncTypes'
import { syncEntityTypes, type SyncEntitySnapshot, type SyncEntityType } from './syncTypes'
import { clearPendingSyncConflict, persistSyncConflict } from './syncConflictStore'

type SyncRepository = {
  getAllRemoteRecords(): Promise<RemoteSyncResult<RemoteSyncRecord[]>>
  getRemoteRecord(entityKey: string): Promise<RemoteSyncResult<RemoteSyncRecord | null>>
  createRemoteRecord(input: RemoteSyncWriteInput): Promise<RemoteSyncResult<RemoteSyncRecord>>
  updateRemoteRecord(input: RemoteSyncWriteInput, expectedRevision: number): Promise<RemoteSyncResult<RemoteSyncRecord>>
  writeTombstone(snapshot: SyncEntitySnapshot, deviceId: string, expectedRevision: number): Promise<RemoteSyncResult<RemoteSyncRecord>>
}

export type SyncRunStatus = 'success' | 'partial' | 'not-configured' | 'not-authenticated' | 'failed'

export type SyncRunErrorCode = RemoteSyncErrorCode | 'remote-invalid' | 'local-apply-error'

export interface SyncRunError {
  code: SyncRunErrorCode
  entityKey?: string
  cause?: unknown
}

export interface SyncRunResult {
  status: SyncRunStatus
  pushed: number
  pulled: number
  remoteDeletes: number
  localDeletes: number
  converged: number
  conflicts: number
  errors: SyncRunError[]
}

export interface SyncOrchestratorDependencies {
  repository?: SyncRepository
  now?: () => string
  getSyncState?: () => Promise<SyncState>
  createLocalSnapshot?: () => Promise<LocalSyncSnapshot>
  listMetadata?: () => Promise<SyncMetadata[]>
}

const syncableTables = [
  db.transactions,
  db.goals,
  db.goalContributions,
  db.settings,
  db.monthlyBudgets,
  db.categoryBudgets,
  db.recurringRules,
  db.recurringOccurrenceOverrides,
  db.creditCards,
  db.cardPurchases,
  db.cardInvoicePayments,
  db.syncMetadata,
  db.syncConflicts,
  db.syncState,
] as const

function emptyResult(status: SyncRunStatus): SyncRunResult {
  return {
    status,
    pushed: 0,
    pulled: 0,
    remoteDeletes: 0,
    localDeletes: 0,
    converged: 0,
    conflicts: 0,
    errors: [],
  }
}

function isKnownEntityType(value: string): value is SyncEntityType {
  return (syncEntityTypes as readonly string[]).includes(value)
}

export function remoteRecordToSyncSnapshot(record: RemoteSyncRecord): SyncEntitySnapshot {
  if (!isKnownEntityType(record.entityType)) {
    throw new Error(`Remote sync record possui entityType desconhecido: ${record.entityType}.`)
  }

  const snapshot: SyncEntitySnapshot = record.deleted
    ? {
        entityType: record.entityType,
        entityKey: record.entityKey,
        payload: null,
        deleted: true,
      }
    : {
        entityType: record.entityType,
        entityKey: record.entityKey,
        payload: record.payload,
        deleted: false,
      }

  assertSnapshotIdentity(snapshot)
  return snapshot
}

function metadataFromRemote(record: RemoteSyncRecord, snapshot: SyncEntitySnapshot, lastSyncedAt: string): SyncMetadata {
  return {
    entityKey: snapshot.entityKey,
    entityType: snapshot.entityType,
    baseSnapshot: snapshot,
    lastSyncedFingerprint: contentFingerprint(snapshot),
    remoteRevision: record.revision,
    lastSyncedAt,
  }
}

function localStateForKey(
  currentSnapshot: ReadonlyMap<string, SyncEntitySnapshot>,
  metadata: SyncMetadata | undefined,
  entityKey: string,
): SyncEntitySnapshot | null {
  const current = currentSnapshot.get(entityKey)
  if (current) return current
  if (!metadata) return null
  if (metadata.baseSnapshot.deleted) return metadata.baseSnapshot
  return createSyncTombstone(metadata.entityType, metadata.entityKey)
}

function decisionEntityType(
  base: SyncEntitySnapshot | null,
  local: SyncEntitySnapshot | null,
  remote: SyncEntitySnapshot | null,
): SyncEntityType | null {
  return base?.entityType ?? local?.entityType ?? remote?.entityType ?? null
}

function remoteErrorToRunError(entityKey: string, result: { ok: false; error: RemoteSyncErrorCode; cause?: unknown }): SyncRunError {
  return {
    code: result.error,
    entityKey,
    cause: result.cause,
  }
}

export async function runSync(dependencies: SyncOrchestratorDependencies = {}): Promise<SyncRunResult> {
  const repository = dependencies.repository ?? remoteSyncRepository
  const now = dependencies.now ?? (() => new Date().toISOString())
  const getSyncState = dependencies.getSyncState ?? getOrCreateSyncState
  const createLocalSnapshot = dependencies.createLocalSnapshot ?? createLocalSyncSnapshotFromDb
  const getMetadata = dependencies.listMetadata ?? listSyncMetadata

  const attemptedAt = now()
  const syncState = await getSyncState()
  await db.syncState.put({ ...syncState, lastAttemptAt: attemptedAt })

  const [localSnapshot, metadataEntries] = await Promise.all([
    createLocalSnapshot(),
    getMetadata(),
  ])
  const metadataByKey = new Map(metadataEntries.map((entry) => [entry.entityKey, entry]))

  const remoteResult = await repository.getAllRemoteRecords()
  if (!remoteResult.ok) {
    const result = emptyResult(
      remoteResult.error === 'not-configured' || remoteResult.error === 'not-authenticated'
        ? remoteResult.error
        : 'failed',
    )
    result.errors.push({ code: remoteResult.error, cause: remoteResult.cause })
    return result
  }

  const remoteRecordsByKey = new Map<string, RemoteSyncRecord>()
  const remoteSnapshotsByKey = new Map<string, SyncEntitySnapshot>()
  const result = emptyResult('success')

  for (const record of remoteResult.data) {
    try {
      const snapshot = remoteRecordToSyncSnapshot(record)
      remoteRecordsByKey.set(record.entityKey, record)
      remoteSnapshotsByKey.set(record.entityKey, snapshot)
    } catch (cause) {
      result.errors.push({ code: 'remote-invalid', entityKey: record.entityKey, cause })
    }
  }

  const keys = new Set<string>([
    ...localSnapshot.keys(),
    ...metadataByKey.keys(),
    ...remoteRecordsByKey.keys(),
  ])
  const metadataPromotions: SyncMetadata[] = []
  const pulls: SyncEntitySnapshot[] = []
  const localDeletes: SyncEntitySnapshot[] = []
  const conflictInputs: Array<{
    entityKey: string
    entityType: SyncEntityType
    base: SyncEntitySnapshot | null
    local: SyncEntitySnapshot | null
    remote: SyncEntitySnapshot | null
  }> = []
  const clearConflictKeys = new Set<string>()

  const promoteRemote = (record: RemoteSyncRecord, snapshot: SyncEntitySnapshot) => {
    metadataPromotions.push(metadataFromRemote(record, snapshot, now()))
    clearConflictKeys.add(snapshot.entityKey)
  }

  const markRemoteError = (entityKey: string, errorResult: { ok: false; error: RemoteSyncErrorCode; cause?: unknown }) => {
    result.errors.push(remoteErrorToRunError(entityKey, errorResult))
  }

  const processDecision = async (
    entityKey: string,
    decision: SyncMergeDecision,
    base: SyncEntitySnapshot | null,
    local: SyncEntitySnapshot | null,
    remote: SyncEntitySnapshot | null,
    remoteRecord: RemoteSyncRecord | undefined,
    allowCreateRaceRefetch: boolean,
  ) => {
    switch (decision.action) {
      case 'noop': {
        if (remoteRecord && remote) promoteRemote(remoteRecord, remote)
        result.converged += 1
        return
      }
      case 'already-converged': {
        if (remoteRecord && remote) promoteRemote(remoteRecord, remote)
        result.converged += 1
        return
      }
      case 'pull-remote': {
        if (remoteRecord) {
          pulls.push(decision.snapshot)
          promoteRemote(remoteRecord, decision.snapshot)
          result.pulled += 1
        }
        return
      }
      case 'delete-local': {
        if (remoteRecord) {
          localDeletes.push(decision.tombstone)
          promoteRemote(remoteRecord, decision.tombstone)
          result.localDeletes += 1
        }
        return
      }
      case 'push-local': {
        if (!local) return
        const writeResult = remoteRecord
          ? await repository.updateRemoteRecord({ snapshot: decision.snapshot, deviceId: syncState.deviceId }, remoteRecord.revision)
          : await repository.createRemoteRecord({ snapshot: decision.snapshot, deviceId: syncState.deviceId })

        if (!writeResult.ok && writeResult.error === 'already-exists' && allowCreateRaceRefetch) {
          const refreshed = await repository.getRemoteRecord(entityKey)
          if (!refreshed.ok) {
            markRemoteError(entityKey, refreshed)
            return
          }
          if (!refreshed.data) {
            markRemoteError(entityKey, { ok: false, error: 'not-found' })
            return
          }

          try {
            const refreshedSnapshot = remoteRecordToSyncSnapshot(refreshed.data)
            const raceDecision = decideSyncMerge(null, local, refreshedSnapshot)
            await processDecision(entityKey, raceDecision, null, local, refreshedSnapshot, refreshed.data, false)
          } catch (cause) {
            result.errors.push({ code: 'remote-invalid', entityKey, cause })
          }
          return
        }

        if (!writeResult.ok) {
          markRemoteError(entityKey, writeResult)
          return
        }

        const writtenSnapshot = remoteRecordToSyncSnapshot(writeResult.data)
        promoteRemote(writeResult.data, writtenSnapshot)
        result.pushed += 1
        return
      }
      case 'push-delete': {
        if (!remoteRecord) {
          markRemoteError(entityKey, { ok: false, error: 'not-found' })
          return
        }

        const deleteResult = await repository.writeTombstone(decision.tombstone, syncState.deviceId, remoteRecord.revision)
        if (!deleteResult.ok) {
          markRemoteError(entityKey, deleteResult)
          return
        }

        const writtenSnapshot = remoteRecordToSyncSnapshot(deleteResult.data)
        promoteRemote(deleteResult.data, writtenSnapshot)
        result.remoteDeletes += 1
        return
      }
      case 'conflict': {
        const entityType = decisionEntityType(base, local, remote)
        if (entityType) {
          conflictInputs.push({
            entityKey,
            entityType,
            base,
            local,
            remote,
          })
          result.conflicts += 1
        }
        return
      }
      default: {
        const exhaustive: never = decision
        return exhaustive
      }
    }
  }

  for (const entityKey of keys) {
    if (result.errors.some((error) => error.code === 'remote-invalid' && error.entityKey === entityKey)) {
      continue
    }

    const metadata = metadataByKey.get(entityKey)
    const base = metadata?.baseSnapshot ?? null
    const local = localStateForKey(localSnapshot, metadata, entityKey)
    const remote = remoteSnapshotsByKey.get(entityKey) ?? null
    const remoteRecord = remoteRecordsByKey.get(entityKey)
    const decision = decideSyncMerge(base, local, remote)

    await processDecision(entityKey, decision, base, local, remote, remoteRecord, true)
  }

  if (pulls.length || localDeletes.length || metadataPromotions.length || conflictInputs.length || clearConflictKeys.size || !result.errors.length) {
    try {
      await db.transaction('rw', syncableTables, async () => {
        for (const snapshot of pulls) {
          await applyRemoteSnapshotToDb(snapshot)
        }

        for (const tombstone of localDeletes) {
          await applyRemoteSnapshotToDb(tombstone)
        }

        for (const metadata of metadataPromotions) {
          await db.syncMetadata.put(metadata)
        }

        for (const entityKey of clearConflictKeys) {
          await clearPendingSyncConflict(entityKey)
        }

        for (const conflict of conflictInputs) {
          await persistSyncConflict({
            ...conflict,
            detectedAt: now(),
          })
        }

        if (!result.errors.length) {
          await db.syncState.put({
            ...syncState,
            lastAttemptAt: attemptedAt,
            lastSuccessfulSyncAt: now(),
          })
        }
      })
    } catch (cause) {
      result.errors.push({ code: 'local-apply-error', cause })
    }
  }

  if (result.errors.length) {
    const madeProgress = result.pushed
      || result.pulled
      || result.remoteDeletes
      || result.localDeletes
      || result.converged
      || result.conflicts
    result.status = madeProgress ? 'partial' : 'failed'
  }

  return result
}

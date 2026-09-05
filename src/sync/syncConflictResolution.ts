import { db } from '../db/database'
import type { SyncMetadata } from '../db/types'
import { applyRemoteSnapshotToDb, assertSnapshotIdentity } from './syncLocalApply'
import { contentFingerprint } from './syncMerge'
import type { SyncEntitySnapshot } from './syncTypes'

export type SyncConflictResolutionStrategy = 'keep-local' | 'use-remote'

export type SyncConflictResolutionResult =
  | { ok: true; strategy: SyncConflictResolutionStrategy; entityKey: string }
  | { ok: false; error: 'not-found' | 'invalid-conflict' | 'apply-failed'; cause?: unknown }

const syncResolutionTables = [
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
] as const

function metadataFromSnapshot(snapshot: SyncEntitySnapshot, lastSyncedAt: string): SyncMetadata {
  return {
    entityKey: snapshot.entityKey,
    entityType: snapshot.entityType,
    baseSnapshot: snapshot,
    lastSyncedFingerprint: contentFingerprint(snapshot),
    lastSyncedAt,
  }
}

function isPendingConflict(conflict: { status: string } | undefined): boolean {
  return conflict?.status === 'pending'
}

export async function resolveSyncConflict(
  entityKey: string,
  strategy: SyncConflictResolutionStrategy,
  options: { now?: () => string } = {},
): Promise<SyncConflictResolutionResult> {
  const now = options.now ?? (() => new Date().toISOString())
  const conflict = await db.syncConflicts
    .where('entityKey')
    .equals(entityKey)
    .and(isPendingConflict)
    .first()

  if (!conflict) return { ok: false, error: 'not-found' }
  if (!conflict.remote) return { ok: false, error: 'invalid-conflict' }

  try {
    assertSnapshotIdentity(conflict.remote)

    await db.transaction('rw', syncResolutionTables, async () => {
      if (strategy === 'use-remote') {
        await applyRemoteSnapshotToDb(conflict.remote!)
      }

      await db.syncMetadata.put(metadataFromSnapshot(conflict.remote!, now()))
      await db.syncConflicts.delete(conflict.id)
    })

    return { ok: true, strategy, entityKey }
  } catch (cause) {
    return { ok: false, error: 'apply-failed', cause }
  }
}

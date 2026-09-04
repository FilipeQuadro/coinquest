import type { SyncEntitySnapshot, SyncEntityType } from './syncTypes'

export type SyncMergeInput = SyncEntitySnapshot | null | undefined

export type SyncMergeDecision =
  | { action: 'noop' }
  | { action: 'push-local'; snapshot: SyncEntitySnapshot }
  | { action: 'pull-remote'; snapshot: SyncEntitySnapshot }
  | { action: 'already-converged'; snapshot: SyncEntitySnapshot }
  | { action: 'conflict'; base: SyncMergeInput; local: SyncMergeInput; remote: SyncMergeInput }
  | { action: 'push-delete'; tombstone: SyncEntitySnapshot }
  | { action: 'delete-local'; tombstone: SyncEntitySnapshot }

export function stableSerialize(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? String(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`
}

const localIdIgnoredEntityTypes = new Set<SyncEntityType>([
  'monthlyBudget',
  'categoryBudget',
  'recurringOccurrenceOverride',
  'cardInvoicePayment',
])

export function normalizeSyncPayloadForComparison(snapshot: SyncEntitySnapshot): unknown {
  if (!snapshot.payload || !localIdIgnoredEntityTypes.has(snapshot.entityType)) {
    return snapshot.payload
  }

  const { id: _localId, ...payloadWithoutLocalId } = snapshot.payload as unknown as Record<string, unknown>
  return payloadWithoutLocalId
}

export function contentFingerprint(snapshot: SyncMergeInput): string {
  if (!snapshot) return 'absent'
  if (snapshot.deleted) return stableSerialize({
    entityType: snapshot.entityType,
    entityKey: snapshot.entityKey,
    deleted: true,
  })

  return stableSerialize({
    entityType: snapshot.entityType,
    entityKey: snapshot.entityKey,
    deleted: false,
    payload: normalizeSyncPayloadForComparison(snapshot),
  })
}

function sameSnapshot(left: SyncMergeInput, right: SyncMergeInput): boolean {
  if (!left && !right) return true
  if (!left || !right) return false
  return contentFingerprint(left) === contentFingerprint(right)
}

function isPresent(snapshot: SyncMergeInput): snapshot is SyncEntitySnapshot {
  return Boolean(snapshot && !snapshot.deleted)
}

function isNoState(snapshot: SyncMergeInput): boolean {
  return !snapshot || snapshot.deleted
}

function isAbsent(snapshot: SyncMergeInput): boolean {
  return !snapshot
}

function isTombstone(snapshot: SyncMergeInput): boolean {
  return Boolean(snapshot?.deleted)
}

export function decideSyncMerge(
  base: SyncMergeInput,
  local: SyncMergeInput,
  remote: SyncMergeInput,
): SyncMergeDecision {
  if (!base) {
    if (isPresent(local) && isTombstone(remote)) return { action: 'conflict', base, local, remote }
    if (isTombstone(local) && isPresent(remote)) return { action: 'conflict', base, local, remote }
    if (isNoState(local) && isNoState(remote)) return { action: 'noop' }
    if (isPresent(local) && isAbsent(remote)) return { action: 'push-local', snapshot: local }
    if (isAbsent(local) && isPresent(remote)) return { action: 'pull-remote', snapshot: remote }
    if (sameSnapshot(local, remote) && local) return { action: 'already-converged', snapshot: local }
    return { action: 'conflict', base, local, remote }
  }

  if (sameSnapshot(local, remote)) {
    if (sameSnapshot(base, local)) return { action: 'noop' }
    if (local) return { action: 'already-converged', snapshot: local }
    return { action: 'noop' }
  }

  const localChanged = !sameSnapshot(base, local)
  const remoteChanged = !sameSnapshot(base, remote)

  if (!localChanged && !remoteChanged) return { action: 'noop' }

  if (localChanged && !remoteChanged) {
    if (local?.deleted) return { action: 'push-delete', tombstone: local }
    if (local) return { action: 'push-local', snapshot: local }
  }

  if (!localChanged && remoteChanged) {
    if (remote?.deleted) return { action: 'delete-local', tombstone: remote }
    if (remote) return { action: 'pull-remote', snapshot: remote }
  }

  return { action: 'conflict', base, local, remote }
}

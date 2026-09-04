import { db } from '../db/database'
import type {
  AppSetting,
  CardInvoicePayment,
  CardPurchase,
  CategoryBudget,
  CreditCard,
  Goal,
  GoalContribution,
  MonthlyBudget,
  RecurringOccurrenceOverride,
  RecurringRule,
  SyncMetadata,
  Transaction,
} from '../db/types'
import { createSyncSnapshot, createSyncTombstone } from './syncIdentity'
import { contentFingerprint } from './syncMerge'
import type { SyncEntitySnapshot } from './syncTypes'

export type LocalSyncSnapshot = Map<string, SyncEntitySnapshot>

export interface LocalSyncSnapshotData {
  transactions: Transaction[]
  goals: Goal[]
  goalContributions: GoalContribution[]
  settings: AppSetting[]
  monthlyBudgets: MonthlyBudget[]
  categoryBudgets: CategoryBudget[]
  recurringRules: RecurringRule[]
  recurringOccurrenceOverrides: RecurringOccurrenceOverride[]
  creditCards: CreditCard[]
  cardPurchases: CardPurchase[]
  cardInvoicePayments: CardInvoicePayment[]
}

export type LocalSnapshotDiff =
  | { status: 'new'; entityKey: string; snapshot: SyncEntitySnapshot }
  | { status: 'changed'; entityKey: string; snapshot: SyncEntitySnapshot; metadata: SyncMetadata }
  | { status: 'unchanged'; entityKey: string; snapshot: SyncEntitySnapshot | null; metadata?: SyncMetadata }
  | { status: 'deleted'; entityKey: string; tombstone: SyncEntitySnapshot; metadata: SyncMetadata }

function addSnapshot(snapshotMap: LocalSyncSnapshot, snapshot: SyncEntitySnapshot) {
  if (snapshotMap.has(snapshot.entityKey)) {
    throw new Error(`Snapshot local contem entityKey duplicada: ${snapshot.entityKey}.`)
  }

  snapshotMap.set(snapshot.entityKey, snapshot)
}

export async function createLocalSyncSnapshotFromDb(): Promise<LocalSyncSnapshot> {
  const [
    transactions,
    goals,
    goalContributions,
    settings,
    monthlyBudgets,
    categoryBudgets,
    recurringRules,
    recurringOccurrenceOverrides,
    creditCards,
    cardPurchases,
    cardInvoicePayments,
  ] = await Promise.all([
    db.transactions.toArray(),
    db.goals.toArray(),
    db.goalContributions.toArray(),
    db.settings.toArray(),
    db.monthlyBudgets.toArray(),
    db.categoryBudgets.toArray(),
    db.recurringRules.toArray(),
    db.recurringOccurrenceOverrides.toArray(),
    db.creditCards.toArray(),
    db.cardPurchases.toArray(),
    db.cardInvoicePayments.toArray(),
  ])

  return createLocalSyncSnapshot({
    transactions,
    goals,
    goalContributions,
    settings,
    monthlyBudgets,
    categoryBudgets,
    recurringRules,
    recurringOccurrenceOverrides,
    creditCards,
    cardPurchases,
    cardInvoicePayments,
  })
}

export function createLocalSyncSnapshot(data: LocalSyncSnapshotData): LocalSyncSnapshot {
  const snapshotMap: LocalSyncSnapshot = new Map()

  data.transactions.forEach((entity) => addSnapshot(snapshotMap, createSyncSnapshot('transaction', entity)))
  data.goals.forEach((entity) => addSnapshot(snapshotMap, createSyncSnapshot('goal', entity)))
  data.goalContributions.forEach((entity) => addSnapshot(snapshotMap, createSyncSnapshot('goalContribution', entity)))
  data.settings.forEach((entity) => addSnapshot(snapshotMap, createSyncSnapshot('setting', entity)))
  data.monthlyBudgets.forEach((entity) => addSnapshot(snapshotMap, createSyncSnapshot('monthlyBudget', entity)))
  data.categoryBudgets.forEach((entity) => addSnapshot(snapshotMap, createSyncSnapshot('categoryBudget', entity)))
  data.recurringRules.forEach((entity) => addSnapshot(snapshotMap, createSyncSnapshot('recurringRule', entity)))
  data.recurringOccurrenceOverrides.forEach((entity) => addSnapshot(snapshotMap, createSyncSnapshot('recurringOccurrenceOverride', entity)))
  data.creditCards.forEach((entity) => addSnapshot(snapshotMap, createSyncSnapshot('creditCard', entity)))
  data.cardPurchases.forEach((entity) => addSnapshot(snapshotMap, createSyncSnapshot('cardPurchase', entity)))
  data.cardInvoicePayments.forEach((entity) => addSnapshot(snapshotMap, createSyncSnapshot('cardInvoicePayment', entity)))

  return snapshotMap
}

export function diffLocalSnapshot(
  currentSnapshot: ReadonlyMap<string, SyncEntitySnapshot>,
  metadata: readonly SyncMetadata[],
): LocalSnapshotDiff[] {
  const diffs: LocalSnapshotDiff[] = []
  const metadataByKey = new Map(metadata.map((entry) => [entry.entityKey, entry]))

  for (const [entityKey, snapshot] of currentSnapshot) {
    const metadataEntry = metadataByKey.get(entityKey)
    if (!metadataEntry) {
      diffs.push({ status: 'new', entityKey, snapshot })
      continue
    }

    if (contentFingerprint(snapshot) === metadataEntry.lastSyncedFingerprint) {
      diffs.push({ status: 'unchanged', entityKey, snapshot, metadata: metadataEntry })
    } else {
      diffs.push({ status: 'changed', entityKey, snapshot, metadata: metadataEntry })
    }
  }

  for (const metadataEntry of metadata) {
    if (currentSnapshot.has(metadataEntry.entityKey)) continue

    if (metadataEntry.baseSnapshot.deleted) {
      diffs.push({
        status: 'unchanged',
        entityKey: metadataEntry.entityKey,
        snapshot: null,
        metadata: metadataEntry,
      })
      continue
    }

    diffs.push({
      status: 'deleted',
      entityKey: metadataEntry.entityKey,
      tombstone: createSyncTombstone(metadataEntry.entityType, metadataEntry.entityKey),
      metadata: metadataEntry,
    })
  }

  return diffs
}

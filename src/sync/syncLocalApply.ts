import { db } from '../db/database'
import type {
  CardInvoicePayment,
  CategoryBudget,
  MonthlyBudget,
  RecurringOccurrenceOverride,
} from '../db/types'
import { getSyncEntityKey } from './syncIdentity'
import type { SyncEntityByType, SyncEntitySnapshot } from './syncTypes'

type NaturalEntityType =
  | 'monthlyBudget'
  | 'categoryBudget'
  | 'recurringOccurrenceOverride'
  | 'cardInvoicePayment'

function assertPayload(snapshot: SyncEntitySnapshot): asserts snapshot is SyncEntitySnapshot<SyncEntityByType[typeof snapshot.entityType]> {
  if (snapshot.deleted || !snapshot.payload) {
    throw new Error(`Snapshot sem payload para apply: ${snapshot.entityKey}.`)
  }
}

async function findNaturalLocalId(entityType: NaturalEntityType, snapshot: SyncEntitySnapshot) {
  assertPayload(snapshot)

  switch (entityType) {
    case 'monthlyBudget': {
      const payload = snapshot.payload as MonthlyBudget
      const existing = await db.monthlyBudgets
        .where('[year+month]')
        .equals([payload.year, payload.month])
        .first()
      return existing?.id
    }
    case 'categoryBudget': {
      const payload = snapshot.payload as CategoryBudget
      const existing = await db.categoryBudgets
        .where('[year+month+category]')
        .equals([payload.year, payload.month, payload.category])
        .first()
      return existing?.id
    }
    case 'recurringOccurrenceOverride': {
      const payload = snapshot.payload as RecurringOccurrenceOverride
      const existing = await db.recurringOccurrenceOverrides
        .where('[ruleId+year+month]')
        .equals([payload.ruleId, payload.year, payload.month])
        .first()
      return existing?.id
    }
    case 'cardInvoicePayment': {
      const payload = snapshot.payload as CardInvoicePayment
      const existing = await db.cardInvoicePayments
        .where('[cardId+invoiceYear+invoiceMonth]')
        .equals([payload.cardId, payload.invoiceYear, payload.invoiceMonth])
        .first()
      return existing?.id
    }
    default: {
      const exhaustive: never = entityType
      return exhaustive
    }
  }
}

async function applyPresentSnapshot(snapshot: SyncEntitySnapshot) {
  assertPayload(snapshot)

  switch (snapshot.entityType) {
    case 'transaction':
      await db.transactions.put(snapshot.payload as SyncEntityByType['transaction'])
      return
    case 'goal':
      await db.goals.put(snapshot.payload as SyncEntityByType['goal'])
      return
    case 'goalContribution':
      await db.goalContributions.put(snapshot.payload as SyncEntityByType['goalContribution'])
      return
    case 'setting':
      await db.settings.put(snapshot.payload as SyncEntityByType['setting'])
      return
    case 'monthlyBudget': {
      const payload = snapshot.payload as MonthlyBudget
      await db.monthlyBudgets.put({ ...payload, id: await findNaturalLocalId('monthlyBudget', snapshot) ?? payload.id })
      return
    }
    case 'categoryBudget': {
      const payload = snapshot.payload as CategoryBudget
      await db.categoryBudgets.put({ ...payload, id: await findNaturalLocalId('categoryBudget', snapshot) ?? payload.id })
      return
    }
    case 'recurringRule':
      await db.recurringRules.put(snapshot.payload as SyncEntityByType['recurringRule'])
      return
    case 'recurringOccurrenceOverride': {
      const payload = snapshot.payload as RecurringOccurrenceOverride
      await db.recurringOccurrenceOverrides.put({ ...payload, id: await findNaturalLocalId('recurringOccurrenceOverride', snapshot) ?? payload.id })
      return
    }
    case 'creditCard':
      await db.creditCards.put(snapshot.payload as SyncEntityByType['creditCard'])
      return
    case 'cardPurchase':
      await db.cardPurchases.put(snapshot.payload as SyncEntityByType['cardPurchase'])
      return
    case 'cardInvoicePayment': {
      const payload = snapshot.payload as CardInvoicePayment
      await db.cardInvoicePayments.put({ ...payload, id: await findNaturalLocalId('cardInvoicePayment', snapshot) ?? payload.id })
      return
    }
    default: {
      const exhaustive: never = snapshot.entityType
      return exhaustive
    }
  }
}

export async function applyRemoteSnapshotToDb(snapshot: SyncEntitySnapshot) {
  if (!snapshot.deleted) {
    await applyPresentSnapshot(snapshot)
    return
  }

  await deleteLocalSnapshotFromDb(snapshot)
}

export async function deleteLocalSnapshotFromDb(snapshot: SyncEntitySnapshot) {
  switch (snapshot.entityType) {
    case 'transaction':
      await db.transactions.delete(snapshot.entityKey.replace('transaction:', ''))
      return
    case 'goal':
      await db.goals.delete(snapshot.entityKey.replace('goal:', ''))
      return
    case 'goalContribution':
      await db.goalContributions.delete(snapshot.entityKey.replace('goalContribution:', ''))
      return
    case 'setting':
      await db.settings.delete(snapshot.entityKey.replace('setting:', ''))
      return
    case 'monthlyBudget': {
      const [year, month] = snapshot.entityKey.replace('monthlyBudget:', '').split(':').map(Number)
      const existing = await db.monthlyBudgets.where('[year+month]').equals([year, month]).first()
      if (existing) await db.monthlyBudgets.delete(existing.id)
      return
    }
    case 'categoryBudget': {
      const [, yearText, monthText, ...categoryParts] = snapshot.entityKey.split(':')
      const existing = await db.categoryBudgets
        .where('[year+month+category]')
        .equals([Number(yearText), Number(monthText), categoryParts.join(':')])
        .first()
      if (existing) await db.categoryBudgets.delete(existing.id)
      return
    }
    case 'recurringRule':
      await db.recurringRules.delete(snapshot.entityKey.replace('recurringRule:', ''))
      return
    case 'recurringOccurrenceOverride': {
      const [, ruleId, yearText, monthText] = snapshot.entityKey.split(':')
      const existing = await db.recurringOccurrenceOverrides
        .where('[ruleId+year+month]')
        .equals([ruleId, Number(yearText), Number(monthText)])
        .first()
      if (existing) await db.recurringOccurrenceOverrides.delete(existing.id)
      return
    }
    case 'creditCard':
      await db.creditCards.delete(snapshot.entityKey.replace('creditCard:', ''))
      return
    case 'cardPurchase':
      await db.cardPurchases.delete(snapshot.entityKey.replace('cardPurchase:', ''))
      return
    case 'cardInvoicePayment': {
      const [, cardId, yearText, monthText] = snapshot.entityKey.split(':')
      const existing = await db.cardInvoicePayments
        .where('[cardId+invoiceYear+invoiceMonth]')
        .equals([cardId, Number(yearText), Number(monthText)])
        .first()
      if (existing) await db.cardInvoicePayments.delete(existing.id)
      return
    }
    default: {
      const exhaustive: never = snapshot.entityType
      return exhaustive
    }
  }
}

export function assertSnapshotIdentity(snapshot: SyncEntitySnapshot) {
  if (snapshot.deleted) {
    if (snapshot.payload !== null) throw new Error(`Tombstone remoto invalido: ${snapshot.entityKey}.`)
    return
  }

  if (!snapshot.payload || typeof snapshot.payload !== 'object') {
    throw new Error(`Payload remoto invalido: ${snapshot.entityKey}.`)
  }

  const payloadKey = getSyncEntityKey(snapshot.entityType, snapshot.payload as never)
  if (payloadKey !== snapshot.entityKey) {
    throw new Error(`Payload remoto nao corresponde a entityKey: ${snapshot.entityKey}.`)
  }
}

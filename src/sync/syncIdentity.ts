import type { SyncEntityByType, SyncEntitySnapshot, SyncEntityType, SyncTombstone } from './syncTypes'

export function getSyncEntityKey<T extends SyncEntityType>(
  entityType: T,
  entity: SyncEntityByType[T],
): string {
  switch (entityType) {
    case 'transaction': {
      const transaction = entity as SyncEntityByType['transaction']
      return `transaction:${transaction.id}`
    }
    case 'goal': {
      const goal = entity as SyncEntityByType['goal']
      return `goal:${goal.id}`
    }
    case 'goalContribution': {
      const contribution = entity as SyncEntityByType['goalContribution']
      return `goalContribution:${contribution.id}`
    }
    case 'setting': {
      const setting = entity as SyncEntityByType['setting']
      return `setting:${setting.key}`
    }
    case 'monthlyBudget': {
      const budget = entity as SyncEntityByType['monthlyBudget']
      return `monthlyBudget:${budget.year}:${budget.month}`
    }
    case 'categoryBudget': {
      const budget = entity as SyncEntityByType['categoryBudget']
      return `categoryBudget:${budget.year}:${budget.month}:${budget.category}`
    }
    case 'recurringRule': {
      const rule = entity as SyncEntityByType['recurringRule']
      return `recurringRule:${rule.id}`
    }
    case 'recurringOccurrenceOverride': {
      const override = entity as SyncEntityByType['recurringOccurrenceOverride']
      return `recurringOverride:${override.ruleId}:${override.year}:${override.month}`
    }
    case 'creditCard': {
      const card = entity as SyncEntityByType['creditCard']
      return `creditCard:${card.id}`
    }
    case 'cardPurchase': {
      const purchase = entity as SyncEntityByType['cardPurchase']
      return `cardPurchase:${purchase.id}`
    }
    case 'cardInvoicePayment': {
      const payment = entity as SyncEntityByType['cardInvoicePayment']
      return `cardInvoicePayment:${payment.cardId}:${payment.invoiceYear}:${payment.invoiceMonth}`
    }
    default: {
      const exhaustive: never = entityType
      return exhaustive
    }
  }
}

export function createSyncSnapshot<T extends SyncEntityType>(
  entityType: T,
  payload: SyncEntityByType[T],
): SyncEntitySnapshot<SyncEntityByType[T]> {
  return {
    entityType,
    entityKey: getSyncEntityKey(entityType, payload),
    payload,
    deleted: false,
  }
}

export function createSyncTombstone(
  entityType: SyncEntityType,
  entityKey: string,
): SyncTombstone {
  return {
    entityType,
    entityKey,
    payload: null,
    deleted: true,
  }
}

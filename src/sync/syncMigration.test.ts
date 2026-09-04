import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'

const v6Stores = {
  transactions: '&id, occurredAt, createdAt, type, category, paymentMethod, kind',
  goals: '&id, status, createdAt, targetDate, updatedAt',
  goalContributions: '&id, goalId, date, createdAt',
  settings: '&key',
  monthlyBudgets: '&id, &[year+month], year, month, updatedAt',
  categoryBudgets: '&id, &[year+month+category], year, month, category, updatedAt',
  recurringRules: '&id, active, [startYear+startMonth], [endYear+endMonth], updatedAt',
  recurringOccurrenceOverrides: '&id, &[ruleId+year+month], ruleId, [year+month], status, linkedTransactionId',
  creditCards: '&id, active, name, updatedAt',
  cardPurchases: '&id, cardId, purchaseDate, createdAt, updatedAt',
  cardInvoicePayments: '&id, &[cardId+invoiceYear+invoiceMonth], cardId, [invoiceYear+invoiceMonth], linkedTransactionId, paymentDate',
}

describe('sync schema migration', () => {
  beforeEach(async () => {
    await db.delete()
  })

  it('upgrades v6 data to v7 without changing financial records', async () => {
    const legacyDb = new Dexie('coinquest-db')
    legacyDb.version(6).stores(v6Stores)
    await legacyDb.open()
    await legacyDb.table('transactions').add({
      id: 'tx-1',
      type: 'expense',
      kind: 'standard',
      amount: 120,
      description: 'Mercado',
      category: 'Alimentacao',
      paymentMethod: 'pix',
      occurredAt: '2026-09-01',
      createdAt: '2026-09-01T10:00:00.000Z',
    })
    await legacyDb.table('goals').add({
      id: 'goal-1',
      name: 'Novo PC',
      targetAmount: 5000,
      status: 'active',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    })
    legacyDb.close()

    await db.open()

    await expect(db.transactions.toArray()).resolves.toEqual([
      {
        id: 'tx-1',
        type: 'expense',
        kind: 'standard',
        amount: 120,
        description: 'Mercado',
        category: 'Alimentacao',
        paymentMethod: 'pix',
        occurredAt: '2026-09-01',
        createdAt: '2026-09-01T10:00:00.000Z',
      },
    ])
    await expect(db.goals.toArray()).resolves.toHaveLength(1)
    await expect(db.syncMetadata.toArray()).resolves.toEqual([])
    await expect(db.syncState.toArray()).resolves.toEqual([])
    await expect(db.syncConflicts.toArray()).resolves.toEqual([])
  })
})

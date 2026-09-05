import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
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
  Transaction,
} from '../db/types'
import { createSyncSnapshot, createSyncTombstone } from './syncIdentity'
import { applyRemoteSnapshotToDb, deleteLocalSnapshotFromDb } from './syncLocalApply'

const now = '2026-09-01T10:00:00.000Z'

describe('sync local apply', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('upserts id/key based entities without calling user financial services', async () => {
    const transaction: Transaction = {
      id: 'tx-1',
      type: 'expense',
      kind: 'standard',
      amount: 100,
      description: 'Mercado',
      category: 'Alimentacao',
      paymentMethod: 'pix',
      occurredAt: '2026-09-01',
      createdAt: now,
    }
    const goal: Goal = {
      id: 'goal-1',
      name: 'Novo PC',
      targetAmount: 5000,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
    const contribution: GoalContribution = {
      id: 'contribution-1',
      goalId: goal.id,
      amount: 500,
      date: '2026-09-01',
      createdAt: now,
    }
    const setting: AppSetting = { key: 'sound', value: 'on' }
    const rule: RecurringRule = {
      id: 'rule-1',
      type: 'income',
      description: 'Salario',
      amount: 1500,
      category: 'Receita',
      paymentMethod: 'transfer',
      cadence: 'monthly',
      dayOfMonth: 5,
      startYear: 2026,
      startMonth: 8,
      active: true,
      createdAt: now,
      updatedAt: now,
    }
    const card: CreditCard = {
      id: 'card-1',
      name: 'Nubank',
      closingDay: 25,
      dueDay: 2,
      active: true,
      createdAt: now,
      updatedAt: now,
    }
    const purchase: CardPurchase = {
      id: 'purchase-1',
      cardId: card.id,
      description: 'Notebook',
      category: 'Compras',
      totalAmount: 1200,
      purchaseDate: '2026-09-01',
      installmentCount: 4,
      createdAt: now,
      updatedAt: now,
    }

    for (const snapshot of [
      createSyncSnapshot('transaction', transaction),
      createSyncSnapshot('goal', goal),
      createSyncSnapshot('goalContribution', contribution),
      createSyncSnapshot('setting', setting),
      createSyncSnapshot('recurringRule', rule),
      createSyncSnapshot('creditCard', card),
      createSyncSnapshot('cardPurchase', purchase),
    ]) {
      await applyRemoteSnapshotToDb(snapshot)
    }

    await expect(db.transactions.get(transaction.id)).resolves.toEqual(transaction)
    await expect(db.goals.get(goal.id)).resolves.toEqual(goal)
    await expect(db.goalContributions.get(contribution.id)).resolves.toEqual(contribution)
    await expect(db.settings.get(setting.key)).resolves.toEqual(setting)
    await expect(db.recurringRules.get(rule.id)).resolves.toEqual(rule)
    await expect(db.creditCards.get(card.id)).resolves.toEqual(card)
    await expect(db.cardPurchases.get(purchase.id)).resolves.toEqual(purchase)
  })

  it('preserves local ids for entities with natural sync identity', async () => {
    await db.monthlyBudgets.add({
      id: 'local-monthly',
      year: 2026,
      month: 8,
      totalLimit: 1000,
      createdAt: now,
      updatedAt: now,
    })
    await db.categoryBudgets.add({
      id: 'local-category',
      year: 2026,
      month: 8,
      category: 'Alimentacao',
      limit: 300,
      createdAt: now,
      updatedAt: now,
    })
    await db.recurringOccurrenceOverrides.add({
      id: 'local-override',
      ruleId: 'rule-1',
      year: 2026,
      month: 8,
      status: 'skipped',
      createdAt: now,
      updatedAt: now,
    })
    await db.cardInvoicePayments.add({
      id: 'local-payment',
      cardId: 'card-1',
      invoiceYear: 2026,
      invoiceMonth: 8,
      linkedTransactionId: 'tx-old',
      paymentDate: '2026-09-01',
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    })

    await applyRemoteSnapshotToDb(createSyncSnapshot('monthlyBudget', {
      id: 'remote-monthly',
      year: 2026,
      month: 8,
      totalLimit: 1200,
      createdAt: now,
      updatedAt: '2026-09-02T10:00:00.000Z',
    } satisfies MonthlyBudget))
    await applyRemoteSnapshotToDb(createSyncSnapshot('categoryBudget', {
      id: 'remote-category',
      year: 2026,
      month: 8,
      category: 'Alimentacao',
      limit: 350,
      createdAt: now,
      updatedAt: '2026-09-02T10:00:00.000Z',
    } satisfies CategoryBudget))
    await applyRemoteSnapshotToDb(createSyncSnapshot('recurringOccurrenceOverride', {
      id: 'remote-override',
      ruleId: 'rule-1',
      year: 2026,
      month: 8,
      status: 'realized',
      linkedTransactionId: 'tx-1',
      createdAt: now,
      updatedAt: '2026-09-02T10:00:00.000Z',
    } satisfies RecurringOccurrenceOverride))
    await applyRemoteSnapshotToDb(createSyncSnapshot('cardInvoicePayment', {
      id: 'remote-payment',
      cardId: 'card-1',
      invoiceYear: 2026,
      invoiceMonth: 8,
      linkedTransactionId: 'tx-1',
      paymentDate: '2026-09-02',
      paidAt: now,
      createdAt: now,
      updatedAt: '2026-09-02T10:00:00.000Z',
    } satisfies CardInvoicePayment))

    await expect(db.monthlyBudgets.toArray()).resolves.toMatchObject([
      { id: 'local-monthly', totalLimit: 1200 },
    ])
    await expect(db.categoryBudgets.toArray()).resolves.toMatchObject([
      { id: 'local-category', limit: 350 },
    ])
    await expect(db.recurringOccurrenceOverrides.toArray()).resolves.toMatchObject([
      { id: 'local-override', status: 'realized', linkedTransactionId: 'tx-1' },
    ])
    await expect(db.cardInvoicePayments.toArray()).resolves.toMatchObject([
      { id: 'local-payment', linkedTransactionId: 'tx-1', paymentDate: '2026-09-02' },
    ])
  })

  it('deletes natural identity records by canonical key instead of remote uuid', async () => {
    await db.monthlyBudgets.add({
      id: 'local-monthly',
      year: 2026,
      month: 8,
      totalLimit: 1000,
      createdAt: now,
      updatedAt: now,
    })
    await db.categoryBudgets.add({
      id: 'local-category',
      year: 2026,
      month: 8,
      category: 'Alimentacao',
      limit: 300,
      createdAt: now,
      updatedAt: now,
    })
    await db.recurringOccurrenceOverrides.add({
      id: 'local-override',
      ruleId: 'rule-1',
      year: 2026,
      month: 8,
      status: 'skipped',
      createdAt: now,
      updatedAt: now,
    })
    await db.cardInvoicePayments.add({
      id: 'local-payment',
      cardId: 'card-1',
      invoiceYear: 2026,
      invoiceMonth: 8,
      linkedTransactionId: 'tx-1',
      paymentDate: '2026-09-02',
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    })

    await deleteLocalSnapshotFromDb(createSyncTombstone('monthlyBudget', 'monthlyBudget:2026:8'))
    await deleteLocalSnapshotFromDb(createSyncTombstone('categoryBudget', 'categoryBudget:2026:8:Alimentacao'))
    await deleteLocalSnapshotFromDb(createSyncTombstone('recurringOccurrenceOverride', 'recurringOverride:rule-1:2026:8'))
    await deleteLocalSnapshotFromDb(createSyncTombstone('cardInvoicePayment', 'cardInvoicePayment:card-1:2026:8'))

    await expect(db.monthlyBudgets.toArray()).resolves.toEqual([])
    await expect(db.categoryBudgets.toArray()).resolves.toEqual([])
    await expect(db.recurringOccurrenceOverrides.toArray()).resolves.toEqual([])
    await expect(db.cardInvoicePayments.toArray()).resolves.toEqual([])
  })
})

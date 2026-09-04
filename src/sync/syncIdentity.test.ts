import { describe, expect, it } from 'vitest'
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
import { createSyncSnapshot, createSyncTombstone, getSyncEntityKey } from './syncIdentity'

describe('sync identity', () => {
  it('creates canonical keys for UUID-owned entities', () => {
    expect(getSyncEntityKey('transaction', { id: 'tx-1' } as Transaction)).toBe('transaction:tx-1')
    expect(getSyncEntityKey('goal', { id: 'goal-1' } as Goal)).toBe('goal:goal-1')
    expect(getSyncEntityKey('goalContribution', { id: 'contribution-1' } as GoalContribution)).toBe('goalContribution:contribution-1')
    expect(getSyncEntityKey('recurringRule', { id: 'rule-1' } as RecurringRule)).toBe('recurringRule:rule-1')
    expect(getSyncEntityKey('creditCard', { id: 'card-1' } as CreditCard)).toBe('creditCard:card-1')
    expect(getSyncEntityKey('cardPurchase', { id: 'purchase-1' } as CardPurchase)).toBe('cardPurchase:purchase-1')
  })

  it('uses the setting key as canonical identity', () => {
    expect(getSyncEntityKey('setting', { key: 'audio-enabled', value: 'true' } satisfies AppSetting)).toBe('setting:audio-enabled')
  })

  it('uses year and zero-based month for monthly budgets instead of local UUID', () => {
    const budgetA = { id: 'uuid-a', year: 2026, month: 8 } as MonthlyBudget
    const budgetB = { id: 'uuid-b', year: 2026, month: 8 } as MonthlyBudget

    expect(getSyncEntityKey('monthlyBudget', budgetA)).toBe('monthlyBudget:2026:8')
    expect(getSyncEntityKey('monthlyBudget', budgetB)).toBe(getSyncEntityKey('monthlyBudget', budgetA))
  })

  it('uses year, zero-based month and category for category budgets instead of local UUID', () => {
    const budgetA = { id: 'uuid-a', year: 2026, month: 8, category: 'Alimentacao' } as CategoryBudget
    const budgetB = { id: 'uuid-b', year: 2026, month: 8, category: 'Alimentacao' } as CategoryBudget

    expect(getSyncEntityKey('categoryBudget', budgetA)).toBe('categoryBudget:2026:8:Alimentacao')
    expect(getSyncEntityKey('categoryBudget', budgetB)).toBe(getSyncEntityKey('categoryBudget', budgetA))
  })

  it('uses ruleId, year and zero-based month for recurring occurrence overrides', () => {
    const overrideA = { id: 'override-a', ruleId: 'rule-1', year: 2026, month: 1 } as RecurringOccurrenceOverride
    const overrideB = { id: 'override-b', ruleId: 'rule-1', year: 2026, month: 1 } as RecurringOccurrenceOverride

    expect(getSyncEntityKey('recurringOccurrenceOverride', overrideA)).toBe('recurringOverride:rule-1:2026:1')
    expect(getSyncEntityKey('recurringOccurrenceOverride', overrideB)).toBe(getSyncEntityKey('recurringOccurrenceOverride', overrideA))
  })

  it('uses cardId, invoice year and zero-based invoice month for card invoice payments', () => {
    const paymentA = { id: 'payment-a', cardId: 'card-1', invoiceYear: 2026, invoiceMonth: 9 } as CardInvoicePayment
    const paymentB = { id: 'payment-b', cardId: 'card-1', invoiceYear: 2026, invoiceMonth: 9 } as CardInvoicePayment

    expect(getSyncEntityKey('cardInvoicePayment', paymentA)).toBe('cardInvoicePayment:card-1:2026:9')
    expect(getSyncEntityKey('cardInvoicePayment', paymentB)).toBe(getSyncEntityKey('cardInvoicePayment', paymentA))
  })

  it('creates snapshots and tombstones without changing the payload', () => {
    const setting = { key: 'theme', value: 'dark' } satisfies AppSetting
    const snapshot = createSyncSnapshot('setting', setting)
    const tombstone = createSyncTombstone('setting', 'setting:theme')

    expect(snapshot).toEqual({
      entityType: 'setting',
      entityKey: 'setting:theme',
      payload: setting,
      deleted: false,
    })
    expect(tombstone).toEqual({
      entityType: 'setting',
      entityKey: 'setting:theme',
      payload: null,
      deleted: true,
    })
  })
})

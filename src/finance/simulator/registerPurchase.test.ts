import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/database'
import type { CreditCard, Goal, GoalContribution } from '../../db/types'
import { registerSimulatedPurchase } from './registerPurchase'

function card(input: Partial<CreditCard> = {}): CreditCard {
  return {
    id: 'card-1',
    name: 'Inter',
    creditLimit: 2000,
    closingDay: 25,
    dueDay: 2,
    active: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...input,
  }
}

function goal(input: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    name: 'Novo PC',
    targetAmount: 5000,
    status: 'active',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...input,
  }
}

function contribution(input: Partial<GoalContribution> = {}): GoalContribution {
  return {
    id: 'contribution-1',
    goalId: 'goal-1',
    amount: 1000,
    date: '2026-09-01T12:00:00.000Z',
    createdAt: '2026-09-01T12:00:00.000Z',
    ...input,
  }
}

describe('register simulated purchase', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('registers a cash scenario as exactly one standard expense transaction', async () => {
    const result = await registerSimulatedPurchase({
      name: 'Monitor',
      totalAmount: 500,
      purchaseDate: '2026-09-10T12:00:00.000Z',
      mode: 'cash',
      category: 'Compras',
      paymentMethod: 'pix',
    })

    expect(result.kind).toBe('cash')
    await expect(db.transactions.count()).resolves.toBe(1)
    await expect(db.cardPurchases.count()).resolves.toBe(0)
    await expect(db.transactions.toArray()).resolves.toEqual([
      expect.objectContaining({
        type: 'expense',
        kind: 'standard',
        amount: 500,
        description: 'Monitor',
        category: 'Compras',
        paymentMethod: 'pix',
        occurredAt: '2026-09-10T12:00:00.000Z',
      }),
    ])
  })

  it('registers a card 1x scenario as exactly one card purchase and no transaction', async () => {
    await db.creditCards.add(card())

    await registerSimulatedPurchase({
      name: 'SSD',
      totalAmount: 300,
      purchaseDate: '2026-09-20T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      category: 'Compras',
      installmentCount: 1,
    })

    await expect(db.cardPurchases.count()).resolves.toBe(1)
    await expect(db.transactions.count()).resolves.toBe(0)
    await expect(db.cardPurchases.toArray()).resolves.toEqual([
      expect.objectContaining({
        cardId: 'card-1',
        description: 'SSD',
        totalAmount: 300,
        category: 'Compras',
        purchaseDate: '2026-09-20T12:00:00.000Z',
        installmentCount: 1,
      }),
    ])
  })

  it('registers an installment card scenario as one card purchase', async () => {
    await db.creditCards.add(card())

    await registerSimulatedPurchase({
      name: 'Notebook',
      totalAmount: 1200,
      purchaseDate: '2026-09-20T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      category: 'Compras',
      installmentCount: 6,
    })

    await expect(db.cardPurchases.count()).resolves.toBe(1)
    await expect(db.transactions.count()).resolves.toBe(0)
    await expect(db.cardPurchases.toArray()).resolves.toEqual([
      expect.objectContaining({ description: 'Notebook', totalAmount: 1200, installmentCount: 6 }),
    ])
  })

  it('keeps goal and goal contributions unchanged when registering an associated scenario', async () => {
    await db.goals.add(goal())
    await db.goalContributions.add(contribution())
    const goalsBefore = await db.goals.toArray()
    const contributionsBefore = await db.goalContributions.toArray()

    await registerSimulatedPurchase({
      name: 'Novo PC',
      totalAmount: 4000,
      purchaseDate: '2026-09-10T12:00:00.000Z',
      mode: 'cash',
      category: 'Compras',
      paymentMethod: 'pix',
      goalId: 'goal-1',
    })

    await expect(db.goals.toArray()).resolves.toEqual(goalsBefore)
    await expect(db.goalContributions.toArray()).resolves.toEqual(contributionsBefore)
  })

  it('blocks card registration when the card is inactive', async () => {
    await db.creditCards.add(card({ active: false }))

    await expect(registerSimulatedPurchase({
      name: 'GPU',
      totalAmount: 700,
      purchaseDate: '2026-09-20T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      category: 'Compras',
      installmentCount: 1,
    })).rejects.toThrow('Cartao inativo nao aceita novas compras.')

    await expect(db.cardPurchases.count()).resolves.toBe(0)
    await expect(db.transactions.count()).resolves.toBe(0)
  })
})


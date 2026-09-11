import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import { saveMonthlyBudget } from '../finance/budget/budget'
import { saveCreditCard } from '../finance/cards/cards'
import { createGoal } from '../finance/goals/goals'
import { saveRecurringRule } from '../finance/recurring/recurring'
import { recordTransaction } from '../finance/transactions'

const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function deterministicGetRandomValues(array: Uint8Array): Uint8Array {
  for (let index = 0; index < array.length; index += 1) {
    array[index] = (index + 1) * 7
  }
  return array
}

async function withCrypto<T>(cryptoValue: unknown, callback: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: cryptoValue,
  })
  try {
    return await callback()
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'crypto', original)
    } else {
      Reflect.deleteProperty(globalThis, 'crypto')
    }
  }
}

describe('entity id creation without randomUUID', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('creates a Transaction with a secure UUID fallback', async () => {
    await withCrypto({ getRandomValues: deterministicGetRandomValues }, async () => {
      const transaction = await recordTransaction({
        type: 'expense',
        amount: 42,
        description: 'Compra LAN',
        category: 'Teste',
        paymentMethod: 'pix',
        occurredAt: '2026-09-09T12:00:00.000Z',
      })

      expect(transaction.id).toMatch(uuidV4Pattern)
      await expect(db.transactions.get(transaction.id)).resolves.toMatchObject({ description: 'Compra LAN' })
    })
  })

  it.each([
    ['Goal', async () => (await createGoal({ name: 'Notebook', targetAmount: 5000 })).id],
    ['CreditCard', async () => (await saveCreditCard({
      name: 'Cartao LAN',
      creditLimit: 1000,
      closingDay: 25,
      dueDay: 2,
      active: true,
    })).id],
    ['RecurringRule', async () => (await saveRecurringRule({
      type: 'expense',
      description: 'Internet',
      amount: 120,
      category: 'Casa',
      paymentMethod: 'pix',
      dayOfMonth: 10,
      startYear: 2026,
      startMonth: 8,
      active: true,
    })).id],
    ['MonthlyBudget', async () => (await saveMonthlyBudget({ year: 2026, month: 8 }, 1000)).id],
  ] as const)('creates %s with a secure UUID fallback', async (_label, createEntity) => {
    await withCrypto({ getRandomValues: deterministicGetRandomValues }, async () => {
      const id = await createEntity()

      expect(id).toMatch(uuidV4Pattern)
    })
  })
})

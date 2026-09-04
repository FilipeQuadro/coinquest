import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PaymentMethod, Transaction, TransactionType } from '../db/types'
import { db } from '../db/database'
import { financeBus } from '../game/events'
import { deleteTransaction, getMonthlySummary, recordTransaction, updateTransaction, validateTransactionDraft } from './transactions'

const baseTransaction = {
  id: 'tx-1',
  description: 'Pagamento',
  category: 'Renda',
  paymentMethod: 'pix',
  createdAt: '2026-08-10T12:00:00.000Z',
} satisfies Omit<Transaction, 'type' | 'amount' | 'occurredAt'>

function transaction(input: Pick<Transaction, 'id' | 'type' | 'amount' | 'occurredAt'> & Partial<Transaction>): Transaction {
  return {
    ...baseTransaction,
    ...input,
  }
}

describe('getMonthlySummary', () => {
  it('sums income, expenses and balance for the reference month', () => {
    const summary = getMonthlySummary(
      [
        transaction({ id: 'income-1', type: 'income', amount: 1000, occurredAt: '2026-08-01T10:00:00.000Z' }),
        transaction({ id: 'income-2', type: 'income', amount: 250, occurredAt: '2026-08-12T10:00:00.000Z' }),
        transaction({ id: 'expense-1', type: 'expense', amount: 320, occurredAt: '2026-08-14T10:00:00.000Z' }),
        transaction({ id: 'old-expense', type: 'expense', amount: 999, occurredAt: '2026-07-14T10:00:00.000Z' }),
      ],
      new Date('2026-08-28T10:00:00.000Z'),
    )

    expect(summary).toEqual({
      income: 1250,
      expenses: 320,
      balance: 930,
      count: 3,
    })
  })

  it('returns zero values when the month has no transactions', () => {
    const summary = getMonthlySummary(
      [transaction({ id: 'old-income', type: 'income', amount: 700, occurredAt: '2026-07-10T10:00:00.000Z' })],
      new Date('2026-08-28T10:00:00.000Z'),
    )

    expect(summary).toEqual({
      income: 0,
      expenses: 0,
      balance: 0,
      count: 0,
    })
  })
})

describe('validateTransactionDraft', () => {
  const validDraft = {
    type: 'expense',
    amount: 10,
    description: 'Mercado',
    category: 'Alimentacao',
    paymentMethod: 'pix',
    occurredAt: '2026-08-20T10:00:00.000Z',
  } as const

  it('accepts valid transaction drafts', () => {
    expect(validateTransactionDraft(validDraft)).toBeNull()
  })

  it('rejects zero amount', () => {
    expect(validateTransactionDraft({ ...validDraft, amount: 0 })).toBe('Informe um valor valido.')
  })

  it('rejects negative amount', () => {
    expect(validateTransactionDraft({ ...validDraft, amount: -10 })).toBe('Informe um valor valido.')
  })

  it('rejects NaN and Infinity', () => {
    expect(validateTransactionDraft({ ...validDraft, amount: Number.NaN })).toBe('Informe um valor valido.')
    expect(validateTransactionDraft({ ...validDraft, amount: Number.POSITIVE_INFINITY })).toBe('Informe um valor valido.')
  })

  it('rejects empty description', () => {
    expect(validateTransactionDraft({ ...validDraft, description: '   ' })).toBe('Informe uma descricao.')
  })

  it('accepts income and expense types', () => {
    expect(validateTransactionDraft({ ...validDraft, type: 'income' })).toBeNull()
    expect(validateTransactionDraft({ ...validDraft, type: 'expense' })).toBeNull()
  })

  it('rejects invalid type, payment and date values', () => {
    expect(validateTransactionDraft({ ...validDraft, type: 'refund' as TransactionType })).toBe('Tipo de movimentacao invalido.')
    expect(validateTransactionDraft({ ...validDraft, paymentMethod: 'card' as PaymentMethod })).toBe('Forma de pagamento invalida.')
    expect(validateTransactionDraft({ ...validDraft, occurredAt: 'invalid-date' })).toBe('Informe uma data valida.')
    expect(validateTransactionDraft({ ...validDraft, kind: 'card_purchase' as never })).toBe('Tipo interno de movimentacao invalido.')
  })
})

describe('transaction storage', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('removes a transaction from IndexedDB', async () => {
    const item = transaction({ id: 'delete-me', type: 'expense', amount: 39.9, occurredAt: '2026-08-20T10:00:00.000Z' })
    await db.transactions.add(item)

    await deleteTransaction(item.id)

    await expect(db.transactions.get(item.id)).resolves.toBeUndefined()
  })

  it('updates transaction amount and description', async () => {
    const item = transaction({ id: 'edit-value', type: 'expense', amount: 180, occurredAt: '2026-08-20T10:00:00.000Z' })
    await db.transactions.add(item)

    const updated = await updateTransaction(item.id, {
      type: 'expense',
      amount: 80,
      description: 'Mercado semanal',
      category: 'Alimentacao',
      paymentMethod: 'pix',
      occurredAt: item.occurredAt,
    })

    expect(updated.amount).toBe(80)
    expect(updated.description).toBe('Mercado semanal')
    await expect(db.transactions.get(item.id)).resolves.toMatchObject({ amount: 80, description: 'Mercado semanal' })
  })

  it('updates transaction category and payment method', async () => {
    const item = transaction({ id: 'edit-category', type: 'expense', amount: 180, occurredAt: '2026-08-20T10:00:00.000Z' })
    await db.transactions.add(item)

    await updateTransaction(item.id, {
      type: 'expense',
      amount: 180,
      description: item.description,
      category: 'Transporte',
      paymentMethod: 'debit',
      occurredAt: item.occurredAt,
    })

    await expect(db.transactions.get(item.id)).resolves.toMatchObject({ category: 'Transporte', paymentMethod: 'debit' })
  })

  it('updates transaction date without duplicating the record', async () => {
    const item = transaction({ id: 'edit-date', type: 'expense', amount: 180, occurredAt: '2026-08-31T10:00:00.000Z' })
    await db.transactions.add(item)

    await updateTransaction(item.id, {
      type: 'expense',
      amount: 180,
      description: item.description,
      category: item.category,
      paymentMethod: item.paymentMethod,
      occurredAt: '2026-09-01T10:00:00.000Z',
    })

    const records = await db.transactions.toArray()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ id: item.id, occurredAt: '2026-09-01T10:00:00.000Z' })
  })

  it('updates expense to income as the same transaction', async () => {
    const item = transaction({ id: 'edit-type', type: 'expense', amount: 180, occurredAt: '2026-08-20T10:00:00.000Z' })
    await db.transactions.add(item)

    await updateTransaction(item.id, {
      type: 'income',
      amount: 180,
      description: 'Reembolso',
      category: 'Renda',
      paymentMethod: 'transfer',
      occurredAt: item.occurredAt,
    })

    await expect(db.transactions.get(item.id)).resolves.toMatchObject({ type: 'income', description: 'Reembolso' })
  })

  it('rejects updates for missing ids and invalid drafts', async () => {
    await expect(updateTransaction('missing', {
      type: 'expense',
      amount: 10,
      description: 'Mercado',
      category: 'Alimentacao',
      paymentMethod: 'pix',
      occurredAt: '2026-08-20T10:00:00.000Z',
    })).rejects.toThrow('Movimentacao nao encontrada.')

    const item = transaction({ id: 'invalid-update', type: 'expense', amount: 180, occurredAt: '2026-08-20T10:00:00.000Z' })
    await db.transactions.add(item)

    await expect(updateTransaction(item.id, {
      type: 'expense',
      amount: 0,
      description: 'Mercado',
      category: 'Alimentacao',
      paymentMethod: 'pix',
      occurredAt: item.occurredAt,
    })).rejects.toThrow('Informe um valor valido.')
  })

  it('separates created and updated transaction events', async () => {
    let createdEvents = 0
    let updatedEvents = 0
    const createdHandler = () => createdEvents += 1
    const updatedHandler = () => updatedEvents += 1
    financeBus.addEventListener('transaction', createdHandler)
    financeBus.addEventListener('transaction-updated', updatedHandler)

    try {
      const item = await recordTransaction({
        type: 'expense',
        amount: 120,
        description: 'Mercado',
        category: 'Alimentacao',
        paymentMethod: 'pix',
        occurredAt: '2026-08-20T10:00:00.000Z',
      })

      await updateTransaction(item.id, {
        type: 'expense',
        amount: 80,
        description: 'Mercado ajustado',
        category: 'Alimentacao',
        paymentMethod: 'pix',
        occurredAt: item.occurredAt,
      })

      expect(createdEvents).toBe(1)
      expect(updatedEvents).toBe(1)
    } finally {
      financeBus.removeEventListener('transaction', createdHandler)
      financeBus.removeEventListener('transaction-updated', updatedHandler)
    }
  })
})

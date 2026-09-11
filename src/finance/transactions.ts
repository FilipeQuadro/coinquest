import { db } from '../db/database'
import type { PaymentMethod, Transaction, TransactionKind, TransactionType } from '../db/types'
import { emitTransaction, emitTransactionUpdated } from '../game/events'
import { createSecureUuidV4 } from '../utils/createSecureUuidV4'

export interface TransactionDraft {
  type: TransactionType
  kind?: TransactionKind
  amount: number
  description: string
  category: string
  paymentMethod: PaymentMethod
  occurredAt?: string
}

export interface MonthlySummary {
  income: number
  expenses: number
  balance: number
  count: number
}

const transactionTypes = new Set<TransactionType>(['income', 'expense'])
const paymentMethods = new Set<PaymentMethod>(['pix', 'debit', 'credit', 'cash', 'transfer', 'other'])
const transactionKinds = new Set<TransactionKind>(['standard', 'credit_card_payment'])

function createId() {
  return createSecureUuidV4()
}

function normalizeDraft(draft: TransactionDraft): TransactionDraft {
  return {
    ...draft,
    kind: draft.kind ?? 'standard',
    description: draft.description.trim(),
    category: draft.category.trim() || 'Outros',
  }
}

export function validateTransactionDraft(draft: TransactionDraft): string | null {
  const normalized = normalizeDraft(draft)

  if (!transactionTypes.has(normalized.type)) {
    return 'Tipo de movimentacao invalido.'
  }

  if (normalized.kind && !transactionKinds.has(normalized.kind)) {
    return 'Tipo interno de movimentacao invalido.'
  }

  if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) {
    return 'Informe um valor valido.'
  }

  if (!normalized.description) {
    return 'Informe uma descricao.'
  }

  if (!paymentMethods.has(normalized.paymentMethod)) {
    return 'Forma de pagamento invalida.'
  }

  if (normalized.occurredAt) {
    const date = new Date(normalized.occurredAt)
    if (!Number.isFinite(date.getTime())) {
      return 'Informe uma data valida.'
    }
  }

  return null
}

export async function recordTransaction(draft: TransactionDraft): Promise<Transaction> {
  const normalized = normalizeDraft(draft)
  const error = validateTransactionDraft(normalized)

  if (error) {
    throw new Error(error)
  }

  const now = new Date().toISOString()
  const transaction: Transaction = {
    id: createId(),
    ...normalized,
    occurredAt: normalized.occurredAt ?? now,
    createdAt: now,
  }

  await db.transactions.add(transaction)
  emitTransaction(transaction)

  return transaction
}

export async function updateTransaction(id: string, draft: TransactionDraft): Promise<Transaction> {
  const existing = await db.transactions.get(id)
  if (!existing) {
    throw new Error('Movimentacao nao encontrada.')
  }

  const normalized = normalizeDraft(draft)
  const error = validateTransactionDraft(normalized)

  if (error) {
    throw new Error(error)
  }

  const transaction: Transaction = {
    ...existing,
    ...normalized,
    id: existing.id,
    createdAt: existing.createdAt,
    occurredAt: normalized.occurredAt ?? existing.occurredAt,
  }

  await db.transactions.put(transaction)
  emitTransactionUpdated(transaction)

  return transaction
}

export async function deleteTransaction(id: string) {
  await db.transaction('rw', db.transactions, db.cardInvoicePayments, async () => {
    const linkedPayments = await db.cardInvoicePayments.where('linkedTransactionId').equals(id).toArray()
    if (linkedPayments.length > 0) {
      await db.cardInvoicePayments.bulkDelete(linkedPayments.map((payment) => payment.id))
    }
    await db.transactions.delete(id)
  })
}

export function getTransactionKind(transaction: Transaction): TransactionKind {
  return transaction.kind ?? 'standard'
}

export function getMonthlySummary(transactions: Transaction[], referenceDate = new Date()): MonthlySummary {
  const month = transactions.filter((item) => {
    const date = new Date(item.occurredAt)
    return date.getMonth() === referenceDate.getMonth() && date.getFullYear() === referenceDate.getFullYear()
  })

  const income = month.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)
  const expenses = month.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0)

  return {
    income,
    expenses,
    balance: income - expenses,
    count: month.length,
  }
}

import { db } from '../../db/database'
import type { CardInvoicePayment, CardPurchase, CreditCard, PaymentMethod, Transaction } from '../../db/types'
import {
  addMonths,
  clampDayToMonth,
  compareMonths,
  isDateInMonth,
  monthFromDate,
  plannedDateForMonth,
  referenceDateFromMonth,
  type SelectedMonth,
} from '../month'
import { getTransactionKind, recordTransaction, updateTransaction } from '../transactions'

export interface CreditCardDraft {
  name: string
  creditLimit?: number
  closingDay: number
  dueDay: number
  active: boolean
}

export interface CardPurchaseDraft {
  cardId: string
  description: string
  category: string
  totalAmount: number
  purchaseDate: string
  installmentCount: number
}

export interface InvoiceCycle {
  invoiceYear: number
  invoiceMonth: number
  closingDate: string
  dueDate: string
}

export interface InstallmentOccurrence {
  purchaseId: string
  cardId: string
  description: string
  category: string
  installmentNumber: number
  installmentCount: number
  amount: number
  invoiceYear: number
  invoiceMonth: number
  dueDate: string
  status: 'open' | 'paid'
}

export interface CreditCardInvoice {
  cardId: string
  year: number
  month: number
  dueDate: string
  paymentDate?: string
  paidLate?: boolean
  paymentMethod?: PaymentMethod
  installments: InstallmentOccurrence[]
  total: number
  status: 'open' | 'due' | 'overdue' | 'paid'
  linkedTransactionId?: string
}

export interface CreditLimitUsage {
  hasLimit: boolean
  creditLimit: number | null
  committedAmount: number
  availableLimit: number | null
  percentageUsed: number | null
}

export interface InvoicePaymentInput {
  paymentDate?: string
  paymentMethod?: PaymentMethod
}

function createId() {
  return crypto.randomUUID()
}

function invoicePaymentId(cardId: string, month: SelectedMonth) {
  return `${cardId}-${month.year}-${String(month.month + 1).padStart(2, '0')}`
}

function cents(value: number) {
  return Math.round(value * 100)
}

function money(valueInCents: number) {
  return valueInCents / 100
}

function compareLocalCalendarDates(aIso: string, bIso: string) {
  const a = new Date(aIso)
  const b = new Date(bIso)

  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return 0

  return (
    a.getFullYear() - b.getFullYear() ||
    a.getMonth() - b.getMonth() ||
    a.getDate() - b.getDate()
  )
}

function normalizeCardDraft(draft: CreditCardDraft): CreditCardDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    active: Boolean(draft.active),
  }
}

function normalizePurchaseDraft(draft: CardPurchaseDraft): CardPurchaseDraft {
  return {
    ...draft,
    description: draft.description.trim(),
    category: draft.category.trim() || 'Outros',
  }
}

export function validateCreditCardDraft(draft: CreditCardDraft): string | null {
  const normalized = normalizeCardDraft(draft)

  if (!normalized.name) return 'Informe o nome do cartao.'
  if (normalized.creditLimit !== undefined && (!Number.isFinite(normalized.creditLimit) || normalized.creditLimit < 0)) {
    return 'Informe um limite valido.'
  }
  if (!Number.isInteger(normalized.closingDay) || normalized.closingDay < 1 || normalized.closingDay > 31) {
    return 'Informe um fechamento entre 1 e 31.'
  }
  if (!Number.isInteger(normalized.dueDay) || normalized.dueDay < 1 || normalized.dueDay > 31) {
    return 'Informe um vencimento entre 1 e 31.'
  }

  return null
}

export function validateCardPurchaseDraft(draft: CardPurchaseDraft): string | null {
  const normalized = normalizePurchaseDraft(draft)

  if (!normalized.cardId.trim()) return 'Escolha um cartao.'
  if (!normalized.description) return 'Informe uma descricao.'
  if (!Number.isFinite(normalized.totalAmount) || normalized.totalAmount <= 0) return 'Informe um valor valido.'
  if (!Number.isInteger(normalized.installmentCount) || normalized.installmentCount < 1 || normalized.installmentCount > 60) {
    return 'Informe parcelas entre 1 e 60.'
  }
  const date = new Date(normalized.purchaseDate)
  if (!Number.isFinite(date.getTime())) return 'Informe uma data valida.'

  return null
}

export function validateInvoicePaymentInput(input: InvoicePaymentInput): string | null {
  const paymentDate = input.paymentDate ?? new Date().toISOString()
  const date = new Date(paymentDate)

  if (!Number.isFinite(date.getTime())) return 'Informe uma data de pagamento valida.'

  return null
}

export function getInvoiceCycle(card: Pick<CreditCard, 'closingDay' | 'dueDay'>, purchaseDateIso: string): InvoiceCycle {
  const purchaseDate = new Date(purchaseDateIso)
  if (!Number.isFinite(purchaseDate.getTime())) throw new Error('Data da compra invalida.')

  const purchaseMonth = monthFromDate(purchaseDate)
  const purchaseDay = purchaseDate.getDate()
  const invoiceMonth = purchaseDay <= clampDayToMonth(card.closingDay, purchaseMonth)
    ? purchaseMonth
    : addMonths(purchaseMonth, 1)
  const closingDate = plannedDateForMonth(card.closingDay, invoiceMonth)
  const dueMonth = card.dueDay <= card.closingDay ? addMonths(invoiceMonth, 1) : invoiceMonth
  const dueDate = plannedDateForMonth(card.dueDay, dueMonth)

  return {
    invoiceYear: invoiceMonth.year,
    invoiceMonth: invoiceMonth.month,
    closingDate: closingDate.toISOString(),
    dueDate: dueDate.toISOString(),
  }
}

export function splitInstallments(totalAmount: number, installmentCount: number) {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) throw new Error('Valor total invalido.')
  if (!Number.isInteger(installmentCount) || installmentCount < 1) throw new Error('Numero de parcelas invalido.')

  const total = cents(totalAmount)
  const base = Math.floor(total / installmentCount)
  const remainder = total % installmentCount

  return Array.from({ length: installmentCount }, (_, index) => money(base + (index < remainder ? 1 : 0)))
}

export function buildInstallmentOccurrences(
  card: CreditCard,
  purchase: CardPurchase,
  payments: CardInvoicePayment[] = [],
  transactions?: Transaction[],
): InstallmentOccurrence[] {
  const firstCycle = getInvoiceCycle(card, purchase.purchaseDate)
  const amounts = splitInstallments(purchase.totalAmount, purchase.installmentCount)
  const activePayments = transactions
    ? payments.filter((payment) => transactions.some((transaction) => transaction.id === payment.linkedTransactionId))
    : payments

  return amounts.map((amount, index) => {
    const invoiceMonth = addMonths({ year: firstCycle.invoiceYear, month: firstCycle.invoiceMonth }, index)
    const dueMonth = card.dueDay <= card.closingDay ? addMonths(invoiceMonth, 1) : invoiceMonth
    const dueDate = plannedDateForMonth(card.dueDay, dueMonth).toISOString()
    const paid = activePayments.some((payment) =>
      payment.cardId === card.id &&
      payment.invoiceYear === invoiceMonth.year &&
      payment.invoiceMonth === invoiceMonth.month,
    )

    return {
      purchaseId: purchase.id,
      cardId: purchase.cardId,
      description: purchase.description,
      category: purchase.category,
      installmentNumber: index + 1,
      installmentCount: purchase.installmentCount,
      amount,
      invoiceYear: invoiceMonth.year,
      invoiceMonth: invoiceMonth.month,
      dueDate,
      status: paid ? 'paid' : 'open',
    }
  })
}

export function buildCreditCardInvoices(
  cards: CreditCard[],
  purchases: CardPurchase[],
  payments: CardInvoicePayment[] = [],
  month: SelectedMonth,
  transactions: Transaction[] = [],
  now = new Date(),
): CreditCardInvoice[] {
  return cards.flatMap((card) => {
    const installments = purchases
      .filter((purchase) => purchase.cardId === card.id)
      .flatMap((purchase) => buildInstallmentOccurrences(card, purchase, payments, transactions))
      .filter((installment) => installment.invoiceYear === month.year && installment.invoiceMonth === month.month)
      .sort((a, b) => a.installmentNumber - b.installmentNumber)
    if (installments.length === 0) return []

    const payment = payments.find((item) => item.cardId === card.id && item.invoiceYear === month.year && item.invoiceMonth === month.month)
    const linkedTransaction = payment?.linkedTransactionId
      ? transactions.find((transaction) => transaction.id === payment.linkedTransactionId)
      : undefined
    const paid = Boolean(payment && linkedTransaction)
    const dueDate = installments[0]?.dueDate ?? plannedDateForMonth(card.dueDay, card.dueDay <= card.closingDay ? addMonths(month, 1) : month).toISOString()
    const paymentDate = linkedTransaction?.occurredAt ?? payment?.paymentDate
    const due = new Date(dueDate)
    const total = money(installments.reduce((sum, installment) => sum + cents(installment.amount), 0))
    let status: CreditCardInvoice['status'] = 'open'

    if (paid) status = 'paid'
    else if (due.getTime() < now.getTime()) status = 'overdue'
    else if (isDateInMonth(dueDate, month)) status = 'due'

    return [{
      cardId: card.id,
      year: month.year,
      month: month.month,
      dueDate,
      paymentDate: paid ? paymentDate : undefined,
      paidLate: paid && paymentDate ? compareLocalCalendarDates(paymentDate, dueDate) > 0 : undefined,
      paymentMethod: paid ? linkedTransaction?.paymentMethod : undefined,
      installments: installments.map((installment) => ({ ...installment, status: paid ? 'paid' : 'open' })),
      total,
      status,
      linkedTransactionId: paid ? payment?.linkedTransactionId : undefined,
    }]
  })
}

export function getCommittedCardExpenses(invoices: CreditCardInvoice[]) {
  return invoices.flatMap((invoice) =>
    invoice.installments.map((installment) => ({
      amount: installment.amount,
      category: installment.category,
    })),
  )
}

export function getUnpaidInvoiceCommitment(invoices: CreditCardInvoice[]) {
  return invoices
    .filter((invoice) => invoice.status !== 'paid')
    .reduce((sum, invoice) => sum + invoice.total, 0)
}

export function calculateCreditLimitUsage(
  card: CreditCard,
  purchases: CardPurchase[],
  payments: CardInvoicePayment[] = [],
  transactions?: Transaction[],
) {
  const installments = purchases
    .filter((purchase) => purchase.cardId === card.id)
    .flatMap((purchase) => buildInstallmentOccurrences(card, purchase, payments, transactions))
  const committedAmount = money(installments
    .filter((installment) => installment.status !== 'paid')
    .reduce((sum, installment) => sum + cents(installment.amount), 0))

  if (card.creditLimit === undefined) {
    return {
      hasLimit: false,
      creditLimit: null,
      committedAmount,
      availableLimit: null,
      percentageUsed: null,
    } satisfies CreditLimitUsage
  }

  return {
    hasLimit: true,
    creditLimit: card.creditLimit,
    committedAmount,
    availableLimit: card.creditLimit - committedAmount,
    percentageUsed: card.creditLimit === 0 ? null : committedAmount / card.creditLimit,
  } satisfies CreditLimitUsage
}

export async function saveCreditCard(draft: CreditCardDraft, id?: string) {
  const normalized = normalizeCardDraft(draft)
  const error = validateCreditCardDraft(normalized)
  if (error) throw new Error(error)

  const existing = id ? await db.creditCards.get(id) : undefined
  if (id && !existing) throw new Error('Cartao nao encontrado.')
  if (existing && (existing.closingDay !== normalized.closingDay || existing.dueDay !== normalized.dueDay)) {
    const purchaseCount = await db.cardPurchases.where('cardId').equals(existing.id).count()
    if (purchaseCount > 0) {
      throw new Error('O ciclo nao pode ser alterado depois que o cartao possui compras cadastradas.')
    }
  }

  const now = new Date().toISOString()
  const card: CreditCard = {
    id: existing?.id ?? id ?? createId(),
    ...normalized,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await db.creditCards.put(card)
  return card
}

export async function deleteCreditCard(id: string) {
  const [purchaseCount, paymentCount] = await Promise.all([
    db.cardPurchases.where('cardId').equals(id).count(),
    db.cardInvoicePayments.where('cardId').equals(id).count(),
  ])

  if (purchaseCount > 0 || paymentCount > 0) {
    throw new Error('Cartao com historico nao pode ser excluido na V1. Desative para preservar os dados.')
  }

  await db.creditCards.delete(id)
}

export async function saveCardPurchase(draft: CardPurchaseDraft, id?: string) {
  const normalized = normalizePurchaseDraft(draft)
  const error = validateCardPurchaseDraft(normalized)
  if (error) throw new Error(error)

  const card = await db.creditCards.get(normalized.cardId)
  if (!card) throw new Error('Cartao nao encontrado.')

  const existing = id ? await db.cardPurchases.get(id) : undefined
  if (id && !existing) throw new Error('Compra nao encontrada.')
  if (!card.active && (!existing || existing.cardId !== card.id)) {
    throw new Error('Cartao inativo nao aceita novas compras.')
  }

  const [payments, transactions] = await Promise.all([db.cardInvoicePayments.toArray(), db.transactions.toArray()])
  const relatedInvoices = existing
    ? buildInstallmentOccurrences(card, existing, payments, transactions)
    : []
  if (relatedInvoices.some((invoice) => invoice.status === 'paid')) {
    throw new Error('Compra com fatura paga nao pode ser alterada na V1.')
  }

  const now = new Date().toISOString()
  const purchase: CardPurchase = {
    id: existing?.id ?? id ?? createId(),
    ...normalized,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await db.cardPurchases.put(purchase)
  return purchase
}

export async function deleteCardPurchase(id: string) {
  const purchase = await db.cardPurchases.get(id)
  if (!purchase) return

  const card = await db.creditCards.get(purchase.cardId)
  if (!card) throw new Error('Cartao nao encontrado.')

  const [payments, transactions] = await Promise.all([db.cardInvoicePayments.toArray(), db.transactions.toArray()])
  const relatedInvoices = buildInstallmentOccurrences(card, purchase, payments, transactions)
  if (relatedInvoices.some((invoice) => invoice.status === 'paid')) {
    throw new Error('Compra com fatura paga nao pode ser excluida na V1.')
  }

  await db.cardPurchases.delete(id)
}

export async function getCardInvoicePayments(month: SelectedMonth) {
  return db.cardInvoicePayments.where('[invoiceYear+invoiceMonth]').equals([month.year, month.month]).toArray()
}

export async function payCreditCardInvoice(invoice: CreditCardInvoice, input: InvoicePaymentInput = {}) {
  const error = validateInvoicePaymentInput(input)
  if (error) throw new Error(error)

  const existing = await db.cardInvoicePayments
    .where('[cardId+invoiceYear+invoiceMonth]')
    .equals([invoice.cardId, invoice.year, invoice.month])
    .first()

  if (existing?.linkedTransactionId) {
    const transaction = await db.transactions.get(existing.linkedTransactionId)
    if (transaction) return transaction
  }

  const card = await db.creditCards.get(invoice.cardId)
  const paymentDate = input.paymentDate ?? new Date().toISOString()
  const paymentMethod = input.paymentMethod ?? 'pix'
  const transaction = await recordTransaction({
    type: 'expense',
    kind: 'credit_card_payment',
    amount: invoice.total,
    description: `Fatura ${card?.name ?? 'cartao'} ${invoice.month + 1}/${invoice.year}`,
    category: 'Cartao',
    paymentMethod,
    occurredAt: paymentDate,
  })
  const now = new Date().toISOString()
  const payment: CardInvoicePayment = {
    id: existing?.id ?? invoicePaymentId(invoice.cardId, invoice),
    cardId: invoice.cardId,
    invoiceYear: invoice.year,
    invoiceMonth: invoice.month,
    linkedTransactionId: transaction.id,
    paymentDate,
    paidAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await db.cardInvoicePayments.put(payment)
  return transaction
}

export async function correctCreditCardInvoicePayment(invoice: CreditCardInvoice, input: InvoicePaymentInput) {
  const error = validateInvoicePaymentInput(input)
  if (error) throw new Error(error)

  const payment = await db.cardInvoicePayments
    .where('[cardId+invoiceYear+invoiceMonth]')
    .equals([invoice.cardId, invoice.year, invoice.month])
    .first()
  if (!payment) throw new Error('Pagamento da fatura nao encontrado.')

  const transaction = await db.transactions.get(payment.linkedTransactionId)
  if (!transaction) {
    await db.cardInvoicePayments.delete(payment.id)
    throw new Error('Transacao de pagamento nao encontrada. A fatura foi reaberta.')
  }

  const paymentDate = input.paymentDate ?? payment.paymentDate ?? transaction.occurredAt
  const paymentMethod = input.paymentMethod ?? transaction.paymentMethod
  const updatedTransaction = await updateTransaction(transaction.id, {
    type: 'expense',
    kind: 'credit_card_payment',
    amount: invoice.total,
    description: transaction.description,
    category: transaction.category,
    paymentMethod,
    occurredAt: paymentDate,
  })
  const now = new Date().toISOString()

  await db.cardInvoicePayments.put({
    ...payment,
    paymentDate,
    updatedAt: now,
  })

  return updatedTransaction
}

export function getStandardExpenseTransactions(transactions: Transaction[]) {
  return transactions.filter((transaction) => transaction.type !== 'expense' || getTransactionKind(transaction) === 'standard')
}

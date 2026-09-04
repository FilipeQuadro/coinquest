import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/database'
import type { CardPurchase, CreditCard, Transaction } from '../../db/types'
import { calculateBudgetProgress } from '../budget/budget'
import { calculateMonthlyOutlook } from '../recurring/recurring'
import { deleteTransaction, getMonthlySummary } from '../transactions'
import {
  buildCreditCardInvoices,
  buildInstallmentOccurrences,
  calculateCreditLimitUsage,
  correctCreditCardInvoicePayment,
  deleteCreditCard,
  deleteCardPurchase,
  getCommittedCardExpenses,
  getInvoiceCycle,
  getUnpaidInvoiceCommitment,
  payCreditCardInvoice,
  saveCardPurchase,
  saveCreditCard,
  splitInstallments,
} from './cards'

const september = { year: 2026, month: 8 }
function card(input: Partial<CreditCard> = {}): CreditCard {
  return {
    id: 'card-1',
    name: 'Nubank',
    creditLimit: 5000,
    closingDay: 25,
    dueDay: 2,
    active: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...input,
  }
}

function purchase(input: Partial<CardPurchase> = {}): CardPurchase {
  return {
    id: 'purchase-1',
    cardId: 'card-1',
    description: 'Notebook',
    category: 'Compras',
    totalAmount: 1200,
    purchaseDate: '2026-09-20T12:00:00.000Z',
    installmentCount: 4,
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
    ...input,
  }
}

function tx(input: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    type: 'expense',
    amount: 300,
    description: 'Fatura Nubank',
    category: 'Cartao',
    paymentMethod: 'pix',
    occurredAt: '2026-10-02T12:00:00.000Z',
    createdAt: '2026-10-02T12:00:00.000Z',
    kind: 'credit_card_payment',
    ...input,
  }
}

describe('credit card invoice cycle', () => {
  it('uses closing day for purchases before, on and after closing', () => {
    expect(getInvoiceCycle(card(), '2026-09-24T12:00:00.000Z')).toMatchObject({
      invoiceYear: 2026,
      invoiceMonth: 8,
    })
    expect(getInvoiceCycle(card(), '2026-09-25T12:00:00.000Z')).toMatchObject({
      invoiceYear: 2026,
      invoiceMonth: 8,
    })
    expect(getInvoiceCycle(card(), '2026-09-26T12:00:00.000Z')).toMatchObject({
      invoiceYear: 2026,
      invoiceMonth: 9,
    })
  })

  it('calculates due date in the same month or next month explicitly', () => {
    expect(getInvoiceCycle(card({ closingDay: 10, dueDay: 20 }), '2026-09-09T12:00:00.000Z').dueDate).toContain('2026-09-20')
    expect(getInvoiceCycle(card({ closingDay: 25, dueDay: 2 }), '2026-09-09T12:00:00.000Z').dueDate).toContain('2026-10-02')
  })

  it('handles december to january and invalid days with month clamping', () => {
    expect(getInvoiceCycle(card(), '2026-12-28T12:00:00.000Z')).toMatchObject({
      invoiceYear: 2027,
      invoiceMonth: 0,
    })
    expect(getInvoiceCycle(card({ closingDay: 31, dueDay: 31 }), '2027-02-27T12:00:00.000Z').closingDate).toContain('2027-02-28')
    expect(getInvoiceCycle(card({ closingDay: 31, dueDay: 31 }), '2028-02-27T12:00:00.000Z').closingDate).toContain('2028-02-29')
  })
})

describe('installments and invoices', () => {
  it('splits installments without losing cents', () => {
    expect(splitInstallments(1200, 4)).toEqual([300, 300, 300, 300])
    expect(splitInstallments(100, 3)).toEqual([33.34, 33.33, 33.33])
    expect(splitInstallments(10, 1)).toEqual([10])
    expect(splitInstallments(3000, 10).reduce((sum, amount) => Math.round((sum + amount) * 100) / 100, 0)).toBe(3000)
  })

  it('generates installments across invoice months and years', () => {
    const occurrences = buildInstallmentOccurrences(card(), purchase({
      totalAmount: 300,
      installmentCount: 3,
      purchaseDate: '2026-12-28T12:00:00.000Z',
    }))

    expect(occurrences.map((item) => `${item.invoiceYear}-${item.invoiceMonth}`)).toEqual([
      '2027-0',
      '2027-1',
      '2027-2',
    ])
    expect(occurrences.at(-1)).toMatchObject({ installmentNumber: 3, installmentCount: 3, amount: 100 })
  })

  it('aggregates invoice totals and status', () => {
    const invoices = buildCreditCardInvoices([card()], [purchase()], [], september, [], new Date('2026-09-10T12:00:00.000Z'))

    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({
      total: 300,
      status: 'open',
      dueDate: expect.stringContaining('2026-10-02'),
    })
    expect(invoices[0].installments).toHaveLength(1)
  })

  it('detects overdue invoices without creating transactions automatically', () => {
    const invoices = buildCreditCardInvoices([card()], [purchase()], [], september, [], new Date('2026-10-05T12:00:00.000Z'))

    expect(invoices[0]).toMatchObject({ status: 'overdue', total: 300 })
  })
})

describe('credit card persistence and payments', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('saves cards and purchases in IndexedDB', async () => {
    const savedCard = await saveCreditCard({
      name: 'Nubank',
      creditLimit: 3000,
      closingDay: 25,
      dueDay: 2,
      active: true,
    })
    const savedPurchase = await saveCardPurchase({
      cardId: savedCard.id,
      description: 'Notebook',
      category: 'Compras',
      totalAmount: 1200,
      purchaseDate: '2026-09-20T12:00:00.000Z',
      installmentCount: 4,
    })

    await expect(db.creditCards.count()).resolves.toBe(1)
    await expect(db.cardPurchases.get(savedPurchase.id)).resolves.toMatchObject({ installmentCount: 4 })
  })

  it('pays an invoice with one credit-card-payment transaction and prevents duplicates', async () => {
    const savedCard = await db.creditCards.add(card())
    await db.cardPurchases.add(purchase({ cardId: savedCard }))
    const invoice = buildCreditCardInvoices([card()], [purchase()], [], september)[0]

    const payment = await payCreditCardInvoice(invoice, { paymentDate: '2026-09-30T12:00:00.000Z' })
    const secondAttempt = await payCreditCardInvoice(invoice, { paymentDate: '2026-10-02T12:00:00.000Z' })

    expect(secondAttempt.id).toBe(payment.id)
    expect(payment).toMatchObject({ type: 'expense', kind: 'credit_card_payment', amount: 300, occurredAt: '2026-09-30T12:00:00.000Z' })
    await expect(db.transactions.count()).resolves.toBe(1)
    await expect(db.cardInvoicePayments.count()).resolves.toBe(1)
    await expect(db.cardInvoicePayments.toArray()).resolves.toEqual([
      expect.objectContaining({ paymentDate: '2026-09-30T12:00:00.000Z' }),
    ])
  })

  it('separates invoice due date from early, on-time and late payment dates', async () => {
    await db.creditCards.add(card())
    await db.cardPurchases.add(purchase())
    const invoice = buildCreditCardInvoices([card()], [purchase()], [], september)[0]
    expect(invoice.dueDate).toContain('2026-10-02')

    const earlyPayment = await payCreditCardInvoice(invoice, { paymentDate: '2026-09-30T12:00:00.000Z' })
    expect(getMonthlySummary([earlyPayment], new Date('2026-09-01T12:00:00.000Z')).expenses).toBe(300)
    expect(getMonthlySummary([earlyPayment], new Date('2026-10-01T12:00:00.000Z')).expenses).toBe(0)

    await deleteTransaction(earlyPayment.id)
    const onTimePayment = await payCreditCardInvoice(invoice, { paymentDate: '2026-10-02T12:00:00.000Z' })
    expect(getMonthlySummary([onTimePayment], new Date('2026-10-01T12:00:00.000Z')).expenses).toBe(300)

    await deleteTransaction(onTimePayment.id)
    const latePayment = await payCreditCardInvoice(invoice, { paymentDate: '2026-10-05T12:00:00.000Z' })
    const paidInvoice = buildCreditCardInvoices([card()], [purchase()], await db.cardInvoicePayments.toArray(), september, [latePayment])[0]
    expect(paidInvoice).toMatchObject({
      status: 'paid',
      paymentDate: '2026-10-05T12:00:00.000Z',
      paidLate: true,
    })
  })

  it('supports early payment across a year boundary without moving invoice competence', async () => {
    await db.creditCards.add(card())
    const decemberPurchase = purchase({
      purchaseDate: '2026-12-20T12:00:00.000Z',
      totalAmount: 300,
      installmentCount: 1,
    })
    await db.cardPurchases.add(decemberPurchase)
    const invoice = buildCreditCardInvoices([card()], [decemberPurchase], [], { year: 2026, month: 11 })[0]

    expect(invoice).toMatchObject({ year: 2026, month: 11, dueDate: expect.stringContaining('2027-01-02') })

    const payment = await payCreditCardInvoice(invoice, { paymentDate: '2026-12-30T12:00:00.000Z' })
    expect(payment.occurredAt).toBe('2026-12-30T12:00:00.000Z')
    expect(getMonthlySummary([payment], new Date('2026-12-01T12:00:00.000Z')).expenses).toBe(300)
  })

  it('reopens an invoice when the linked payment transaction is deleted', async () => {
    await db.creditCards.add(card())
    await db.cardPurchases.add(purchase())
    const invoice = buildCreditCardInvoices([card()], [purchase()], [], september)[0]
    const payment = await payCreditCardInvoice(invoice, { paymentDate: '2026-10-02T12:00:00.000Z' })

    let paidInvoice = buildCreditCardInvoices([card()], [purchase()], await db.cardInvoicePayments.toArray(), september, await db.transactions.toArray())[0]
    expect(paidInvoice.status).toBe('paid')

    await deleteTransaction(payment.id)
    await expect(db.cardInvoicePayments.count()).resolves.toBe(0)
    paidInvoice = buildCreditCardInvoices([card()], [purchase()], await db.cardInvoicePayments.toArray(), september, await db.transactions.toArray(), new Date('2026-09-10T12:00:00.000Z'))[0]
    expect(paidInvoice.status).toBe('open')
  })

  it('blocks destructive purchase edits after paid invoices and allows them again if the payment transaction is removed', async () => {
    await db.creditCards.add(card())
    await db.cardPurchases.add(purchase())
    const invoice = buildCreditCardInvoices([card()], [purchase()], [], september)[0]
    const payment = await payCreditCardInvoice(invoice, { paymentDate: '2026-10-02T12:00:00.000Z' })

    await expect(deleteCardPurchase('purchase-1')).rejects.toThrow('Compra com fatura paga nao pode ser excluida na V1.')
    await deleteTransaction(payment.id)
    await expect(deleteCardPurchase('purchase-1')).resolves.toBeUndefined()
    await expect(db.cardPurchases.get('purchase-1')).resolves.toBeUndefined()
  })

  it('calculates available limit from unpaid installments', async () => {
    await db.creditCards.add(card({ creditLimit: 1000 }))
    await db.cardPurchases.add(purchase({ totalAmount: 600, installmentCount: 3 }))
    const invoice = buildCreditCardInvoices([card({ creditLimit: 1000 })], [purchase({ totalAmount: 600, installmentCount: 3 })], [], september)[0]

    expect(calculateCreditLimitUsage(card({ creditLimit: 1000 }), [purchase({ totalAmount: 600, installmentCount: 3 })])).toMatchObject({
      committedAmount: 600,
      availableLimit: 400,
      percentageUsed: 0.6,
    })

    await payCreditCardInvoice(invoice, { paymentDate: '2026-10-02T12:00:00.000Z' })
    expect(calculateCreditLimitUsage(
      card({ creditLimit: 1000 }),
      [purchase({ totalAmount: 600, installmentCount: 3 })],
      await db.cardInvoicePayments.toArray(),
      await db.transactions.toArray(),
    )).toMatchObject({
      committedAmount: 400,
      availableLimit: 600,
    })
  })

  it('corrects payment date and method while keeping the invoice paid and budget non-duplicated', async () => {
    await db.creditCards.add(card())
    await db.cardPurchases.add(purchase())
    const invoice = buildCreditCardInvoices([card()], [purchase()], [], september)[0]
    const payment = await payCreditCardInvoice(invoice, {
      paymentDate: '2026-10-02T12:00:00.000Z',
      paymentMethod: 'pix',
    })
    const corrected = await correctCreditCardInvoicePayment(invoice, {
      paymentDate: '2026-09-30T12:00:00.000Z',
      paymentMethod: 'debit',
    })

    expect(corrected.id).toBe(payment.id)
    expect(corrected).toMatchObject({
      occurredAt: '2026-09-30T12:00:00.000Z',
      paymentMethod: 'debit',
      kind: 'credit_card_payment',
      amount: 300,
    })
    await expect(db.cardInvoicePayments.toArray()).resolves.toEqual([
      expect.objectContaining({ paymentDate: '2026-09-30T12:00:00.000Z' }),
    ])
    expect(getMonthlySummary([corrected], new Date('2026-09-01T12:00:00.000Z')).expenses).toBe(300)
    expect(getMonthlySummary([corrected], new Date('2026-10-01T12:00:00.000Z')).expenses).toBe(0)
    expect(buildCreditCardInvoices([card()], [purchase()], await db.cardInvoicePayments.toArray(), september, await db.transactions.toArray())[0].status).toBe('paid')

    const budget = { id: 'budget', year: 2026, month: 8, totalLimit: 1000, createdAt: '', updatedAt: '' }
    const directExpense = tx({ id: 'direct', kind: 'standard', amount: 500, category: 'Casa', occurredAt: '2026-09-12T12:00:00.000Z' })
    const committed = getCommittedCardExpenses(buildCreditCardInvoices([card()], [purchase()], await db.cardInvoicePayments.toArray(), september, await db.transactions.toArray()))
    expect(calculateBudgetProgress(budget, [directExpense, corrected], september, committed).spent).toBe(800)
  })

  it('edits card name, limit and active state while preserving existing invoices', async () => {
    const savedCard = await saveCreditCard({
      name: 'Roxo',
      creditLimit: 1000,
      closingDay: 25,
      dueDay: 2,
      active: true,
    })
    await saveCardPurchase({
      cardId: savedCard.id,
      description: 'Curso',
      category: 'Estudos',
      totalAmount: 300,
      purchaseDate: '2026-09-20T12:00:00.000Z',
      installmentCount: 1,
    })

    const disabled = await saveCreditCard({
      name: 'Roxo Tech',
      creditLimit: 1500,
      closingDay: 25,
      dueDay: 2,
      active: false,
    }, savedCard.id)

    expect(disabled).toMatchObject({ name: 'Roxo Tech', creditLimit: 1500, active: false })
    await expect(saveCardPurchase({
      cardId: savedCard.id,
      description: 'Mouse',
      category: 'Compras',
      totalAmount: 100,
      purchaseDate: '2026-09-21T12:00:00.000Z',
      installmentCount: 1,
    })).rejects.toThrow('Cartao inativo nao aceita novas compras.')

    const invoices = buildCreditCardInvoices([disabled], await db.cardPurchases.toArray(), [], september)
    expect(invoices[0]).toMatchObject({ total: 300 })

    const reactivated = await saveCreditCard({
      name: 'Roxo Tech',
      creditLimit: 1500,
      closingDay: 25,
      dueDay: 2,
      active: true,
    }, savedCard.id)
    expect(reactivated.active).toBe(true)
  })

  it('locks closing and due days after purchases but allows cycle edits before history exists', async () => {
    const emptyCard = await saveCreditCard({
      name: 'Sem compras',
      creditLimit: undefined,
      closingDay: 10,
      dueDay: 20,
      active: true,
    })
    await expect(saveCreditCard({
      name: 'Sem compras',
      creditLimit: undefined,
      closingDay: 12,
      dueDay: 22,
      active: true,
    }, emptyCard.id)).resolves.toMatchObject({ closingDay: 12, dueDay: 22 })

    await db.creditCards.add(card())
    await db.cardPurchases.add(purchase())
    await expect(saveCreditCard({
      name: 'Nubank',
      creditLimit: 5000,
      closingDay: 20,
      dueDay: 2,
      active: true,
    }, 'card-1')).rejects.toThrow('O ciclo nao pode ser alterado depois que o cartao possui compras cadastradas.')
  })

  it('deletes only cards without purchase or payment history', async () => {
    const emptyCard = await saveCreditCard({
      name: 'Temporario',
      creditLimit: undefined,
      closingDay: 5,
      dueDay: 15,
      active: true,
    })
    await deleteCreditCard(emptyCard.id)
    await expect(db.creditCards.get(emptyCard.id)).resolves.toBeUndefined()

    await db.creditCards.add(card())
    await db.cardPurchases.add(purchase())
    await expect(deleteCreditCard('card-1')).rejects.toThrow('Cartao com historico nao pode ser excluido na V1.')
  })
})

describe('budget and outlook integration', () => {
  it('counts direct expenses plus card installments in budget without counting invoice payment twice', () => {
    const budget = { id: 'budget', year: 2026, month: 8, totalLimit: 1000, createdAt: '', updatedAt: '' }
    const directExpense = tx({
      id: 'direct',
      kind: 'standard',
      amount: 500,
      category: 'Casa',
      occurredAt: '2026-09-12T12:00:00.000Z',
    })
    const invoicePayment = tx({
      id: 'invoice-payment',
      kind: 'credit_card_payment',
      amount: 300,
      category: 'Cartao',
      occurredAt: '2026-10-02T12:00:00.000Z',
    })
    const committed = getCommittedCardExpenses(buildCreditCardInvoices([card()], [purchase()], [], september))

    expect(calculateBudgetProgress(budget, [directExpense], september, committed)).toMatchObject({
      spent: 800,
      percentageUsed: 0.8,
    })
    expect(calculateBudgetProgress(budget, [directExpense, invoicePayment], september, committed)).toMatchObject({
      spent: 800,
      percentageUsed: 0.8,
    })
  })

  it('keeps unpaid and paid invoices from being counted twice in MonthlyOutlook', () => {
    const actualIncome = tx({
      id: 'income',
      type: 'income',
      kind: 'standard',
      amount: 1000,
      category: 'Renda',
      occurredAt: '2026-09-01T12:00:00.000Z',
    })
    const invoicePayment = tx({
      id: 'invoice-payment',
      kind: 'credit_card_payment',
      amount: 300,
      occurredAt: '2026-09-20T12:00:00.000Z',
    })

    const unpaidCommitment = getUnpaidInvoiceCommitment(buildCreditCardInvoices([card({ closingDay: 10, dueDay: 20 })], [purchase({
      totalAmount: 300,
      installmentCount: 1,
      purchaseDate: '2026-09-05T12:00:00.000Z',
    })], [], september, []))
    expect(calculateMonthlyOutlook([actualIncome], [], september, unpaidCommitment)).toMatchObject({
      actualIncome: 1000,
      actualExpense: 0,
      committedCardExpense: 300,
      projectedNet: 700,
    })

    expect(calculateMonthlyOutlook([actualIncome, invoicePayment], [], september, 0)).toMatchObject({
      actualIncome: 1000,
      actualExpense: 300,
      committedCardExpense: 0,
      projectedNet: 700,
    })
  })
})

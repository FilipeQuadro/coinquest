import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/database'
import type {
  CardInvoicePayment,
  CardPurchase,
  CreditCard,
  Goal,
  GoalContribution,
  RecurringOccurrenceOverride,
  RecurringRule,
  Transaction,
} from '../../db/types'
import type { SelectedMonth } from '../month'
import { comparePurchaseScenarios, simulatePurchase, simulatePurchaseFromDb, type PurchaseSimulationInput } from './purchaseSimulator'

const september: SelectedMonth = { year: 2026, month: 8 }
const october: SelectedMonth = { year: 2026, month: 9 }
const now = new Date('2026-09-01T12:00:00.000Z')

function input(overrides: Partial<PurchaseSimulationInput> = {}): PurchaseSimulationInput {
  return {
    transactions: [],
    recurringRules: [],
    recurringOverrides: [],
    creditCards: [],
    cardPurchases: [],
    cardInvoicePayments: [],
    monthlyBudgets: [],
    goals: [],
    goalContributions: [],
    ...overrides,
  }
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    type: 'income',
    kind: 'standard',
    amount: 800,
    description: 'Pagamento',
    category: 'Renda',
    paymentMethod: 'transfer',
    occurredAt: '2026-10-10T12:00:00.000Z',
    createdAt: '2026-10-10T12:00:00.000Z',
    ...overrides,
  }
}

function recurring(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-1',
    type: 'income',
    description: 'Salario',
    amount: 1500,
    category: 'Renda',
    paymentMethod: 'transfer',
    cadence: 'monthly',
    dayOfMonth: 5,
    startYear: 2026,
    startMonth: 8,
    active: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  }
}

function override(overrides: Partial<RecurringOccurrenceOverride> = {}): RecurringOccurrenceOverride {
  return {
    id: 'override-1',
    ruleId: 'rule-1',
    year: 2026,
    month: 8,
    status: 'realized',
    linkedTransactionId: 'tx-1',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  }
}

function card(overrides: Partial<CreditCard> = {}): CreditCard {
  return {
    id: 'card-1',
    name: 'Nubank',
    creditLimit: 1000,
    closingDay: 25,
    dueDay: 2,
    active: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  }
}

function purchase(overrides: Partial<CardPurchase> = {}): CardPurchase {
  return {
    id: 'purchase-1',
    cardId: 'card-1',
    description: 'Compra existente',
    category: 'Compras',
    totalAmount: 400,
    purchaseDate: '2026-09-20T12:00:00.000Z',
    installmentCount: 1,
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
    ...overrides,
  }
}

function payment(overrides: Partial<CardInvoicePayment> = {}): CardInvoicePayment {
  return {
    id: 'payment-1',
    cardId: 'card-1',
    invoiceYear: 2026,
    invoiceMonth: 9,
    linkedTransactionId: 'card-payment',
    paymentDate: '2026-09-30T12:00:00.000Z',
    paidAt: '2026-09-30T13:00:00.000Z',
    createdAt: '2026-09-30T13:00:00.000Z',
    updatedAt: '2026-09-30T13:00:00.000Z',
    ...overrides,
  }
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    name: 'Novo PC',
    targetAmount: 5000,
    status: 'active',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  }
}

function contribution(overrides: Partial<GoalContribution> = {}): GoalContribution {
  return {
    id: 'contribution-1',
    goalId: 'goal-1',
    amount: 2000,
    date: '2026-09-01T12:00:00.000Z',
    createdAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('purchase simulator engine', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('simulates a cash purchase as one hypothetical standard expense', () => {
    const result = simulatePurchase(october, 1, input({ transactions: [tx()] }), {
      name: 'Monitor',
      totalAmount: 500,
      purchaseDate: '2026-10-10T12:00:00.000Z',
      mode: 'cash',
      paymentMethod: 'pix',
    }, now)

    expect(result.baselineMonths[0].projectedNet).toBe(800)
    expect(result.scenarioMonths[0].projectedNet).toBe(300)
    expect(result.monthlyImpact[0].delta).toBe(-500)
    expect(result.summary.impactWithinHorizon).toBe(500)
    expect(result.summary.impactOutsideHorizon).toBe(0)
  })

  it('keeps months before a future cash purchase identical to baseline', () => {
    const result = simulatePurchase(september, 2, input({ transactions: [tx({ occurredAt: '2026-09-10T12:00:00.000Z' })] }), {
      name: 'Cadeira',
      totalAmount: 500,
      purchaseDate: '2026-11-10T12:00:00.000Z',
      mode: 'cash',
    }, now)

    expect(result.monthlyImpact.map((impact) => impact.delta)).toEqual([0, 0])
    expect(result.summary.impactWithinHorizon).toBe(0)
    expect(result.summary.impactOutsideHorizon).toBe(500)
    expect(result.summary.scenarioFullyVisibleInHorizon).toBe(false)
  })

  it('keeps a past cash purchase outside the horizon without duplicating history', () => {
    const result = simulatePurchase(september, 2, input(), {
      name: 'Compra antiga',
      totalAmount: 450,
      purchaseDate: '2026-08-10T12:00:00.000Z',
      mode: 'cash',
    }, now)

    expect(result.monthlyImpact.map((impact) => impact.delta)).toEqual([0, 0])
    expect(result.summary.impactWithinHorizon).toBe(0)
    expect(result.summary.impactOutsideHorizon).toBe(450)
    expect(result.summary.scenarioFullyVisibleInHorizon).toBe(false)
  })

  it('simulates card 1x through the invoice cycle instead of immediate cash', () => {
    const result = simulatePurchase(september, 2, input({ creditCards: [card()] }), {
      name: 'SSD',
      totalAmount: 100,
      purchaseDate: '2026-09-26T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      installmentCount: 1,
    }, now)

    expect(result.monthlyImpact[0].delta).toBe(0)
    expect(result.monthlyImpact[1].delta).toBe(-100)
    expect(result.summary.affectedMonths).toEqual([{ year: 2026, month: 9 }])
  })

  it('simulates four installments in consecutive invoice months', () => {
    const result = simulatePurchase(september, 4, input({ creditCards: [card()] }), {
      name: 'Notebook',
      totalAmount: 1200,
      purchaseDate: '2026-09-20T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      installmentCount: 4,
    }, now)

    expect(result.monthlyImpact.map((impact) => impact.delta)).toEqual([-300, -300, -300, -300])
    expect(result.summary.impactWithinHorizon).toBe(1200)
    expect(result.summary.scenarioFullyVisibleInHorizon).toBe(true)
  })

  it('preserves cents across installment projection', () => {
    const result = simulatePurchase(september, 3, input({ creditCards: [card()] }), {
      name: 'Licenca',
      totalAmount: 100,
      purchaseDate: '2026-09-20T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      installmentCount: 3,
    }, now)

    expect(result.monthlyImpact.map((impact) => impact.delta)).toEqual([-33.34, -33.33, -33.33])
    expect(result.summary.impactWithinHorizon).toBe(100)
  })

  it('respects before, on and after closing day invoice rules', () => {
    const beforeClosing = simulatePurchase(september, 2, input({ creditCards: [card()] }), {
      name: 'Antes',
      totalAmount: 90,
      purchaseDate: '2026-09-24T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      installmentCount: 1,
    }, now)
    const onClosing = simulatePurchase(september, 2, input({ creditCards: [card()] }), {
      name: 'No fechamento',
      totalAmount: 90,
      purchaseDate: '2026-09-25T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      installmentCount: 1,
    }, now)
    const afterClosing = simulatePurchase(september, 2, input({ creditCards: [card()] }), {
      name: 'Depois',
      totalAmount: 90,
      purchaseDate: '2026-09-26T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      installmentCount: 1,
    }, now)

    expect(beforeClosing.monthlyImpact.map((impact) => impact.delta)).toEqual([-90, 0])
    expect(onClosing.monthlyImpact.map((impact) => impact.delta)).toEqual([-90, 0])
    expect(afterClosing.monthlyImpact.map((impact) => impact.delta)).toEqual([0, -90])
  })

  it('projects installment impact across a year boundary', () => {
    const result = simulatePurchase({ year: 2026, month: 10 }, 4, input({ creditCards: [card()] }), {
      name: 'Curso',
      totalAmount: 1200,
      purchaseDate: '2026-11-20T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      installmentCount: 4,
    }, now)

    expect(result.summary.affectedMonths).toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
      { year: 2027, month: 0 },
      { year: 2027, month: 1 },
    ])
  })

  it('reports installment impact outside a partial horizon', () => {
    const result = simulatePurchase(september, 3, input({ creditCards: [card({ creditLimit: 5000 })] }), {
      name: 'Notebook',
      totalAmount: 1200,
      purchaseDate: '2026-09-20T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      installmentCount: 12,
    }, now)

    expect(result.summary.impactWithinHorizon).toBe(300)
    expect(result.summary.impactOutsideHorizon).toBe(900)
    expect(result.summary.scenarioFullyVisibleInHorizon).toBe(false)
  })

  it('identifies new negative months without recounting existing negative months', () => {
    const result = simulatePurchase(september, 3, input({
      transactions: [
        tx({ id: 'income-sep', type: 'income', amount: 200, occurredAt: '2026-09-10T12:00:00.000Z' }),
        tx({ id: 'expense-oct', type: 'expense', amount: 50, occurredAt: '2026-10-10T12:00:00.000Z' }),
      ],
    }), {
      name: 'Tela',
      totalAmount: 300,
      purchaseDate: '2026-09-11T12:00:00.000Z',
      mode: 'cash',
    }, now)

    expect(result.summary.baselineNegativeMonths).toEqual([{ year: 2026, month: 9 }])
    expect(result.summary.scenarioNegativeMonths).toEqual([{ year: 2026, month: 8 }, { year: 2026, month: 9 }])
    expect(result.summary.newNegativeMonths).toEqual([{ year: 2026, month: 8 }])
  })

  it('adds hypothetical card purchase to existing card commitments', () => {
    const result = simulatePurchase(september, 1, input({
      creditCards: [card({ creditLimit: 1000 })],
      cardPurchases: [purchase()],
    }), {
      name: 'Mouse',
      totalAmount: 300,
      purchaseDate: '2026-09-20T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      installmentCount: 1,
    }, now)

    expect(result.baselineMonths[0].committedCardExpense).toBe(400)
    expect(result.scenarioMonths[0].committedCardExpense).toBe(700)
    expect(result.monthlyImpact[0].delta).toBe(-300)
    expect(result.cardLimit).toMatchObject({
      availableLimitBefore: 600,
      hypotheticalCommitment: 300,
      availableLimitAfter: 300,
      exceedsCreditLimit: false,
    })
  })

  it('does not double count paid invoice commitments when payment date is in previous month', () => {
    const cardPayment = tx({
      id: 'card-payment',
      type: 'expense',
      kind: 'credit_card_payment',
      amount: 300,
      description: 'Fatura Nubank',
      category: 'Cartao',
      occurredAt: '2026-09-30T12:00:00.000Z',
    })
    const result = simulatePurchase(september, 3, input({
      transactions: [cardPayment],
      creditCards: [card()],
      cardPurchases: [purchase({
        id: 'paid-purchase',
        totalAmount: 300,
        purchaseDate: '2026-09-26T12:00:00.000Z',
      })],
      cardInvoicePayments: [payment()],
    }), {
      name: 'Mouse',
      totalAmount: 100,
      purchaseDate: '2026-10-26T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      installmentCount: 1,
    }, now)

    expect(result.baselineMonths[0].actualExpense).toBe(300)
    expect(result.baselineMonths[1].committedCardExpense).toBe(0)
    expect(result.scenarioMonths[1].committedCardExpense).toBe(0)
    expect(result.scenarioMonths[2].committedCardExpense).toBe(100)
  })

  it('keeps realized recurring values from becoming duplicated by simulation', () => {
    const result = simulatePurchase(september, 1, input({
      transactions: [tx({ id: 'tx-1', type: 'income', amount: 1500, occurredAt: '2026-09-05T12:00:00.000Z' })],
      recurringRules: [recurring()],
      recurringOverrides: [override()],
    }), {
      name: 'Teclado',
      totalAmount: 200,
      purchaseDate: '2026-09-10T12:00:00.000Z',
      mode: 'cash',
    }, now)

    expect(result.baselineMonths[0].projectedIncome).toBe(1500)
    expect(result.scenarioMonths[0].projectedIncome).toBe(1500)
    expect(result.scenarioMonths[0].projectedNet).toBe(1300)
  })

  it('returns objective credit limit status or unknown when limit is missing', () => {
    const limited = simulatePurchase(september, 1, input({ creditCards: [card({ creditLimit: 500 })] }), {
      name: 'GPU',
      totalAmount: 700,
      purchaseDate: '2026-09-20T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      installmentCount: 1,
    }, now)
    const noLimit = simulatePurchase(september, 1, input({ creditCards: [card({ creditLimit: undefined })] }), {
      name: 'GPU',
      totalAmount: 700,
      purchaseDate: '2026-09-20T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      installmentCount: 1,
    }, now)

    expect(limited.cardLimit).toMatchObject({ availableLimitAfter: -200, exceedsCreditLimit: true })
    expect(noLimit.cardLimit).toMatchObject({ hasLimit: false, availableLimitAfter: null, exceedsCreditLimit: null })
  })

  it('returns goal context without reducing purchase impact', () => {
    const result = simulatePurchase(september, 1, input({
      goals: [goal()],
      goalContributions: [contribution()],
    }), {
      name: 'Novo PC',
      totalAmount: 4000,
      purchaseDate: '2026-09-10T12:00:00.000Z',
      mode: 'cash',
      goalId: 'goal-1',
    }, now)

    expect(result.goalContext).toMatchObject({
      allocatedAmount: 2000,
      goalCoverageGap: 2000,
    })
    expect(result.summary.impactWithinHorizon).toBe(4000)
  })

  it('does not mutate projection input arrays or records', () => {
    const original = input({
      transactions: [tx({ occurredAt: '2026-09-10T12:00:00.000Z' })],
      recurringRules: [recurring()],
      creditCards: [card()],
      cardPurchases: [purchase()],
    })
    const before = JSON.stringify(original)

    simulatePurchase(september, 3, original, {
      name: 'Cadeira',
      totalAmount: 500,
      purchaseDate: '2026-09-10T12:00:00.000Z',
      mode: 'cash',
    }, now)

    expect(JSON.stringify(original)).toBe(before)
  })

  it('compares scenarios without choosing a winner', () => {
    const comparison = comparePurchaseScenarios(september, 6, input({ creditCards: [card()] }), [
      {
        name: 'A vista',
        totalAmount: 600,
        purchaseDate: '2026-09-10T12:00:00.000Z',
        mode: 'cash',
      },
      {
        name: 'Cartao 1x',
        totalAmount: 600,
        purchaseDate: '2026-09-10T12:00:00.000Z',
        mode: 'credit_card',
        cardId: 'card-1',
        installmentCount: 1,
      },
      {
        name: 'Cartao 3x',
        totalAmount: 600,
        purchaseDate: '2026-09-10T12:00:00.000Z',
        mode: 'credit_card',
        cardId: 'card-1',
        installmentCount: 3,
      },
    ], now)

    expect(comparison.scenarios).toHaveLength(3)
    expect(comparison).not.toHaveProperty('bestOption')
  })

  it('validates scenario inputs clearly', () => {
    expect(() => simulatePurchase(september, 1, input(), {
      name: '',
      totalAmount: 100,
      purchaseDate: '2026-09-10T12:00:00.000Z',
      mode: 'cash',
    }, now)).toThrow('Informe o nome')

    expect(() => simulatePurchase(september, 1, input({ creditCards: [card()] }), {
      name: 'GPU',
      totalAmount: 100,
      purchaseDate: '2026-09-10T12:00:00.000Z',
      mode: 'credit_card',
      installmentCount: 1,
    }, now)).toThrow('Escolha um cartao')

    expect(() => simulatePurchase(september, 1, input({ creditCards: [card()] }), {
      name: 'GPU',
      totalAmount: 100,
      purchaseDate: '2026-09-10T12:00:00.000Z',
      mode: 'credit_card',
      cardId: 'card-1',
      installmentCount: 13,
    }, now)).toThrow('parcelas entre 1 e 12')
  })

  it('reads from Dexie once for simulation without writing hypothetical records', async () => {
    await db.transactions.add(tx({ id: 'real-tx', occurredAt: '2026-09-10T12:00:00.000Z' }))
    await db.creditCards.add(card())
    await db.cardPurchases.add(purchase())
    await db.goals.add(goal())
    await db.goalContributions.add(contribution())

    const before = {
      transactions: await db.transactions.count(),
      cardPurchases: await db.cardPurchases.count(),
      goalContributions: await db.goalContributions.count(),
    }

    const result = await simulatePurchaseFromDb(september, 2, {
      name: 'Monitor',
      totalAmount: 500,
      purchaseDate: '2026-09-10T12:00:00.000Z',
      mode: 'cash',
      goalId: 'goal-1',
    }, now)

    expect(result.summary.impactWithinHorizon).toBe(500)
    expect({
      transactions: await db.transactions.count(),
      cardPurchases: await db.cardPurchases.count(),
      goalContributions: await db.goalContributions.count(),
    }).toEqual(before)
  })
})

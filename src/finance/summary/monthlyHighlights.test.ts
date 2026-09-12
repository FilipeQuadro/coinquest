import { describe, expect, it } from 'vitest'
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
import { buildMonthlyHighlights } from './monthlyHighlights'

const selectedMonth = { year: 2026, month: 8 }
const now = new Date(2026, 8, 10, 12, 0, 0, 0)

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? 'transaction-1',
    type: overrides.type ?? 'expense',
    amount: overrides.amount ?? 100,
    description: overrides.description ?? 'Pagamento',
    category: overrides.category ?? 'Geral',
    paymentMethod: overrides.paymentMethod ?? 'pix',
    occurredAt: overrides.occurredAt ?? new Date(2026, 8, 10, 12, 0, 0, 0).toISOString(),
    createdAt: overrides.createdAt ?? new Date(2026, 8, 10, 12, 0, 0, 0).toISOString(),
    kind: overrides.kind,
  }
}

function recurringRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: overrides.id ?? 'rule-1',
    type: overrides.type ?? 'expense',
    description: overrides.description ?? 'Internet',
    amount: overrides.amount ?? 100,
    category: overrides.category ?? 'Casa',
    paymentMethod: overrides.paymentMethod ?? 'pix',
    cadence: 'monthly',
    dayOfMonth: overrides.dayOfMonth ?? 15,
    startYear: overrides.startYear ?? 2026,
    startMonth: overrides.startMonth ?? 0,
    active: overrides.active ?? true,
    createdAt: overrides.createdAt ?? '2026-01-01T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T12:00:00.000Z',
    endYear: overrides.endYear,
    endMonth: overrides.endMonth,
  }
}

function recurringOverride(overrides: Partial<RecurringOccurrenceOverride> = {}): RecurringOccurrenceOverride {
  return {
    id: overrides.id ?? 'override-1',
    ruleId: overrides.ruleId ?? 'rule-1',
    year: overrides.year ?? selectedMonth.year,
    month: overrides.month ?? selectedMonth.month,
    status: overrides.status ?? 'skipped',
    linkedTransactionId: overrides.linkedTransactionId,
    createdAt: overrides.createdAt ?? '2026-09-01T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-09-01T12:00:00.000Z',
  }
}

function creditCard(overrides: Partial<CreditCard> = {}): CreditCard {
  return {
    id: overrides.id ?? 'card-1',
    name: overrides.name ?? 'Nubank',
    closingDay: overrides.closingDay ?? 20,
    dueDay: overrides.dueDay ?? 25,
    active: overrides.active ?? true,
    createdAt: overrides.createdAt ?? '2026-01-01T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T12:00:00.000Z',
    creditLimit: overrides.creditLimit,
  }
}

function cardPurchase(overrides: Partial<CardPurchase> = {}): CardPurchase {
  return {
    id: overrides.id ?? 'purchase-1',
    cardId: overrides.cardId ?? 'card-1',
    description: overrides.description ?? 'Monitor',
    category: overrides.category ?? 'Tech',
    totalAmount: overrides.totalAmount ?? 300,
    purchaseDate: overrides.purchaseDate ?? new Date(2026, 8, 1, 12, 0, 0, 0).toISOString(),
    installmentCount: overrides.installmentCount ?? 1,
    createdAt: overrides.createdAt ?? '2026-09-01T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-09-01T12:00:00.000Z',
  }
}

function cardPayment(overrides: Partial<CardInvoicePayment> = {}): CardInvoicePayment {
  return {
    id: overrides.id ?? 'payment-1',
    cardId: overrides.cardId ?? 'card-1',
    invoiceYear: overrides.invoiceYear ?? selectedMonth.year,
    invoiceMonth: overrides.invoiceMonth ?? selectedMonth.month,
    linkedTransactionId: overrides.linkedTransactionId ?? 'payment-transaction',
    paymentDate: overrides.paymentDate ?? new Date(2026, 8, 12, 12, 0, 0, 0).toISOString(),
    paidAt: overrides.paidAt ?? '2026-09-12T12:00:00.000Z',
    createdAt: overrides.createdAt ?? '2026-09-12T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-09-12T12:00:00.000Z',
  }
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: overrides.id ?? 'goal-1',
    name: overrides.name ?? 'Notebook',
    targetAmount: overrides.targetAmount ?? 3000,
    status: overrides.status ?? 'active',
    createdAt: overrides.createdAt ?? '2026-01-01T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T12:00:00.000Z',
    description: overrides.description,
    targetDate: overrides.targetDate,
    monthlyPlan: overrides.monthlyPlan,
    priority: overrides.priority,
  }
}

function contribution(overrides: Partial<GoalContribution> = {}): GoalContribution {
  return {
    id: overrides.id ?? 'contribution-1',
    goalId: overrides.goalId ?? 'goal-1',
    amount: overrides.amount ?? 1000,
    date: overrides.date ?? '2026-09-01T12:00:00.000Z',
    createdAt: overrides.createdAt ?? '2026-09-01T12:00:00.000Z',
    note: overrides.note,
  }
}

function build(overrides: Partial<Parameters<typeof buildMonthlyHighlights>[0]> = {}) {
  return buildMonthlyHighlights({
    selectedMonth,
    transactions: [],
    recurringRules: [],
    recurringOverrides: [],
    creditCards: [],
    cardPurchases: [],
    cardInvoicePayments: [],
    goals: [],
    goalContributions: [],
    now,
    ...overrides,
  })
}

describe('buildMonthlyHighlights', () => {
  it('includes pending expense recurring commitments', () => {
    const highlights = build({
      recurringRules: [recurringRule({ id: 'internet', dayOfMonth: 15, description: 'Internet' })],
    })

    expect(highlights.commitments).toEqual([
      expect.objectContaining({
        id: 'recurring:internet:2026:8',
        kind: 'recurring',
        label: 'Internet',
        amount: 100,
        status: 'pending',
      }),
    ])
  })

  it('does not include recurring income', () => {
    const highlights = build({
      recurringRules: [recurringRule({ type: 'income', description: 'Salario' })],
    })

    expect(highlights.commitments).toHaveLength(0)
  })

  it('does not include realized or skipped recurring commitments', () => {
    const realizedTransaction = transaction({ id: 'salary-paid' })
    const highlights = build({
      transactions: [realizedTransaction],
      recurringRules: [
        recurringRule({ id: 'skipped-rule' }),
        recurringRule({ id: 'realized-rule', description: 'Aluguel' }),
      ],
      recurringOverrides: [
        recurringOverride({ id: 'skip', ruleId: 'skipped-rule', status: 'skipped' }),
        recurringOverride({ id: 'realized', ruleId: 'realized-rule', status: 'realized', linkedTransactionId: realizedTransaction.id }),
      ],
    })

    expect(highlights.commitments).toHaveLength(0)
  })

  it('includes overdue recurring commitments with overdue status', () => {
    const highlights = build({
      recurringRules: [recurringRule({ id: 'rent', description: 'Aluguel', dayOfMonth: 5 })],
    })

    expect(highlights.commitments[0]).toEqual(expect.objectContaining({
      id: 'recurring:rent:2026:8',
      status: 'overdue',
    }))
  })

  it('includes open and due unpaid card invoices as pending commitments', () => {
    const dueCard = creditCard({ id: 'due-card', name: 'Nubank', closingDay: 20, dueDay: 25 })
    const openCard = creditCard({ id: 'open-card', name: 'Inter', closingDay: 20, dueDay: 10 })
    const highlights = build({
      creditCards: [dueCard, openCard],
      cardPurchases: [
        cardPurchase({ id: 'due-purchase', cardId: dueCard.id, totalAmount: 300 }),
        cardPurchase({ id: 'open-purchase', cardId: openCard.id, totalAmount: 200 }),
      ],
    })

    expect(highlights.commitments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'card-invoice:due-card:2026:8', label: 'Fatura Nubank', amount: 300, status: 'pending' }),
      expect.objectContaining({ id: 'card-invoice:open-card:2026:8', label: 'Fatura Inter', amount: 200, status: 'pending' }),
    ]))
  })

  it('does not include paid card invoices', () => {
    const paymentTransaction = transaction({ id: 'payment-transaction', kind: 'credit_card_payment' })
    const highlights = build({
      transactions: [paymentTransaction],
      creditCards: [creditCard()],
      cardPurchases: [cardPurchase()],
      cardInvoicePayments: [cardPayment({ linkedTransactionId: paymentTransaction.id })],
    })

    expect(highlights.commitments).toHaveLength(0)
  })

  it('sorts recurring and card commitments by due date', () => {
    const highlights = build({
      recurringRules: [
        recurringRule({ id: 'later', dayOfMonth: 28, description: 'Condominio' }),
        recurringRule({ id: 'earlier', dayOfMonth: 3, description: 'Internet' }),
      ],
      creditCards: [creditCard({ id: 'middle-card', closingDay: 10, dueDay: 20 })],
      cardPurchases: [cardPurchase({ cardId: 'middle-card' })],
    })

    expect(highlights.commitments.map((item) => item.id)).toEqual([
      'recurring:earlier:2026:8',
      'card-invoice:middle-card:2026:8',
      'recurring:later:2026:8',
    ])
  })

  it('limits commitments to the next three items', () => {
    const highlights = build({
      recurringRules: [
        recurringRule({ id: 'one', dayOfMonth: 1 }),
        recurringRule({ id: 'two', dayOfMonth: 2 }),
        recurringRule({ id: 'three', dayOfMonth: 3 }),
        recurringRule({ id: 'four', dayOfMonth: 4 }),
      ],
    })

    expect(highlights.commitments).toHaveLength(3)
    expect(highlights.commitments.map((item) => item.id)).toEqual([
      'recurring:one:2026:8',
      'recurring:two:2026:8',
      'recurring:three:2026:8',
    ])
  })

  it('selects a high priority goal over medium and low priority goals', () => {
    const highlights = build({
      goals: [
        goal({ id: 'low', name: 'Low', priority: 'low' }),
        goal({ id: 'medium', name: 'Medium', priority: 'medium' }),
        goal({ id: 'high', name: 'High', priority: 'high' }),
      ],
    })

    expect(highlights.featuredGoal?.id).toBe('high')
  })

  it('uses newest createdAt as priority tie breaker', () => {
    const highlights = build({
      goals: [
        goal({ id: 'old', priority: 'medium', createdAt: '2026-01-01T12:00:00.000Z' }),
        goal({ id: 'new', priority: 'medium', createdAt: '2026-02-01T12:00:00.000Z' }),
      ],
    })

    expect(highlights.featuredGoal?.id).toBe('new')
  })

  it('does not feature completed or archived goals', () => {
    const completedGoal = goal({ id: 'completed', status: 'completed' })
    const archivedGoal = goal({ id: 'archived', status: 'archived' })
    const allocatedGoal = goal({ id: 'allocated', targetAmount: 100 })
    const highlights = build({
      goals: [completedGoal, archivedGoal, allocatedGoal],
      goalContributions: [contribution({ goalId: allocatedGoal.id, amount: 100 })],
    })

    expect(highlights.featuredGoal).toBeNull()
  })

  it('uses calculateGoalProgress values for the featured goal', () => {
    const highlights = build({
      goals: [goal({ id: 'notebook', targetAmount: 3000, priority: 'high' })],
      goalContributions: [
        contribution({ id: 'first', goalId: 'notebook', amount: 1000 }),
        contribution({ id: 'second', goalId: 'notebook', amount: 500 }),
      ],
    })

    expect(highlights.featuredGoal).toEqual(expect.objectContaining({
      id: 'notebook',
      targetAmount: 3000,
      allocatedAmount: 1500,
      remainingAmount: 1500,
      percentageDisplay: 50,
      priority: 'high',
    }))
  })

  it('returns null when there is no valid featured goal', () => {
    const highlights = build()

    expect(highlights.featuredGoal).toBeNull()
  })
})

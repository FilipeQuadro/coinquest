import Dexie, { type EntityTable } from 'dexie'
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
} from './types'

class CoinQuestDatabase extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>
  goals!: EntityTable<Goal, 'id'>
  goalContributions!: EntityTable<GoalContribution, 'id'>
  settings!: EntityTable<AppSetting, 'key'>
  monthlyBudgets!: EntityTable<MonthlyBudget, 'id'>
  categoryBudgets!: EntityTable<CategoryBudget, 'id'>
  recurringRules!: EntityTable<RecurringRule, 'id'>
  recurringOccurrenceOverrides!: EntityTable<RecurringOccurrenceOverride, 'id'>
  creditCards!: EntityTable<CreditCard, 'id'>
  cardPurchases!: EntityTable<CardPurchase, 'id'>
  cardInvoicePayments!: EntityTable<CardInvoicePayment, 'id'>

  constructor() {
    super('coinquest-db')

    this.version(1).stores({
      transactions: '&id, occurredAt, createdAt, type, category, paymentMethod',
      goals: '&id, createdAt, targetDate',
      settings: '&key',
    })

    this.version(2).stores({
      transactions: '&id, occurredAt, createdAt, type, category, paymentMethod',
      goals: '&id, createdAt, targetDate',
      settings: '&key',
      monthlyBudgets: '&id, &[year+month], year, month, updatedAt',
      categoryBudgets: '&id, &[year+month+category], year, month, category, updatedAt',
    })

    this.version(3).stores({
      transactions: '&id, occurredAt, createdAt, type, category, paymentMethod',
      goals: '&id, createdAt, targetDate',
      settings: '&key',
      monthlyBudgets: '&id, &[year+month], year, month, updatedAt',
      categoryBudgets: '&id, &[year+month+category], year, month, category, updatedAt',
      recurringRules: '&id, active, [startYear+startMonth], [endYear+endMonth], updatedAt',
      recurringOccurrenceOverrides: '&id, &[ruleId+year+month], ruleId, [year+month], status, linkedTransactionId',
    })

    this.version(4).stores({
      transactions: '&id, occurredAt, createdAt, type, category, paymentMethod, kind',
      goals: '&id, createdAt, targetDate',
      settings: '&key',
      monthlyBudgets: '&id, &[year+month], year, month, updatedAt',
      categoryBudgets: '&id, &[year+month+category], year, month, category, updatedAt',
      recurringRules: '&id, active, [startYear+startMonth], [endYear+endMonth], updatedAt',
      recurringOccurrenceOverrides: '&id, &[ruleId+year+month], ruleId, [year+month], status, linkedTransactionId',
      creditCards: '&id, active, name, updatedAt',
      cardPurchases: '&id, cardId, purchaseDate, createdAt, updatedAt',
      cardInvoicePayments: '&id, &[cardId+invoiceYear+invoiceMonth], cardId, [invoiceYear+invoiceMonth], linkedTransactionId',
    })

    this.version(5).stores({
      transactions: '&id, occurredAt, createdAt, type, category, paymentMethod, kind',
      goals: '&id, createdAt, targetDate',
      settings: '&key',
      monthlyBudgets: '&id, &[year+month], year, month, updatedAt',
      categoryBudgets: '&id, &[year+month+category], year, month, category, updatedAt',
      recurringRules: '&id, active, [startYear+startMonth], [endYear+endMonth], updatedAt',
      recurringOccurrenceOverrides: '&id, &[ruleId+year+month], ruleId, [year+month], status, linkedTransactionId',
      creditCards: '&id, active, name, updatedAt',
      cardPurchases: '&id, cardId, purchaseDate, createdAt, updatedAt',
      cardInvoicePayments: '&id, &[cardId+invoiceYear+invoiceMonth], cardId, [invoiceYear+invoiceMonth], linkedTransactionId, paymentDate',
    }).upgrade(async (transaction) => {
      const paymentTable = transaction.table('cardInvoicePayments')
      const transactionTable = transaction.table('transactions')
      const payments = await paymentTable.toArray() as CardInvoicePayment[]

      await Promise.all(payments
        .filter((payment) => !payment.paymentDate)
        .map(async (payment) => {
          const linkedTransaction = await transactionTable.get(payment.linkedTransactionId) as Transaction | undefined
          await paymentTable.put({
            ...payment,
            paymentDate: linkedTransaction?.occurredAt ?? payment.paidAt,
          })
        }))
    })

    this.version(6).stores({
      transactions: '&id, occurredAt, createdAt, type, category, paymentMethod, kind',
      goals: '&id, status, createdAt, targetDate, updatedAt',
      goalContributions: '&id, goalId, date, createdAt',
      settings: '&key',
      monthlyBudgets: '&id, &[year+month], year, month, updatedAt',
      categoryBudgets: '&id, &[year+month+category], year, month, category, updatedAt',
      recurringRules: '&id, active, [startYear+startMonth], [endYear+endMonth], updatedAt',
      recurringOccurrenceOverrides: '&id, &[ruleId+year+month], ruleId, [year+month], status, linkedTransactionId',
      creditCards: '&id, active, name, updatedAt',
      cardPurchases: '&id, cardId, purchaseDate, createdAt, updatedAt',
      cardInvoicePayments: '&id, &[cardId+invoiceYear+invoiceMonth], cardId, [invoiceYear+invoiceMonth], linkedTransactionId, paymentDate',
    }).upgrade(async (transaction) => {
      type LegacyGoal = Goal & { title?: string; savedAmount?: number }

      const goalTable = transaction.table('goals')
      const contributionTable = transaction.table('goalContributions')
      const goals = await goalTable.toArray() as LegacyGoal[]

      await Promise.all(goals.map(async (goal) => {
        const updatedGoal: Goal = {
          id: goal.id,
          name: goal.name ?? goal.title ?? 'Meta',
          description: goal.description,
          targetAmount: goal.targetAmount,
          targetDate: goal.targetDate,
          monthlyPlan: goal.monthlyPlan,
          status: goal.status ?? 'active',
          priority: goal.priority,
          createdAt: goal.createdAt,
          updatedAt: goal.updatedAt ?? goal.createdAt,
        }

        await goalTable.put(updatedGoal)

        if (goal.savedAmount && Number.isFinite(goal.savedAmount) && goal.savedAmount !== 0) {
          await contributionTable.put({
            id: `legacy-${goal.id}`,
            goalId: goal.id,
            amount: goal.savedAmount,
            date: goal.createdAt,
            note: 'Migrado de valor reservado antigo.',
            createdAt: goal.createdAt,
          } satisfies GoalContribution)
        }
      }))
    })
  }
}

export const db = new CoinQuestDatabase()

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

export const syncEntityTypes = [
  'transaction',
  'goal',
  'goalContribution',
  'setting',
  'monthlyBudget',
  'categoryBudget',
  'recurringRule',
  'recurringOccurrenceOverride',
  'creditCard',
  'cardPurchase',
  'cardInvoicePayment',
] as const

export type SyncEntityType = typeof syncEntityTypes[number]

export interface SyncEntityByType {
  transaction: Transaction
  goal: Goal
  goalContribution: GoalContribution
  setting: AppSetting
  monthlyBudget: MonthlyBudget
  categoryBudget: CategoryBudget
  recurringRule: RecurringRule
  recurringOccurrenceOverride: RecurringOccurrenceOverride
  creditCard: CreditCard
  cardPurchase: CardPurchase
  cardInvoicePayment: CardInvoicePayment
}

export type SyncEntityPayload = SyncEntityByType[SyncEntityType]

export interface SyncEntitySnapshot<TPayload = SyncEntityPayload> {
  entityType: SyncEntityType
  entityKey: string
  payload: TPayload | null
  deleted: boolean
  revision?: string
  hash?: string
}

export type SyncTombstone = SyncEntitySnapshot<null> & {
  payload: null
  deleted: true
}

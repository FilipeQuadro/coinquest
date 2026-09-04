export type TransactionType = 'income' | 'expense'
export type PaymentMethod = 'pix' | 'debit' | 'credit' | 'cash' | 'transfer' | 'other'
export type TransactionKind = 'standard' | 'credit_card_payment'

export interface Transaction {
  id: string
  type: TransactionType
  kind?: TransactionKind
  amount: number
  description: string
  category: string
  paymentMethod: PaymentMethod
  occurredAt: string
  createdAt: string
}

export type GoalStatus = 'active' | 'completed' | 'archived'
export type GoalPriority = 'low' | 'medium' | 'high'

export interface Goal {
  id: string
  name: string
  description?: string
  targetAmount: number
  targetDate?: string
  monthlyPlan?: number
  status: GoalStatus
  priority?: GoalPriority
  createdAt: string
  updatedAt: string
}

export interface GoalContribution {
  id: string
  goalId: string
  amount: number
  date: string
  note?: string
  createdAt: string
}

export interface MonthlyBudget {
  id: string
  year: number
  month: number
  totalLimit: number
  createdAt: string
  updatedAt: string
}

export interface CategoryBudget {
  id: string
  year: number
  month: number
  category: string
  limit: number
  createdAt: string
  updatedAt: string
}

export type RecurringCadence = 'monthly'
export type RecurringOccurrenceStatus = 'pending' | 'overdue' | 'skipped' | 'realized'

export interface RecurringRule {
  id: string
  type: TransactionType
  description: string
  amount: number
  category: string
  paymentMethod: PaymentMethod
  cadence: RecurringCadence
  dayOfMonth: number
  startYear: number
  startMonth: number
  endYear?: number
  endMonth?: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface RecurringOccurrenceOverride {
  id: string
  ruleId: string
  year: number
  month: number
  status: 'skipped' | 'realized'
  linkedTransactionId?: string
  createdAt: string
  updatedAt: string
}

export interface CreditCard {
  id: string
  name: string
  creditLimit?: number
  closingDay: number
  dueDay: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CardPurchase {
  id: string
  cardId: string
  description: string
  category: string
  totalAmount: number
  purchaseDate: string
  installmentCount: number
  createdAt: string
  updatedAt: string
}

export interface CardInvoicePayment {
  id: string
  cardId: string
  invoiceYear: number
  invoiceMonth: number
  linkedTransactionId: string
  paymentDate: string
  paidAt: string
  createdAt: string
  updatedAt: string
}

export interface AppSetting {
  key: string
  value: string
}

export interface SyncMetadata {
  entityKey: string
  entityType: import('../sync/syncTypes').SyncEntityType
  baseSnapshot: import('../sync/syncTypes').SyncEntitySnapshot
  lastSyncedFingerprint: string
  remoteRevision?: string | number
  lastSyncedAt: string
}

export interface SyncState {
  key: 'default'
  deviceId: string
  lastAttemptAt?: string
  lastSuccessfulSyncAt?: string
}

export interface SyncConflict {
  id: string
  entityKey: string
  entityType: import('../sync/syncTypes').SyncEntityType
  base: import('../sync/syncTypes').SyncEntitySnapshot | null
  local: import('../sync/syncTypes').SyncEntitySnapshot | null
  remote: import('../sync/syncTypes').SyncEntitySnapshot | null
  detectedAt: string
  status: 'pending'
}

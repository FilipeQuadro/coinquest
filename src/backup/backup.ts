import { db } from '../db/database'
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

export const backupFormat = 'coinquest-backup'
export const backupVersion = 2
export const backupIntegrityAlgorithm = 'SHA-256'

export interface CoinQuestBackupData {
  transactions: Transaction[]
  goals: Goal[]
  goalContributions: GoalContribution[]
  settings: AppSetting[]
  monthlyBudgets: MonthlyBudget[]
  categoryBudgets: CategoryBudget[]
  recurringRules: RecurringRule[]
  recurringOccurrenceOverrides: RecurringOccurrenceOverride[]
  creditCards: CreditCard[]
  cardPurchases: CardPurchase[]
  cardInvoicePayments: CardInvoicePayment[]
}

export type BackupTableName = keyof CoinQuestBackupData
export type BackupCounts = Record<BackupTableName, number>

export interface BackupManifest {
  counts: BackupCounts
}

export interface BackupIntegrity {
  algorithm: typeof backupIntegrityAlgorithm
  checksum: string
}

export interface CoinQuestBackupV1 {
  format: typeof backupFormat
  version: 1
  exportedAt: string
  appData: CoinQuestBackupData
}

export interface CoinQuestBackupV2 {
  format: typeof backupFormat
  version: 2
  exportedAt: string
  manifest: BackupManifest
  integrity: BackupIntegrity
  appData: CoinQuestBackupData
}

export type CoinQuestBackup = CoinQuestBackupV1 | CoinQuestBackupV2

export interface BackupInspection {
  valid: boolean
  formatVersion: number | null
  exportedAt: string | null
  counts: Partial<BackupCounts>
  integrityStatus: 'verified' | 'missing' | 'failed' | 'not-checked'
  warnings: string[]
  error?: string
}

export const backupTableNames = [
  'transactions',
  'goals',
  'goalContributions',
  'settings',
  'monthlyBudgets',
  'categoryBudgets',
  'recurringRules',
  'recurringOccurrenceOverrides',
  'creditCards',
  'cardPurchases',
  'cardInvoicePayments',
] as const satisfies readonly BackupTableName[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function countBackupData(appData: CoinQuestBackupData): BackupCounts {
  return Object.fromEntries(backupTableNames.map((tableName) => [
    tableName,
    appData[tableName].length,
  ])) as BackupCounts
}

function assertBackupDataShape(value: unknown): asserts value is CoinQuestBackupData {
  if (!isRecord(value)) throw new Error('Dados do backup invalidos.')

  for (const tableName of backupTableNames) {
    if (!Array.isArray(value[tableName])) {
      throw new Error(`Tabela ausente ou invalida no backup: ${tableName}.`)
    }
  }
}

function assertBackupShape(value: unknown): asserts value is CoinQuestBackup {
  if (!isRecord(value)) throw new Error('Arquivo de backup invalido.')
  if (value.format !== backupFormat) throw new Error('Formato de backup invalido.')
  if (value.version !== 1 && value.version !== 2) throw new Error('Versao de backup nao suportada.')
  if (typeof value.exportedAt !== 'string' || !Number.isFinite(new Date(value.exportedAt).getTime())) {
    throw new Error('Data de exportacao do backup invalida.')
  }

  assertBackupDataShape(value.appData)

  if (value.version === 2) {
    if (!isRecord(value.manifest) || !isRecord(value.manifest.counts)) {
      throw new Error('Manifest do backup invalido.')
    }
    if (!isRecord(value.integrity) || value.integrity.algorithm !== backupIntegrityAlgorithm || typeof value.integrity.checksum !== 'string') {
      throw new Error('Integridade do backup invalida.')
    }
  }
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalStringify(item)).join(',')}]`

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
    .join(',')}}`
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function checksumPayload(backup: Pick<CoinQuestBackupV2, 'manifest' | 'appData'>) {
  return {
    appData: backup.appData,
    manifest: backup.manifest,
  }
}

export async function calculateBackupChecksum(backup: Pick<CoinQuestBackupV2, 'manifest' | 'appData'>) {
  return sha256Hex(canonicalStringify(checksumPayload(backup)))
}

function findDuplicates(records: unknown[], key: string) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const record of records) {
    if (!isRecord(record) || typeof record[key] !== 'string') continue
    const value = record[key]
    if (seen.has(value)) duplicates.add(value)
    else seen.add(value)
  }

  return [...duplicates]
}

function assertNoDuplicates(appData: CoinQuestBackupData) {
  const idTables: { table: BackupTableName; key: string }[] = [
    { table: 'transactions', key: 'id' },
    { table: 'goals', key: 'id' },
    { table: 'goalContributions', key: 'id' },
    { table: 'settings', key: 'key' },
    { table: 'monthlyBudgets', key: 'id' },
    { table: 'categoryBudgets', key: 'id' },
    { table: 'recurringRules', key: 'id' },
    { table: 'recurringOccurrenceOverrides', key: 'id' },
    { table: 'creditCards', key: 'id' },
    { table: 'cardPurchases', key: 'id' },
    { table: 'cardInvoicePayments', key: 'id' },
  ]

  for (const { table, key } of idTables) {
    const duplicates = findDuplicates(appData[table], key)
    if (duplicates.length > 0) {
      throw new Error(`Backup contem IDs duplicados em ${table}.`)
    }
  }
}

function assertReferenceIntegrity(appData: CoinQuestBackupData) {
  const goalIds = new Set(appData.goals.map((goal) => goal.id))
  const ruleIds = new Set(appData.recurringRules.map((rule) => rule.id))
  const cardIds = new Set(appData.creditCards.map((card) => card.id))
  const transactionIds = new Set(appData.transactions.map((transaction) => transaction.id))

  if (appData.goalContributions.some((contribution) => !goalIds.has(contribution.goalId))) {
    throw new Error('O backup contem referencias de dados inconsistentes: GoalContribution sem Goal.')
  }

  if (appData.recurringOccurrenceOverrides.some((override) => !ruleIds.has(override.ruleId))) {
    throw new Error('O backup contem referencias de dados inconsistentes: override recorrente sem regra.')
  }

  if (appData.recurringOccurrenceOverrides.some((override) => override.linkedTransactionId && !transactionIds.has(override.linkedTransactionId))) {
    throw new Error('O backup contem referencias de dados inconsistentes: override recorrente sem Transaction vinculada.')
  }

  if (appData.cardPurchases.some((purchase) => !cardIds.has(purchase.cardId))) {
    throw new Error('O backup contem referencias de dados inconsistentes: CardPurchase sem CreditCard.')
  }

  if (appData.cardInvoicePayments.some((payment) => !cardIds.has(payment.cardId))) {
    throw new Error('O backup contem referencias de dados inconsistentes: pagamento de fatura sem CreditCard.')
  }

  if (appData.cardInvoicePayments.some((payment) => !transactionIds.has(payment.linkedTransactionId))) {
    throw new Error('O backup contem referencias de dados inconsistentes: pagamento de fatura sem Transaction vinculada.')
  }
}

function assertManifestCounts(backup: CoinQuestBackupV2) {
  const actualCounts = countBackupData(backup.appData)

  for (const tableName of backupTableNames) {
    if (backup.manifest.counts[tableName] !== actualCounts[tableName]) {
      throw new Error('Manifest do backup nao corresponde aos dados.')
    }
  }
}

async function assertBackupForRestore(backup: CoinQuestBackup) {
  assertNoDuplicates(backup.appData)
  assertReferenceIntegrity(backup.appData)

  if (backup.version === 2) {
    assertManifestCounts(backup)
    const checksum = await calculateBackupChecksum(backup)
    if (checksum !== backup.integrity.checksum) {
      throw new Error('Este backup parece ter sido alterado ou corrompido.')
    }
  }
}

export async function readBackupData(): Promise<CoinQuestBackupData> {
  const [
    transactions,
    goals,
    goalContributions,
    settings,
    monthlyBudgets,
    categoryBudgets,
    recurringRules,
    recurringOccurrenceOverrides,
    creditCards,
    cardPurchases,
    cardInvoicePayments,
  ] = await Promise.all([
    db.transactions.toArray(),
    db.goals.toArray(),
    db.goalContributions.toArray(),
    db.settings.toArray(),
    db.monthlyBudgets.toArray(),
    db.categoryBudgets.toArray(),
    db.recurringRules.toArray(),
    db.recurringOccurrenceOverrides.toArray(),
    db.creditCards.toArray(),
    db.cardPurchases.toArray(),
    db.cardInvoicePayments.toArray(),
  ])

  return {
    transactions,
    goals,
    goalContributions,
    settings,
    monthlyBudgets,
    categoryBudgets,
    recurringRules,
    recurringOccurrenceOverrides,
    creditCards,
    cardPurchases,
    cardInvoicePayments,
  }
}

export async function exportBackup() {
  const appData = await readBackupData()
  const manifest = { counts: countBackupData(appData) }
  const backup: CoinQuestBackupV2 = {
    format: backupFormat,
    version: backupVersion,
    exportedAt: new Date().toISOString(),
    manifest,
    integrity: {
      algorithm: backupIntegrityAlgorithm,
      checksum: await calculateBackupChecksum({ manifest, appData }),
    },
    appData,
  }

  return JSON.stringify(backup, null, 2)
}

export function parseBackup(json: string): CoinQuestBackup {
  let parsed: unknown

  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Arquivo JSON invalido.')
  }

  assertBackupShape(parsed)
  return parsed
}

export async function inspectBackup(json: string): Promise<BackupInspection> {
  try {
    const backup = parseBackup(json)
    await assertBackupForRestore(backup)

    return {
      valid: true,
      formatVersion: backup.version,
      exportedAt: backup.exportedAt,
      counts: backup.version === 2 ? backup.manifest.counts : countBackupData(backup.appData),
      integrityStatus: backup.version === 2 ? 'verified' : 'missing',
      warnings: backup.version === 1 ? ['Backup antigo sem verificacao de integridade.'] : [],
    }
  } catch (caught) {
    let formatVersion: number | null = null
    let exportedAt: string | null = null
    let counts: Partial<BackupCounts> = {}
    let integrityStatus: BackupInspection['integrityStatus'] = 'not-checked'

    try {
      const parsed = JSON.parse(json) as unknown
      if (isRecord(parsed)) {
        formatVersion = typeof parsed.version === 'number' ? parsed.version : null
        exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null
        if (isRecord(parsed.appData)) {
          const appData = parsed.appData
          counts = Object.fromEntries(backupTableNames.map((tableName) => [
            tableName,
            Array.isArray(appData[tableName]) ? appData[tableName].length : 0,
          ])) as Partial<BackupCounts>
        }
        if (formatVersion === 2) integrityStatus = 'failed'
      }
    } catch {
      // Keep the parse error from the main validation path.
    }

    return {
      valid: false,
      formatVersion,
      exportedAt,
      counts,
      integrityStatus,
      warnings: [],
      error: caught instanceof Error ? caught.message : 'Arquivo de backup invalido.',
    }
  }
}

export async function importBackup(json: string) {
  const backup = parseBackup(json)
  await assertBackupForRestore(backup)

  const data = backup.appData
  const tables = [
    db.transactions,
    db.goals,
    db.goalContributions,
    db.settings,
    db.monthlyBudgets,
    db.categoryBudgets,
    db.recurringRules,
    db.recurringOccurrenceOverrides,
    db.creditCards,
    db.cardPurchases,
    db.cardInvoicePayments,
  ]

  await db.transaction(
    'rw',
    tables,
    async () => {
      await Promise.all(backupTableNames.map((tableName) => db[tableName].clear()))

      await db.transactions.bulkAdd(data.transactions)
      await db.goals.bulkAdd(data.goals)
      await db.goalContributions.bulkAdd(data.goalContributions)
      await db.settings.bulkAdd(data.settings)
      await db.monthlyBudgets.bulkAdd(data.monthlyBudgets)
      await db.categoryBudgets.bulkAdd(data.categoryBudgets)
      await db.recurringRules.bulkAdd(data.recurringRules)
      await db.recurringOccurrenceOverrides.bulkAdd(data.recurringOccurrenceOverrides)
      await db.creditCards.bulkAdd(data.creditCards)
      await db.cardPurchases.bulkAdd(data.cardPurchases)
      await db.cardInvoicePayments.bulkAdd(data.cardInvoicePayments)
    },
  )

  return backup
}

export function backupFilename(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `coinquest-backup-${year}-${month}-${day}.json`
}

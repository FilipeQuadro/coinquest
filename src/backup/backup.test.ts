import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import {
  backupFilename,
  backupFormat,
  backupIntegrityAlgorithm,
  backupVersion,
  calculateBackupChecksum,
  exportBackup,
  importBackup,
  inspectBackup,
  parseBackup,
  readBackupData,
  type CoinQuestBackupV1,
  type CoinQuestBackupV2,
} from './backup'

async function seedRepresentativeData() {
  await db.transactions.add({
    id: 'tx-1',
    type: 'expense',
    kind: 'standard',
    amount: 120,
    description: 'Mercado',
    category: 'Alimentacao',
    paymentMethod: 'pix',
    occurredAt: '2026-09-10T12:00:00.000Z',
    createdAt: '2026-09-10T12:00:00.000Z',
  })
  await db.monthlyBudgets.add({
    id: 'budget-1',
    year: 2026,
    month: 8,
    totalLimit: 1000,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
  })
  await db.categoryBudgets.add({
    id: 'category-budget-1',
    year: 2026,
    month: 8,
    category: 'Alimentacao',
    limit: 300,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
  })
  await db.recurringRules.add({
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
  })
  await db.recurringOccurrenceOverrides.add({
    id: 'override-1',
    ruleId: 'rule-1',
    year: 2026,
    month: 8,
    status: 'realized',
    linkedTransactionId: 'tx-1',
    createdAt: '2026-09-05T12:00:00.000Z',
    updatedAt: '2026-09-05T12:00:00.000Z',
  })
  await db.creditCards.add({
    id: 'card-1',
    name: 'Inter',
    creditLimit: 2000,
    closingDay: 25,
    dueDay: 2,
    active: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
  })
  await db.cardPurchases.add({
    id: 'purchase-1',
    cardId: 'card-1',
    description: 'Notebook',
    category: 'Compras',
    totalAmount: 1200,
    purchaseDate: '2026-09-20T12:00:00.000Z',
    installmentCount: 4,
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
  })
  await db.cardInvoicePayments.add({
    id: 'payment-1',
    cardId: 'card-1',
    invoiceYear: 2026,
    invoiceMonth: 8,
    linkedTransactionId: 'tx-1',
    paymentDate: '2026-09-30T12:00:00.000Z',
    paidAt: '2026-09-30T13:00:00.000Z',
    createdAt: '2026-09-30T13:00:00.000Z',
    updatedAt: '2026-09-30T13:00:00.000Z',
  })
  await db.goals.add({
    id: 'goal-1',
    name: 'Novo PC',
    targetAmount: 5000,
    monthlyPlan: 500,
    status: 'active',
    priority: 'high',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
  })
  await db.goalContributions.add({
    id: 'contribution-1',
    goalId: 'goal-1',
    amount: 1000,
    date: '2026-09-01T12:00:00.000Z',
    note: 'Reserva inicial',
    createdAt: '2026-09-01T12:00:00.000Z',
  })
  await db.settings.add({ key: 'theme', value: 'tech' })
}

describe('local backup', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('exports a versioned JSON backup without changing the database', async () => {
    await seedRepresentativeData()
    const before = await readBackupData()

    const json = await exportBackup()
    const parsed = parseBackup(json)

    expect(parsed).toMatchObject({
      format: backupFormat,
      version: backupVersion,
      manifest: {
        counts: expect.objectContaining({
          transactions: 1,
          goals: 1,
          goalContributions: 1,
          settings: 1,
          monthlyBudgets: 1,
          categoryBudgets: 1,
          recurringRules: 1,
          recurringOccurrenceOverrides: 1,
          creditCards: 1,
          cardPurchases: 1,
          cardInvoicePayments: 1,
        }),
      },
      integrity: {
        algorithm: backupIntegrityAlgorithm,
        checksum: expect.any(String),
      },
      appData: {
        transactions: [expect.objectContaining({ id: 'tx-1' })],
        monthlyBudgets: [expect.objectContaining({ id: 'budget-1' })],
        recurringRules: [expect.objectContaining({ id: 'rule-1' })],
        creditCards: [expect.objectContaining({ id: 'card-1' })],
        cardPurchases: [expect.objectContaining({ id: 'purchase-1' })],
        cardInvoicePayments: [expect.objectContaining({ id: 'payment-1' })],
        goals: [expect.objectContaining({ id: 'goal-1' })],
        goalContributions: [expect.objectContaining({ id: 'contribution-1' })],
      },
    })
    expect(parsed.version).toBe(2)
    expect(await readBackupData()).toEqual(before)
  })

  it('creates a deterministic checksum from canonical backup data', async () => {
    await seedRepresentativeData()
    const backup = parseBackup(await exportBackup()) as CoinQuestBackupV2
    const checksum = await calculateBackupChecksum({ manifest: backup.manifest, appData: backup.appData })
    const reorderedPayload = {
      appData: backup.appData,
      manifest: { counts: { ...backup.manifest.counts } },
    }

    expect(checksum).toBe(backup.integrity.checksum)
    expect(await calculateBackupChecksum(reorderedPayload)).toBe(checksum)
  })

  it('round-trips all backup-controlled tables with ids and relationships preserved', async () => {
    await seedRepresentativeData()
    const json = await exportBackup()
    const original = parseBackup(json).appData

    await db.transactions.clear()
    await db.monthlyBudgets.clear()
    await db.categoryBudgets.clear()
    await db.recurringRules.clear()
    await db.recurringOccurrenceOverrides.clear()
    await db.creditCards.clear()
    await db.cardPurchases.clear()
    await db.cardInvoicePayments.clear()
    await db.goals.clear()
    await db.goalContributions.clear()
    await db.settings.clear()

    await importBackup(json)

    expect(await readBackupData()).toEqual(original)
    await expect(db.cardPurchases.get('purchase-1')).resolves.toMatchObject({ cardId: 'card-1' })
    await expect(db.cardInvoicePayments.get('payment-1')).resolves.toMatchObject({ linkedTransactionId: 'tx-1' })
    await expect(db.goalContributions.get('contribution-1')).resolves.toMatchObject({ goalId: 'goal-1' })
  })

  it('rejects invalid backups before changing current data', async () => {
    await seedRepresentativeData()
    const before = await readBackupData()

    await expect(importBackup('{nope')).rejects.toThrow('Arquivo JSON invalido.')
    await expect(importBackup(JSON.stringify({ format: 'other', version: 1, exportedAt: new Date().toISOString(), appData: {} }))).rejects.toThrow('Formato de backup invalido.')
    await expect(importBackup(JSON.stringify({ format: backupFormat, exportedAt: new Date().toISOString(), appData: {} }))).rejects.toThrow('Versao de backup nao suportada.')
    await expect(importBackup(JSON.stringify({ format: backupFormat, version: 99, exportedAt: new Date().toISOString(), appData: {} }))).rejects.toThrow('Versao de backup nao suportada.')
    await expect(importBackup(JSON.stringify({ format: backupFormat, version: 1, exportedAt: new Date().toISOString(), appData: null }))).rejects.toThrow('Dados do backup invalidos.')

    expect(await readBackupData()).toEqual(before)
  })

  it('imports a version 1 backup without checksum and reports a compatibility warning', async () => {
    await seedRepresentativeData()
    const v2 = parseBackup(await exportBackup()) as CoinQuestBackupV2
    const v1: CoinQuestBackupV1 = {
      format: backupFormat,
      version: 1,
      exportedAt: v2.exportedAt,
      appData: v2.appData,
    }

    const inspection = await inspectBackup(JSON.stringify(v1))
    expect(inspection).toMatchObject({
      valid: true,
      formatVersion: 1,
      integrityStatus: 'missing',
    })
    expect(inspection.warnings).toContain('Backup antigo sem verificacao de integridade.')

    await db.transactions.clear()
    await importBackup(JSON.stringify(v1))
    await expect(db.transactions.get('tx-1')).resolves.toMatchObject({ description: 'Mercado' })
  })

  it('rejects a tampered version 2 backup before changing current data', async () => {
    await seedRepresentativeData()
    const before = await readBackupData()
    const backup = parseBackup(await exportBackup()) as CoinQuestBackupV2
    backup.appData.transactions[0].amount = 999

    await expect(importBackup(JSON.stringify(backup))).rejects.toThrow('alterado ou corrompido')
    const inspection = await inspectBackup(JSON.stringify(backup))

    expect(inspection).toMatchObject({ valid: false, integrityStatus: 'failed' })
    expect(await readBackupData()).toEqual(before)
  })

  it('rejects a coherent checksum with an incoherent manifest', async () => {
    await seedRepresentativeData()
    const before = await readBackupData()
    const backup = parseBackup(await exportBackup()) as CoinQuestBackupV2
    backup.manifest.counts.transactions = 99
    backup.integrity.checksum = await calculateBackupChecksum({ manifest: backup.manifest, appData: backup.appData })

    await expect(importBackup(JSON.stringify(backup))).rejects.toThrow('Manifest do backup nao corresponde aos dados.')
    expect(await readBackupData()).toEqual(before)
  })

  it('rejects duplicated ids and orphan references before restore', async () => {
    await seedRepresentativeData()
    const before = await readBackupData()
    const duplicate = parseBackup(await exportBackup()) as CoinQuestBackupV2
    duplicate.appData.goals.push({ ...duplicate.appData.goals[0] })
    duplicate.manifest.counts.goals = duplicate.appData.goals.length
    duplicate.integrity.checksum = await calculateBackupChecksum({ manifest: duplicate.manifest, appData: duplicate.appData })

    await expect(importBackup(JSON.stringify(duplicate))).rejects.toThrow('IDs duplicados')

    const orphanGoalContribution = parseBackup(await exportBackup()) as CoinQuestBackupV2
    orphanGoalContribution.appData.goalContributions[0].goalId = 'missing-goal'
    orphanGoalContribution.integrity.checksum = await calculateBackupChecksum({ manifest: orphanGoalContribution.manifest, appData: orphanGoalContribution.appData })
    await expect(importBackup(JSON.stringify(orphanGoalContribution))).rejects.toThrow('GoalContribution sem Goal')

    const orphanPurchase = parseBackup(await exportBackup()) as CoinQuestBackupV2
    orphanPurchase.appData.cardPurchases[0].cardId = 'missing-card'
    orphanPurchase.integrity.checksum = await calculateBackupChecksum({ manifest: orphanPurchase.manifest, appData: orphanPurchase.appData })
    await expect(importBackup(JSON.stringify(orphanPurchase))).rejects.toThrow('CardPurchase sem CreditCard')

    const orphanOverride = parseBackup(await exportBackup()) as CoinQuestBackupV2
    orphanOverride.appData.recurringOccurrenceOverrides[0].ruleId = 'missing-rule'
    orphanOverride.integrity.checksum = await calculateBackupChecksum({ manifest: orphanOverride.manifest, appData: orphanOverride.appData })
    await expect(importBackup(JSON.stringify(orphanOverride))).rejects.toThrow('override recorrente sem regra')

    const orphanPayment = parseBackup(await exportBackup()) as CoinQuestBackupV2
    orphanPayment.appData.cardInvoicePayments[0].linkedTransactionId = 'missing-transaction'
    orphanPayment.integrity.checksum = await calculateBackupChecksum({ manifest: orphanPayment.manifest, appData: orphanPayment.appData })
    await expect(importBackup(JSON.stringify(orphanPayment))).rejects.toThrow('pagamento de fatura sem Transaction vinculada')

    expect(await readBackupData()).toEqual(before)
  })

  it('keeps previous data when a restore fails inside the transaction', async () => {
    await seedRepresentativeData()
    const before = await readBackupData()
    const backup = parseBackup(await exportBackup())
    backup.appData.transactions = [
      backup.appData.transactions[0],
      { ...backup.appData.transactions[0] },
    ]

    await expect(importBackup(JSON.stringify(backup))).rejects.toThrow()

    expect(await readBackupData()).toEqual(before)
  })

  it('creates a local dated backup filename', () => {
    expect(backupFilename(new Date(2026, 8, 4, 12))).toBe('coinquest-backup-2026-09-04.json')
  })
})

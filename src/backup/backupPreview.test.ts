import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { BackupInspection } from './backup'
import { buildBackupPreview } from './backupPreview'

const safeTextBlock = (value: unknown) => JSON.stringify(value)
const alarmistPattern = /erro grave|dados corrompidos|perda de dados|falha critica|obrigatorio sincronizar|backup garantido|saldo|dinheiro disponivel/i

function inspection(overrides: Partial<BackupInspection> = {}): BackupInspection {
  return {
    valid: true,
    formatVersion: 2,
    exportedAt: '2026-09-17T12:00:00.000Z',
    integrityStatus: 'verified',
    warnings: [],
    counts: {
      transactions: 2,
      goals: 1,
      goalContributions: 3,
      settings: 1,
      monthlyBudgets: 1,
      categoryBudgets: 2,
      recurringRules: 1,
      recurringOccurrenceOverrides: 1,
      creditCards: 1,
      cardPurchases: 4,
      cardInvoicePayments: 1,
    },
    ...overrides,
  }
}

describe('backup preview helper', () => {
  it('monta preview de backup v2 valido com tipo simples, versao, validacao e total', () => {
    const preview = buildBackupPreview(inspection(), { fileType: 'plain' })

    expect(preview.fileTypeLabel).toBe('Backup simples')
    expect(preview.versionLabel).toBe('Versao 2')
    expect(preview.exportedAtLabel).toBe('2026-09-17T12:00:00.000Z')
    expect(preview.validationLabel).toBe('Arquivo validado antes da restauracao.')
    expect(preview.totalRecords).toBe(18)
  })

  it('diferencia backup protegido sem prometer recuperacao garantida', () => {
    const preview = buildBackupPreview(inspection(), { fileType: 'encrypted' })

    expect(preview.fileTypeLabel).toBe('Backup protegido')
    expect(safeTextBlock(preview)).not.toMatch(/backup garantido/i)
  })

  it('mostra backup v1 como antigo sem checksum', () => {
    const preview = buildBackupPreview(inspection({
      formatVersion: 1,
      integrityStatus: 'missing',
      warnings: ['Backup antigo sem verificacao de integridade.'],
    }))

    expect(preview.versionLabel).toBe('Versao 1')
    expect(preview.validationLabel).toBe('Backup antigo sem checksum.')
    expect(preview.warnings).toEqual(['Backup antigo sem verificacao de integridade.'])
  })

  it('usa grupos com labels seguros', () => {
    const preview = buildBackupPreview(inspection())
    const labels = preview.countGroups.map((group) => group.label)

    expect(labels).toEqual([
      'Movimentacoes reais',
      'Metas e alocacoes',
      'Planos de orcamento',
      'Recorrencias',
      'Cartoes e faturas',
      'Compras no cartao',
      'Preferencias',
    ])
  })

  it('nao usa Compras generico para cardPurchases', () => {
    const preview = buildBackupPreview(inspection())
    const cardPurchaseGroup = preview.countGroups.find((group) => group.id === 'card-purchases')

    expect(cardPurchaseGroup?.label).toBe('Compras no cartao')
    expect(cardPurchaseGroup?.label).not.toBe('Compras')
  })

  it('nao sugere que plano de orcamento e saldo', () => {
    const preview = buildBackupPreview(inspection())
    const budgetGroup = preview.countGroups.find((group) => group.id === 'budgets')

    expect(budgetGroup?.label).toBe('Planos de orcamento')
    expect(`${budgetGroup?.label} ${budgetGroup?.description}`).not.toMatch(/saldo|dinheiro disponivel/i)
  })

  it('calcula totalRecords como soma dos grupos', () => {
    const preview = buildBackupPreview(inspection({
      counts: {
        transactions: 1,
        goals: 2,
        goalContributions: 3,
        monthlyBudgets: 4,
        categoryBudgets: 5,
        recurringRules: 6,
        recurringOccurrenceOverrides: 7,
        creditCards: 8,
        cardInvoicePayments: 9,
        cardPurchases: 10,
        settings: 11,
      },
    }))

    expect(preview.totalRecords).toBe(preview.countGroups.reduce((sum, group) => sum + group.value, 0))
    expect(preview.totalRecords).toBe(66)
  })

  it('informa que restauracao substitui dados locais atuais', () => {
    const preview = buildBackupPreview(inspection())

    expect(preview.replacementMessage).toBe('A restauracao substitui os dados locais atuais pelos dados deste arquivo.')
  })

  it('informa que backup local nao precisa de sync', () => {
    const preview = buildBackupPreview(inspection())

    expect(preview.localOnlyMessage).toBe('Backup local nao precisa de sincronizacao em nuvem.')
    expect(preview.localOnlyMessage).not.toMatch(/obrigatorio sincronizar/i)
  })

  it('evita termos alarmistas nas mensagens geradas', () => {
    const preview = buildBackupPreview(inspection())

    expect(safeTextBlock(preview)).not.toMatch(alarmistPattern)
  })

  it('retorna fallback neutro para inspection invalida sem afirmar validade', () => {
    const preview = buildBackupPreview(inspection({
      valid: false,
      formatVersion: null,
      exportedAt: null,
      counts: {},
      integrityStatus: 'failed',
      error: 'Arquivo de backup invalido.',
    }))

    expect(preview.versionLabel).toBe('Versao nao informada')
    expect(preview.exportedAtLabel).toBe('Data de exportacao nao informada')
    expect(preview.validationLabel).toBe('Arquivo nao validado para restauracao.')
    expect(preview.totalRecords).toBe(0)
  })

  it('nao muta o BackupInspection recebido', () => {
    const input = inspection({ warnings: ['Backup antigo sem verificacao de integridade.'] })
    const before = JSON.stringify(input)

    const preview = buildBackupPreview(input)
    preview.warnings.push('warning alterado fora do helper')

    expect(JSON.stringify(input)).toBe(before)
  })

  it('nao acessa Dexie, rede, Supabase ou storage', () => {
    const source = readFileSync(new URL('./backupPreview.ts', import.meta.url), 'utf8')

    expect(source).not.toMatch(/from ['"].*database['"]|\bdb\.|Dexie|fetch\(|XMLHttpRequest|supabase|localStorage|sessionStorage|indexedDB/i)
  })

  it('nao reimplementa validacao pesada de backup', () => {
    const source = readFileSync(new URL('./backupPreview.ts', import.meta.url), 'utf8')

    expect(source).not.toMatch(/SHA-256|crypto|JSON\.parse|appData|linkedTransactionId|goalId|cardId|bulkAdd|clear\(/)
  })
})



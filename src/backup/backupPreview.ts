import type { BackupInspection } from './backup'

export type BackupPreviewFileType = 'plain' | 'encrypted'

export interface BackupPreviewOptions {
  fileType?: BackupPreviewFileType
}

export interface BackupPreviewCountGroup {
  id: string
  label: string
  value: number
  description: string
}

export interface BackupPreview {
  fileTypeLabel: string
  versionLabel: string
  exportedAtLabel: string
  validationLabel: string
  totalRecords: number
  countGroups: BackupPreviewCountGroup[]
  replacementMessage: string
  localOnlyMessage: string
  warnings: string[]
}

const replacementMessage = 'A restauracao substitui os dados locais atuais pelos dados deste arquivo.'
const localOnlyMessage = 'Backup local nao precisa de sincronizacao em nuvem.'
const invalidValidationLabel = 'Arquivo nao validado para restauracao.'

function count(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? value : 0
}

function fileTypeLabel(fileType: BackupPreviewFileType | undefined) {
  return fileType === 'encrypted' ? 'Backup protegido' : 'Backup simples'
}

function versionLabel(version: number | null) {
  return version === null ? 'Versao nao informada' : `Versao ${version}`
}

function exportedAtLabel(exportedAt: string | null) {
  return exportedAt || 'Data de exportacao nao informada'
}

function validationLabel(inspection: BackupInspection) {
  if (!inspection.valid) return invalidValidationLabel
  if (inspection.integrityStatus === 'verified') return 'Arquivo validado antes da restauracao.'
  if (inspection.integrityStatus === 'missing') return 'Backup antigo sem checksum.'
  return invalidValidationLabel
}

function countGroups(inspection: BackupInspection): BackupPreviewCountGroup[] {
  const counts = inspection.counts

  return [
    {
      id: 'transactions',
      label: 'Movimentacoes reais',
      value: count(counts.transactions),
      description: 'Transacoes registradas como movimentacao real.',
    },
    {
      id: 'goals',
      label: 'Metas e alocacoes',
      value: count(counts.goals) + count(counts.goalContributions),
      description: 'Missoes financeiras e contribuicoes registradas.',
    },
    {
      id: 'budgets',
      label: 'Planos de orcamento',
      value: count(counts.monthlyBudgets) + count(counts.categoryBudgets),
      description: 'Limites de planejamento mensal e por categoria.',
    },
    {
      id: 'recurring',
      label: 'Recorrencias',
      value: count(counts.recurringRules) + count(counts.recurringOccurrenceOverrides),
      description: 'Regras recorrentes e ajustes mensais.',
    },
    {
      id: 'cards',
      label: 'Cartoes e faturas',
      value: count(counts.creditCards) + count(counts.cardInvoicePayments),
      description: 'Cartoes cadastrados e pagamentos de fatura.',
    },
    {
      id: 'card-purchases',
      label: 'Compras no cartao',
      value: count(counts.cardPurchases),
      description: 'Compras parceladas ou assumidas em cartao.',
    },
    {
      id: 'settings',
      label: 'Preferencias',
      value: count(counts.settings),
      description: 'Configuracoes locais incluidas no arquivo.',
    },
  ]
}

function totalRecords(groups: readonly BackupPreviewCountGroup[]) {
  return groups.reduce((sum, group) => sum + group.value, 0)
}

export function buildBackupPreview(
  inspection: BackupInspection,
  options: BackupPreviewOptions = {},
): BackupPreview {
  const groups = countGroups(inspection)

  return {
    fileTypeLabel: fileTypeLabel(options.fileType),
    versionLabel: versionLabel(inspection.formatVersion),
    exportedAtLabel: exportedAtLabel(inspection.exportedAt),
    validationLabel: validationLabel(inspection),
    totalRecords: totalRecords(groups),
    countGroups: groups,
    replacementMessage,
    localOnlyMessage,
    warnings: [...inspection.warnings],
  }
}

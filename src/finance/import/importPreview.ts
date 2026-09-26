import type { Transaction, TransactionType } from '../../db/types'
import { canonicalCategory } from '../../lib/categories'

export type CsvImportSourceKind = 'bank-statement'
export type CsvDelimiter = ';' | ',' | '\t'

export interface CsvImportPreviewInput {
  text: string
  existingTransactions: Transaction[]
  sourceKind: CsvImportSourceKind
}

export interface ImportCandidate {
  id: string
  rowNumber: number
  occurredAt: string
  description: string
  amount: number
  type: TransactionType
  category?: string
  warnings: string[]
  duplicateWarning?: string
}

export interface ImportRejectedRow {
  rowNumber: number
  reason: string
}

export interface ImportPreview {
  sourceKind: CsvImportSourceKind
  delimiter: CsvDelimiter | null
  totalRows: number
  candidateCount: number
  rejectedCount: number
  duplicateWarningCount: number
  candidates: ImportCandidate[]
  rejectedRows: ImportRejectedRow[]
  warnings: string[]
}

interface HeaderIndexes {
  date?: number
  description?: number
  amount?: number
  type?: number
  category?: number
  debit?: number
  credit?: number
}

interface ParsedAmount {
  value: number
  negative: boolean
}

interface ParsedCsvLine {
  fields: string[]
  closed: boolean
}

const emptyPreview = (sourceKind: CsvImportSourceKind): ImportPreview => ({
  sourceKind,
  delimiter: null,
  totalRows: 0,
  candidateCount: 0,
  rejectedCount: 0,
  duplicateWarningCount: 0,
  candidates: [],
  rejectedRows: [],
  warnings: ['Arquivo CSV vazio.'],
})

function normalizeText(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

function normalizeHeader(value: string) {
  return normalizeText(value).replace(/\s+/g, ' ')
}

function compactDescription(value: string) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim()
}

function localDateKey(iso: string) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function parseCsvLine(line: string, delimiter: CsvDelimiter): ParsedCsvLine {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && char === delimiter) {
      fields.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  fields.push(current.trim())

  return { fields, closed: !inQuotes }
}

function countDelimiter(line: string, delimiter: CsvDelimiter) {
  return parseCsvLine(line, delimiter).fields.length - 1
}

function detectDelimiter(headerLine: string): CsvDelimiter | null {
  const candidates: CsvDelimiter[] = [';', ',', '\t']
  const scored = candidates.map((delimiter) => ({
    delimiter,
    count: countDelimiter(headerLine, delimiter),
  }))
  const best = scored.sort((a, b) => b.count - a.count || candidates.indexOf(a.delimiter) - candidates.indexOf(b.delimiter))[0]
  return best && best.count > 0 ? best.delimiter : null
}

const aliases: Record<keyof HeaderIndexes, string[]> = {
  date: ['data', 'date', 'occurredat', 'ocorrido em'],
  description: ['descricao', 'description', 'historico', 'memo'],
  amount: ['valor', 'amount', 'value'],
  type: ['tipo', 'type', 'movimento'],
  category: ['categoria', 'category'],
  debit: ['debito', 'debit'],
  credit: ['credito', 'credit'],
}

function findHeaderIndexes(headers: string[]): HeaderIndexes {
  return headers.reduce<HeaderIndexes>((result, header, index) => {
    const normalized = normalizeHeader(header)

    Object.entries(aliases).forEach(([key, values]) => {
      const typedKey = key as keyof HeaderIndexes
      if (result[typedKey] !== undefined) return
      if (values.includes(normalized)) result[typedKey] = index
    })

    return result
  }, {})
}

function valueAt(fields: string[], index: number | undefined) {
  return index === undefined ? '' : (fields[index] ?? '').trim()
}

function parseDate(value: string): string | null {
  const trimmed = value.trim()
  let year: number
  let month: number
  let day: number

  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (br) {
    day = Number(br[1])
    month = Number(br[2])
    year = Number(br[3])
  } else if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else {
    return null
  }

  const date = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return date.toISOString()
}

function parseSignedMoney(raw: string): ParsedAmount | null {
  let cleaned = raw.trim()
  if (!cleaned) return null

  let negative = false
  if (/^\(.+\)$/.test(cleaned)) {
    negative = true
    cleaned = cleaned.slice(1, -1)
  }

  cleaned = cleaned.replace(/R\$/gi, '').replace(/\s/g, '')

  if (cleaned.startsWith('-')) {
    negative = true
    cleaned = cleaned.slice(1)
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1)
  }

  if (!cleaned) return null

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized = cleaned

  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '')
  } else if (lastComma >= 0) {
    normalized = cleaned.replace(',', '.')
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '')
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null

  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return null

  return { value, negative }
}

function parseType(value: string): TransactionType | null {
  const normalized = normalizeText(value)
  if (!normalized) return null

  if (['entrada', 'receita', 'income', 'credito', 'credit'].includes(normalized)) {
    return 'income'
  }
  if (['saida', 'despesa', 'expense', 'debito', 'debit', 'pagamento', 'retirada'].includes(normalized)) {
    return 'expense'
  }

  return null
}

function looksLikeCardOrInvoice(description: string) {
  return /(fatura|cartao|nubank|visa|mastercard|credito)/.test(normalizeText(description))
}

function descriptionsAreSimilar(a: string, b: string) {
  const left = compactDescription(a)
  const right = compactDescription(b)

  if (!left || !right) return false
  if (left === right) return true
  if (left.length >= 6 && right.includes(left)) return true
  return right.length >= 6 && left.includes(right)
}

function duplicateWarning(candidate: Pick<ImportCandidate, 'occurredAt' | 'amount' | 'type' | 'description'>, existingTransactions: Transaction[]) {
  const candidateDateKey = localDateKey(candidate.occurredAt)
  const duplicate = existingTransactions.some((transaction) => (
    localDateKey(transaction.occurredAt) === candidateDateKey &&
    transaction.type === candidate.type &&
    Math.abs(transaction.amount) === candidate.amount &&
    descriptionsAreSimilar(transaction.description, candidate.description)
  ))

  return duplicate ? 'Possivel duplicata de movimentacao ja registrada.' : undefined
}

function reject(rowNumber: number, reason: string): ImportRejectedRow {
  return { rowNumber, reason }
}

function parseCandidate(
  fields: string[],
  rowNumber: number,
  headers: HeaderIndexes,
  existingTransactions: Transaction[],
): ImportCandidate | ImportRejectedRow {
  const occurredAt = parseDate(valueAt(fields, headers.date))
  if (!occurredAt) return reject(rowNumber, 'Data ausente ou invalida.')

  const description = valueAt(fields, headers.description)
  if (!description) return reject(rowNumber, 'Descricao ausente.')

  const typeValue = valueAt(fields, headers.type)
  const typeFromColumn = typeValue ? parseType(typeValue) : null
  if (typeValue && !typeFromColumn) return reject(rowNumber, 'Tipo ambiguo.')

  let amount: ParsedAmount | null = null
  let type: TransactionType | null = null
  const debitValue = valueAt(fields, headers.debit)
  const creditValue = valueAt(fields, headers.credit)
  const warnings: string[] = []

  if (debitValue || creditValue) {
    const debit = debitValue ? parseSignedMoney(debitValue) : null
    const credit = creditValue ? parseSignedMoney(creditValue) : null

    if (debitValue && !debit) return reject(rowNumber, 'Valor de debito invalido.')
    if (creditValue && !credit) return reject(rowNumber, 'Valor de credito invalido.')
    if (debit && credit) return reject(rowNumber, 'Linha com debito e credito preenchidos.')

    if (debit) {
      amount = debit
      type = 'expense'
    } else if (credit) {
      amount = credit
      type = 'income'
    }

    if (typeFromColumn && type && typeFromColumn !== type) {
      warnings.push('Tipo informado difere da coluna debito/credito; revise antes de importar.')
    }
  }

  if (!amount) {
    amount = parseSignedMoney(valueAt(fields, headers.amount))
    if (!amount) return reject(rowNumber, 'Valor ausente ou invalido.')
    type = amount.negative ? 'expense' : 'income'

    if (typeFromColumn && typeFromColumn !== type) {
      return reject(rowNumber, 'Sinal do valor conflita com o tipo informado.')
    }
    if (typeFromColumn) type = typeFromColumn
  }

  if (!type) return reject(rowNumber, 'Tipo ambiguo.')

  const category = valueAt(fields, headers.category)
  if (looksLikeCardOrInvoice(description)) {
    warnings.push('Descricao parece relacionada a cartao/fatura; revise antes de importar.')
  }

  const candidate: ImportCandidate = {
    id: `row-${rowNumber}`,
    rowNumber,
    occurredAt,
    description,
    amount: amount.value,
    type,
    category: category ? canonicalCategory(category) : undefined,
    warnings,
  }
  const duplicate = duplicateWarning(candidate, existingTransactions)

  if (duplicate) {
    candidate.duplicateWarning = duplicate
    candidate.warnings.push(duplicate)
  }

  return candidate
}

export function deriveCsvImportPreview(input: CsvImportPreviewInput): ImportPreview {
  const text = input.text.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  const headerIndex = lines.findIndex((line) => line.trim())

  if (headerIndex < 0) return emptyPreview(input.sourceKind)

  const headerLine = lines[headerIndex]
  const delimiter = detectDelimiter(headerLine)
  if (!delimiter) {
    return {
      ...emptyPreview(input.sourceKind),
      totalRows: 0,
      warnings: ['Nao foi possivel detectar o delimitador do CSV.'],
    }
  }

  const header = parseCsvLine(headerLine, delimiter)
  const headers = findHeaderIndexes(header.fields)
  const missingHeaders: string[] = []

  if (headers.date === undefined) missingHeaders.push('data')
  if (headers.description === undefined) missingHeaders.push('descricao')
  if (headers.amount === undefined && (headers.debit === undefined || headers.credit === undefined)) {
    missingHeaders.push('valor ou debito/credito')
  }

  if (missingHeaders.length > 0) {
    return {
      sourceKind: input.sourceKind,
      delimiter,
      totalRows: 0,
      candidateCount: 0,
      rejectedCount: 0,
      duplicateWarningCount: 0,
      candidates: [],
      rejectedRows: [],
      warnings: [`Cabecalho incompleto: ${missingHeaders.join(', ')}.`],
    }
  }

  const candidates: ImportCandidate[] = []
  const rejectedRows: ImportRejectedRow[] = []

  lines.slice(headerIndex + 1).forEach((line, index) => {
    const rowNumber = headerIndex + index + 2
    if (!line.trim()) return

    const parsed = parseCsvLine(line, delimiter)
    if (!parsed.closed) {
      rejectedRows.push(reject(rowNumber, 'Linha com aspas nao fechadas.'))
      return
    }

    const result = parseCandidate(parsed.fields, rowNumber, headers, input.existingTransactions)
    if ('reason' in result) rejectedRows.push(result)
    else candidates.push(result)
  })

  const duplicateWarningCount = candidates.filter((candidate) => candidate.duplicateWarning).length

  return {
    sourceKind: input.sourceKind,
    delimiter,
    totalRows: candidates.length + rejectedRows.length,
    candidateCount: candidates.length,
    rejectedCount: rejectedRows.length,
    duplicateWarningCount,
    candidates,
    rejectedRows,
    warnings: candidates.length === 0 && rejectedRows.length === 0 ? ['Nenhuma linha de movimentacao encontrada.'] : [],
  }
}

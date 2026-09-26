import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../db/types'
import { deriveCsvImportPreview } from './importPreview'

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-1',
    type: overrides.type ?? 'expense',
    amount: overrides.amount ?? 100,
    description: overrides.description ?? 'Mercado Central',
    category: overrides.category ?? 'Alimentacao',
    paymentMethod: overrides.paymentMethod ?? 'pix',
    occurredAt: overrides.occurredAt ?? new Date(2026, 8, 10, 12).toISOString(),
    createdAt: overrides.createdAt ?? new Date(2026, 8, 10, 12).toISOString(),
    kind: overrides.kind,
  }
}

function preview(text: string, existingTransactions: Transaction[] = []) {
  return deriveCsvImportPreview({
    text,
    existingTransactions,
    sourceKind: 'bank-statement',
  })
}

describe('deriveCsvImportPreview', () => {
  it('returns a safe empty preview for empty CSV', () => {
    expect(preview('')).toEqual({
      sourceKind: 'bank-statement',
      delimiter: null,
      totalRows: 0,
      candidateCount: 0,
      rejectedCount: 0,
      duplicateWarningCount: 0,
      candidates: [],
      rejectedRows: [],
      warnings: ['Arquivo CSV vazio.'],
    })
  })

  it('parses CSV with semicolon delimiter', () => {
    const result = preview('data;descricao;valor\n10/09/2026;Mercado;-123,45')

    expect(result.delimiter).toBe(';')
    expect(result.candidateCount).toBe(1)
    expect(result.candidates[0]).toMatchObject({
      rowNumber: 2,
      description: 'Mercado',
      amount: 123.45,
      type: 'expense',
    })
  })

  it('parses CSV with comma delimiter', () => {
    const result = preview('date,description,amount\n2026-09-10,Salario,123.45')

    expect(result.delimiter).toBe(',')
    expect(result.candidates[0]).toMatchObject({
      amount: 123.45,
      type: 'income',
      description: 'Salario',
    })
  })

  it('parses CSV with tab delimiter', () => {
    const result = preview('data\tdescricao\tvalor\n10/09/2026\tInternet\t-90,00')

    expect(result.delimiter).toBe('\t')
    expect(result.candidates[0]).toMatchObject({
      amount: 90,
      type: 'expense',
      description: 'Internet',
    })
  })

  it('keeps quoted fields with delimiters inside the description', () => {
    const result = preview('data;descricao;valor\n10/09/2026;"Mercado; padaria";-40,00')

    expect(result.candidates[0]).toMatchObject({
      description: 'Mercado; padaria',
      amount: 40,
    })
  })

  it('supports dd/mm/yyyy dates as local dates', () => {
    const result = preview('data;descricao;valor\n05/09/2026;Padaria;-12,00')
    const date = new Date(result.candidates[0].occurredAt)

    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(8)
    expect(date.getDate()).toBe(5)
  })

  it('supports yyyy-mm-dd dates as local dates', () => {
    const result = preview('data;descricao;valor\n2026-09-15;Freela;500,00')
    const date = new Date(result.candidates[0].occurredAt)

    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(8)
    expect(date.getDate()).toBe(15)
  })

  it('parses Brazilian money values with comma decimals', () => {
    const result = preview('data;descricao;valor\n10/09/2026;Aluguel;R$ -1.234,56')

    expect(result.candidates[0]).toMatchObject({
      amount: 1234.56,
      type: 'expense',
    })
  })

  it('turns negative values into expenses', () => {
    const result = preview('data;descricao;valor\n10/09/2026;Mercado;(123,45)')

    expect(result.candidates[0]).toMatchObject({
      amount: 123.45,
      type: 'expense',
    })
  })

  it('turns positive values into income', () => {
    const result = preview('data;descricao;valor\n10/09/2026;Salario;123,45')

    expect(result.candidates[0]).toMatchObject({
      amount: 123.45,
      type: 'income',
    })
  })

  it('uses debit and credit columns when present', () => {
    const result = preview([
      'data;descricao;debito;credito',
      '10/09/2026;Conta de luz;80,00;',
      '11/09/2026;Pagamento;;900,00',
    ].join('\n'))

    expect(result.candidates.map((candidate) => candidate.type)).toEqual(['expense', 'income'])
    expect(result.candidates.map((candidate) => candidate.amount)).toEqual([80, 900])
  })

  it('adds rejectedRows for invalid lines without failing the whole preview', () => {
    const result = preview([
      'data;descricao;valor',
      '99/99/2026;Data ruim;-10,00',
      '10/09/2026;;-20,00',
      '11/09/2026;Sem valor;',
      '12/09/2026;Valida;-30,00',
    ].join('\n'))

    expect(result.candidateCount).toBe(1)
    expect(result.rejectedRows).toEqual([
      { rowNumber: 2, reason: 'Data ausente ou invalida.' },
      { rowNumber: 3, reason: 'Descricao ausente.' },
      { rowNumber: 4, reason: 'Valor ausente ou invalido.' },
    ])
  })

  it('ignores empty lines without breaking the preview', () => {
    const result = preview('data;descricao;valor\n\n10/09/2026;Mercado;-50,00\n   ')

    expect(result.totalRows).toBe(1)
    expect(result.candidateCount).toBe(1)
    expect(result.rejectedCount).toBe(0)
  })

  it('flags probable duplicates as a warning, not a certainty', () => {
    const existing = [
      tx({
        id: 'existing',
        type: 'expense',
        amount: 100,
        description: 'Mercado Central',
        occurredAt: new Date(2026, 8, 10, 9).toISOString(),
      }),
    ]

    const result = preview('data;descricao;valor\n10/09/2026;Mercado Central;-100,00', existing)

    expect(result.duplicateWarningCount).toBe(1)
    expect(result.candidates[0].duplicateWarning).toBe('Possivel duplicata de movimentacao ja registrada.')
    expect(result.candidates[0].warnings).toContain('Possivel duplicata de movimentacao ja registrada.')
  })

  it('flags descriptions related to card or invoice for manual review', () => {
    const result = preview('data;descricao;valor\n10/09/2026;Fatura Nubank;-450,00')

    expect(result.candidates[0].warnings).toContain('Descricao parece relacionada a cartao/fatura; revise antes de importar.')
    expect(result.candidates[0]).toMatchObject({
      type: 'expense',
      amount: 450,
    })
  })

  it('keeps CSV category when present using the safe canonical helper', () => {
    const result = preview('data;descricao;valor;categoria\n10/09/2026;Farmacia;-60,00;Saúde')

    expect(result.candidates[0].category).toBe('Saude')
  })

  it('rejects conflicts between signed amount and explicit type', () => {
    const result = preview('data;descricao;valor;tipo\n10/09/2026;Mercado;100,00;saida')

    expect(result.candidateCount).toBe(0)
    expect(result.rejectedRows).toEqual([
      { rowNumber: 2, reason: 'Sinal do valor conflita com o tipo informado.' },
    ])
  })

  it('does not mutate existingTransactions', () => {
    const existing = [
      tx({ id: 'one' }),
      tx({ id: 'two', amount: 200, description: 'Salario', type: 'income' }),
    ]
    const before = structuredClone(existing)

    const result = preview('data;descricao;valor\n10/09/2026;Mercado;-100,00', existing)

    expect(result.candidateCount).toBe(1)
    expect(existing).toEqual(before)
  })

  it('does not access Dexie, storage, network or transaction persistence APIs', () => {
    const source = readFileSync(new URL('./importPreview.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('../db/database')
    expect(source).not.toContain('recordTransaction')
    expect(source).not.toContain('indexedDB')
    expect(source).not.toContain('localStorage')
    expect(source).not.toContain('sessionStorage')
    expect(source).not.toContain('fetch(')
  })

  it('does not create a real Transaction shape', () => {
    const result = preview('data;descricao;valor\n10/09/2026;Mercado;-100,00')
    const candidate = result.candidates[0]

    expect(candidate).not.toHaveProperty('createdAt')
    expect(candidate).not.toHaveProperty('paymentMethod')
    expect(candidate.id).toBe('row-2')
  })
})

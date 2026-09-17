import { describe, expect, it } from 'vitest'
import type { WorldProgressionInput } from './worldProgression'
import { deriveWorldProgression } from './worldProgression'

function input(overrides: Partial<WorldProgressionInput> = {}): WorldProgressionInput {
  return {
    transactionCount: 0,
    ...overrides,
  }
}

function budget(percentageUsed: number | null, isOverLimit = false): WorldProgressionInput['budgetProgress'] {
  return {
    hasBudget: true,
    percentageUsed,
    isOverLimit,
  }
}

describe('deriveWorldProgression', () => {
  it('returns starter when there are not enough signals', () => {
    expect(deriveWorldProgression(input()).tier).toBe('starter')
    expect(deriveWorldProgression(input({ transactionCount: 1 })).tier).toBe('starter')
  })

  it('reaches stable with basic records and a configured budget', () => {
    const result = deriveWorldProgression(input({
      transactionCount: 2,
      budgetProgress: { hasBudget: true, percentageUsed: null, isOverLimit: false },
    }))

    expect(result).toMatchObject({
      tier: 'stable',
      title: 'Base estavel',
    })
    expect(result.reasons).toContain('Mes com registros suficientes para leitura.')
    expect(result.reasons).toContain('Orcamento mensal configurado.')
  })

  it('reaches focused with respected budget and mission progress', () => {
    const result = deriveWorldProgression(input({
      transactionCount: 3,
      budgetProgress: budget(0.6),
      missions: { activeGoals: 1, contributionsThisMonth: 1 },
    }))

    expect(result.tier).toBe('focused')
    expect(result.reasons).toContain('Orcamento dentro do limite.')
    expect(result.reasons).toContain('Missao ativa em andamento.')
    expect(result.reasons).toContain('Missao recebeu progresso neste mes.')
  })

  it('reaches thriving with strong health and a completed mission', () => {
    const result = deriveWorldProgression(input({
      transactionCount: 4,
      budgetProgress: budget(0.45),
      financialHealth: { level: 'excellent' },
      missions: { activeGoals: 1, completedGoals: 1, contributionsThisMonth: 1 },
    }))

    expect(result).toMatchObject({
      tier: 'thriving',
      title: 'Base prospera',
    })
    expect(result.reasons).toContain('Saude financeira excelente no mes.')
    expect(result.reasons).toContain('Missao concluida fortalece o mundo.')
  })

  it('does not improve progression just because there are more spending records', () => {
    const base = input({
      transactionCount: 2,
      budgetProgress: budget(0.8),
      financialHealth: { level: 'attention' },
    })
    const manyRecords = input({
      ...base,
      transactionCount: 100,
    })

    expect(deriveWorldProgression(manyRecords).score).toBe(deriveWorldProgression(base).score)
    expect(deriveWorldProgression(manyRecords).tier).toBe(deriveWorldProgression(base).tier)
  })

  it('does not treat mission contribution as a transaction', () => {
    const result = deriveWorldProgression(input({
      transactionCount: 0,
      missions: { activeGoals: 1, contributionsThisMonth: 1 },
    }))

    expect(result.tier).toBe('starter')
    expect(result.nextHint).toBe('Registre algumas movimentacoes reais do mes para dar leitura ao mundo.')
    expect(result.reasons).toContain('Missao recebeu progresso neste mes.')
  })

  it('is deterministic for the same input', () => {
    const source = input({
      transactionCount: 3,
      budgetProgress: budget(0.5),
      financialHealth: { level: 'healthy' },
      missions: { activeGoals: 1, contributionsThisMonth: 1 },
    })

    expect(deriveWorldProgression(source)).toEqual(deriveWorldProgression(source))
  })

  it('does not mutate the input', () => {
    const source = input({
      transactionCount: 3,
      budgetProgress: budget(0.5),
      financialHealth: { level: 'healthy' },
      missions: { activeGoals: 1, completedGoals: 0, contributionsThisMonth: 1 },
    })
    const snapshot = JSON.parse(JSON.stringify(source))

    deriveWorldProgression(source)

    expect(source).toEqual(snapshot)
  })
})

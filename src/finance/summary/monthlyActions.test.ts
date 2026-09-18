import { describe, expect, it } from 'vitest'
import { deriveMonthlyActions, type MonthlyActionsInput } from './monthlyActions'

function baseInput(overrides: Partial<MonthlyActionsInput> = {}): MonthlyActionsInput {
  return {
    budget: { hasBudget: true, percentageUsed: 0.4, isOverLimit: false },
    commitments: [],
    projection: { projectedNet: 100 },
    goal: null,
    ...overrides,
  }
}

function actionText(input: MonthlyActionsInput) {
  return deriveMonthlyActions(input).map((action) => `${action.title} ${action.message}`).join(' ')
}

describe('deriveMonthlyActions', () => {
  it('retorna vazio quando nao ha acao relevante', () => {
    expect(deriveMonthlyActions(baseInput())).toEqual([])
  })

  it('gera acao de budget quando nao ha orcamento configurado', () => {
    const actions = deriveMonthlyActions(baseInput({
      budget: { hasBudget: false },
    }))

    expect(actions).toEqual([
      expect.objectContaining({
        id: 'budget:missing',
        kind: 'info',
        source: 'budget',
        destinationHash: '#orcamento',
      }),
    ])
  })

  it('gera acao de budget quando uso esta perto do limite', () => {
    const actions = deriveMonthlyActions(baseInput({
      budget: { hasBudget: true, percentageUsed: 0.92, isOverLimit: false },
    }))

    expect(actions).toContainEqual(expect.objectContaining({
      id: 'budget:near-limit',
      kind: 'attention',
      source: 'budget',
      destinationHash: '#orcamento',
    }))
  })

  it('gera acao de budget com severidade maior quando uso passa do limite', () => {
    const actions = deriveMonthlyActions(baseInput({
      budget: { hasBudget: true, percentageUsed: 1.08, isOverLimit: true },
    }))

    expect(actions[0]).toEqual(expect.objectContaining({
      id: 'budget:over-limit',
      kind: 'warning',
      source: 'budget',
      destinationHash: '#orcamento',
    }))
  })

  it('gera acao de recorrencias para compromissos previstos ou pendentes', () => {
    const actions = deriveMonthlyActions(baseInput({
      commitments: [
        { id: 'rent', kind: 'recurring', status: 'pending', amount: 1200 },
      ],
    }))

    expect(actions).toContainEqual(expect.objectContaining({
      id: 'recurring:review',
      kind: 'attention',
      source: 'recurring',
      destinationHash: '#previsoes',
    }))
  })

  it('nao inclui fatura de cartao na acao de recorrencias', () => {
    const actions = deriveMonthlyActions(baseInput({
      commitments: [
        { id: 'invoice', kind: 'card-invoice', status: 'pending', amount: 600 },
      ],
    }))

    expect(actions).not.toContainEqual(expect.objectContaining({ source: 'recurring' }))
    expect(actions).toContainEqual(expect.objectContaining({ source: 'card' }))
  })

  it('gera acao de cartao para fatura aberta pendente ou atrasada', () => {
    const actions = deriveMonthlyActions(baseInput({
      commitments: [
        { id: 'invoice-open', kind: 'card-invoice', status: 'open', amount: 600 },
      ],
    }))

    expect(actions).toContainEqual(expect.objectContaining({
      id: 'card:review-invoices',
      kind: 'attention',
      source: 'card',
      destinationHash: '#cartoes',
    }))
  })

  it('gera acao de projecao quando projectedNet e negativo', () => {
    const actions = deriveMonthlyActions(baseInput({
      projection: { projectedNet: -50 },
    }))

    expect(actions).toContainEqual(expect.objectContaining({
      id: 'projection:negative',
      kind: 'attention',
      source: 'projection',
      destinationHash: '#projecao',
    }))
  })

  it('gera acao de meta quando ha meta ativa relevante', () => {
    const actions = deriveMonthlyActions(baseInput({
      goal: { id: 'goal-1', status: 'active' },
    }))

    expect(actions).toContainEqual(expect.objectContaining({
      id: 'goal:follow:goal-1',
      kind: 'info',
      source: 'goal',
      destinationHash: '#missoes',
    }))
  })

  it('nao cria acao de backup ou categoria nesta etapa', () => {
    const actions = deriveMonthlyActions(baseInput({
      budget: { hasBudget: false },
      commitments: [
        { id: 'rent', kind: 'recurring', status: 'pending', amount: 1200 },
        { id: 'invoice', kind: 'card-invoice', status: 'overdue', amount: 600 },
      ],
      projection: { projectedNet: -100 },
      goal: { id: 'goal-1', active: true },
    }))

    expect(actions.map((action) => action.source)).not.toContain('backup')
    expect(actions.map((action) => action.source)).not.toContain('category')
    expect(actions.map((action) => action.destinationHash)).not.toContain('#backup')
  })

  it('ordena por prioridade desc e id asc', () => {
    const actions = deriveMonthlyActions(baseInput({
      budget: { hasBudget: true, percentageUsed: 0.95, isOverLimit: false },
      commitments: [
        { id: 'invoice', kind: 'card-invoice', status: 'pending', amount: 600 },
        { id: 'rent', kind: 'recurring', status: 'pending', amount: 1200 },
      ],
      projection: { projectedNet: -100 },
      goal: { id: 'goal-1', active: true },
    }))

    expect(actions.map((action) => action.id)).toEqual([
      'card:review-invoices',
      'recurring:review',
      'projection:negative',
      'budget:near-limit',
      'goal:follow:goal-1',
    ])

    const tieSorted = deriveMonthlyActions({
      budget: { hasBudget: false },
      commitments: [],
      goal: { id: 'goal-1', active: true },
    })

    expect(tieSorted.map((action) => action.id)).toEqual([
      'budget:missing',
      'goal:follow:goal-1',
    ])
  })

  it('nao muta o input', () => {
    const input = baseInput({
      commitments: [
        { id: 'invoice', kind: 'card-invoice', status: 'pending', amount: 600 },
        { id: 'rent', kind: 'recurring', status: 'pending', amount: 1200 },
      ],
      projection: { projectedNet: -100 },
      goal: { id: 'goal-1', active: true },
    })
    const before = JSON.stringify(input)

    deriveMonthlyActions(input)

    expect(JSON.stringify(input)).toBe(before)
  })

  it('mantem linguagem segura para budget sem tratar como saldo', () => {
    const text = actionText(baseInput({
      budget: { hasBudget: true, percentageUsed: 0.95, isOverLimit: false },
    }))

    expect(text).toContain('limite planejado')
    expect(text).not.toMatch(/saldo|dinheiro disponivel|cortar gastos|voce deve/i)
  })

  it('mantem linguagem segura para cartao sem tratar compra como saida imediata', () => {
    const text = actionText(baseInput({
      commitments: [
        { id: 'invoice', kind: 'card-invoice', status: 'pending', amount: 600 },
      ],
    }))

    expect(text).toContain('compromisso')
    expect(text).toContain('pagamento de fatura e o movimento real')
    expect(text).not.toMatch(/saida de caixa imediata|ja saiu do caixa|saldo/i)
  })

  it('mantem linguagem segura para projecao sem tratar como saldo futuro garantido', () => {
    const text = actionText(baseInput({
      projection: { projectedNet: -100 },
    }))

    expect(text).toContain('cenario estimado negativo')
    expect(text).not.toMatch(/saldo futuro|garantido|sera negativo/i)
  })

  it('mantem linguagem segura para meta sem tratar alocacao como transacao', () => {
    const text = actionText(baseInput({
      goal: { id: 'goal-1', active: true },
    }))

    expect(text).toContain('alocacoes')
    expect(text).toContain('sem criar movimento real automaticamente')
    expect(text).not.toMatch(/transacao|compra realizada|despesa/i)
  })
})

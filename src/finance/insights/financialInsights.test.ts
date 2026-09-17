import { describe, expect, it } from 'vitest'
import type { FinancialInsightsInput } from './financialInsights'
import { deriveFinancialInsights } from './financialInsights'

function baseInput(overrides: Partial<FinancialInsightsInput> = {}): FinancialInsightsInput {
  return {
    transactionCount: 3,
    financialHealth: null,
    budget: null,
    categories: [],
    commitments: [],
    projection: null,
    goal: null,
    ...overrides,
  }
}

function insightText(input: FinancialInsightsInput) {
  return deriveFinancialInsights(input).map((insight) => `${insight.title} ${insight.message}`).join(' ')
}

describe('deriveFinancialInsights', () => {
  it('gera insight informativo quando ha poucos dados no mes', () => {
    const insights = deriveFinancialInsights(baseInput({ transactionCount: 1 }))

    expect(insights).toContainEqual(expect.objectContaining({
      id: 'data:low-signal',
      kind: 'info',
      source: 'data',
    }))
    expect(insightText(baseInput({ transactionCount: 1 }))).toContain('poucos registros reais')
  })

  it('gera alerta de saude critica sem inventar saldo', () => {
    const insights = deriveFinancialInsights(baseInput({
      financialHealth: { level: 'critical', expenseRatio: null, messageKey: 'no_income_with_expenses' },
    }))

    expect(insights[0]).toEqual(expect.objectContaining({
      id: 'health:critical',
      kind: 'warning',
      source: 'health',
    }))
    expect(insights[0].message).toContain('sinais financeiros')
    expect(insights[0].message).not.toMatch(/despesas reais estao acima|nao ha receita|saldo|garantido|culpa|fracasso|gastou mal/i)
  })

  it('gera alerta de mes apertado com linguagem neutra', () => {
    const insights = deriveFinancialInsights(baseInput({
      financialHealth: { level: 'tight', expenseRatio: 0.98, messageKey: 'tight_ratio' },
    }))

    expect(insights).toContainEqual(expect.objectContaining({
      id: 'health:tight',
      kind: 'warning',
      source: 'health',
    }))
    expect(insightText(baseInput({
      financialHealth: { level: 'tight', expenseRatio: 0.98, messageKey: 'tight_ratio' },
    }))).not.toMatch(/despesas reais estao|receitas registradas|errado|culpa|fracasso|gastou mal/i)
  })

  it('gera attention quando o orcamento esta perto do limite', () => {
    const insights = deriveFinancialInsights(baseInput({
      budget: {
        hasBudget: true,
        percentageUsed: 0.92,
        isOverLimit: false,
        overLimitAmount: 0,
        spent: 920,
      },
    }))

    expect(insights).toContainEqual(expect.objectContaining({
      id: 'budget:near-limit',
      kind: 'attention',
      source: 'budget',
      amount: 920,
    }))
    expect(insightText(baseInput({
      budget: { hasBudget: true, percentageUsed: 0.92, isOverLimit: false, overLimitAmount: 0, spent: 920 },
    }))).not.toMatch(/dinheiro disponivel|saldo/i)
  })

  it('gera warning quando o orcamento foi ultrapassado', () => {
    const insights = deriveFinancialInsights(baseInput({
      budget: {
        hasBudget: true,
        percentageUsed: 1.15,
        isOverLimit: true,
        overLimitAmount: 150,
        spent: 1150,
      },
    }))

    expect(insights[0]).toEqual(expect.objectContaining({
      id: 'budget:over-limit',
      kind: 'warning',
      source: 'budget',
      amount: 150,
    }))
    expect(insights[0].message).toContain('limite de planejamento')
  })

  it('detecta categoria concentrada sem julgamento moral', () => {
    const insights = deriveFinancialInsights(baseInput({
      categories: [
        { category: 'Casa', amount: 700 },
        { category: 'Transporte', amount: 200 },
        { category: 'Mercado', amount: 100 },
      ],
    }))
    const insight = insights.find((item) => item.source === 'category')

    expect(insight).toEqual(expect.objectContaining({
      kind: 'attention',
      category: 'Casa',
      amount: 700,
    }))
    expect(`${insight?.title} ${insight?.message}`).not.toMatch(/errado|culpa|fracasso|gastou mal/i)
  })

  it('mostra fatura atrasada como compromisso de cartao', () => {
    const insights = deriveFinancialInsights(baseInput({
      commitments: [{
        id: 'card-invoice:card-1:2026:8',
        kind: 'card-invoice',
        label: 'Fatura Nubank',
        amount: 300,
        status: 'overdue',
        dueDate: '2026-09-05T12:00:00.000Z',
      }],
    }))

    expect(insights[0]).toEqual(expect.objectContaining({
      kind: 'warning',
      source: 'card',
      amount: 300,
    }))
    expect(insights[0].message).toContain('fatura')
  })

  it('mostra recorrencia em aberto como compromisso planejado', () => {
    const insights = deriveFinancialInsights(baseInput({
      commitments: [{
        id: 'recurring:internet:2026:8',
        kind: 'recurring',
        label: 'Internet',
        amount: 120,
        status: 'pending',
        dueDate: '2026-09-20T12:00:00.000Z',
      }],
    }))

    expect(insights).toContainEqual(expect.objectContaining({
      kind: 'attention',
      source: 'recurring',
      amount: 120,
    }))
    expect(insightText(baseInput({
      commitments: [{
        id: 'recurring:internet:2026:8',
        kind: 'recurring',
        label: 'Internet',
        amount: 120,
        status: 'pending',
        dueDate: '2026-09-20T12:00:00.000Z',
      }],
    }))).toContain('planejamento do mes')
  })

  it('mostra projecao negativa como estimativa, nao saldo garantido', () => {
    const insights = deriveFinancialInsights(baseInput({
      projection: {
        projectedIncome: 1000,
        projectedExpense: 1250,
        projectedNet: -250,
      },
    }))
    const projectionInsight = insights.find((item) => item.source === 'projection')

    expect(projectionInsight).toEqual(expect.objectContaining({
      id: 'projection:negative-month',
      kind: 'attention',
      amount: 250,
    }))
    expect(`${projectionInsight?.title} ${projectionInsight?.message}`).toContain('estimativa')
    expect(`${projectionInsight?.title} ${projectionInsight?.message}`).not.toMatch(/saldo futuro|garantido/i)
  })

  it('gera insight positivo para meta com progresso sem virar compra ou transacao', () => {
    const insights = deriveFinancialInsights(baseInput({
      goal: {
        id: 'goal-1',
        name: 'Notebook',
        targetAmount: 3000,
        allocatedAmount: 900,
        remainingAmount: 2100,
        percentageDisplay: 30,
        contributionsThisMonth: 1,
      },
    }))
    const goalInsight = insights.find((item) => item.source === 'goal')

    expect(goalInsight).toEqual(expect.objectContaining({
      id: 'goal:progress:goal-1',
      kind: 'positive',
      amount: 900,
    }))
    expect(`${goalInsight?.title} ${goalInsight?.message}`).toContain('sem criar transacao')
    expect(`${goalInsight?.title} ${goalInsight?.message}`).not.toMatch(/compra realizada|despesa/i)
  })

  it('gera insight positivo para meta concluida sem tratar como compra realizada', () => {
    const insights = deriveFinancialInsights(baseInput({
      goal: {
        id: 'goal-2',
        name: 'Mesa digital',
        targetAmount: 1000,
        allocatedAmount: 1000,
        remainingAmount: 0,
        percentageDisplay: 100,
        completed: true,
      },
    }))
    const goalInsight = insights.find((item) => item.source === 'goal')

    expect(goalInsight).toEqual(expect.objectContaining({
      id: 'goal:completed:goal-2',
      kind: 'positive',
    }))
    expect(`${goalInsight?.title} ${goalInsight?.message}`).toContain('nao registra uma compra')
  })

  it('nao transforma GoalContribution em Transaction', () => {
    const insights = deriveFinancialInsights(baseInput({
      transactionCount: 0,
      goal: {
        id: 'goal-3',
        name: 'Reserva',
        targetAmount: 500,
        allocatedAmount: 100,
        percentageDisplay: 20,
        contributionsThisMonth: 1,
      },
    }))

    expect(insights.find((item) => item.source === 'goal')).toEqual(expect.objectContaining({ kind: 'positive' }))
    expect(insightText(baseInput({
      transactionCount: 0,
      goal: {
        id: 'goal-3',
        name: 'Reserva',
        targetAmount: 500,
        allocatedAmount: 100,
        percentageDisplay: 20,
        contributionsThisMonth: 1,
      },
    }))).toContain('sem criar transacao financeira')
  })

  it('nao conta pagamento de fatura duas vezes na concentracao por categoria', () => {
    const insights = deriveFinancialInsights(baseInput({
      categories: [
        { category: 'Compras', amount: 300 },
        { category: 'Casa', amount: 100 },
      ],
      commitments: [{
        id: 'card-invoice:card-1:2026:8',
        kind: 'card-invoice',
        label: 'Fatura Nubank',
        amount: 300,
        status: 'pending',
        dueDate: '2026-09-20T12:00:00.000Z',
      }],
    }))

    expect(insights.find((item) => item.source === 'category')).toEqual(expect.objectContaining({
      category: 'Compras',
      amount: 300,
    }))
    expect(insightText(baseInput({
      categories: [
        { category: 'Compras', amount: 300 },
        { category: 'Casa', amount: 100 },
      ],
      commitments: [{
        id: 'card-invoice:card-1:2026:8',
        kind: 'card-invoice',
        label: 'Fatura Nubank',
        amount: 300,
        status: 'pending',
        dueDate: '2026-09-20T12:00:00.000Z',
      }],
    }))).not.toMatch(/pagamento de fatura/i)
  })

  it('ordena de forma deterministica por prioridade e id', () => {
    const insights = deriveFinancialInsights(baseInput({
      transactionCount: 0,
      financialHealth: { level: 'attention', expenseRatio: 0.8, messageKey: 'attention_ratio' },
      budget: { hasBudget: true, percentageUsed: 0.92, isOverLimit: false, overLimitAmount: 0, spent: 920 },
      projection: { projectedIncome: 500, projectedExpense: 600, projectedNet: -100 },
    }))

    expect(insights.map((item) => item.id)).toEqual([
      'budget:near-limit',
      'health:attention',
      'projection:negative-month',
      'data:low-signal',
    ])
  })

  it('nao muta o input recebido', () => {
    const input = baseInput({
      categories: [
        { category: 'Casa', amount: 600 },
        { category: 'Mercado', amount: 200 },
      ],
      commitments: [{
        id: 'recurring:aluguel:2026:8',
        kind: 'recurring',
        label: 'Aluguel',
        amount: 600,
        status: 'overdue',
        dueDate: '2026-09-05T12:00:00.000Z',
      }],
    })
    const snapshot = JSON.parse(JSON.stringify(input))

    deriveFinancialInsights(input)

    expect(input).toEqual(snapshot)
  })
})

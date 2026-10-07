import { describe, expect, it } from 'vitest'
import type { FinancialInsight } from '../insights/financialInsights'
import { buildMonthlyDecisionReport, type MonthlyDecisionCenterInput, type MonthlyDecisionReport } from './monthlyDecisionCenter'
import type { MonthlyAction } from './monthlyActions'
import type { MonthlyHighlights } from './monthlyHighlights'
import type { MonthlyOverview } from './monthlyOverview'

interface OverviewOverrides {
  month?: MonthlyOverview['month']
  actual?: Partial<MonthlyOverview['actual']>
  budget?: Partial<MonthlyOverview['budget']>
  outlook?: Partial<MonthlyOverview['outlook']>
}

function overview(overrides: OverviewOverrides = {}): MonthlyOverview {
  return {
    month: overrides.month ?? { year: 2026, month: 8 },
    actual: {
      income: 0,
      expenses: 0,
      net: 0,
      transactionCount: 0,
      ...overrides.actual,
    },
    budget: {
      hasBudget: true,
      limit: 1000,
      spent: 200,
      remaining: 800,
      percentageUsed: 0.2,
      isOverLimit: false,
      overLimitAmount: 0,
      ...overrides.budget,
    },
    outlook: {
      plannedRecurringIncome: 0,
      plannedRecurringExpense: 0,
      committedCardExpense: 0,
      projectedIncome: 0,
      projectedExpense: 0,
      projectedNet: 0,
      ...overrides.outlook,
    },
  }
}

function highlights(overrides: Partial<MonthlyHighlights> = {}): MonthlyHighlights {
  return {
    commitments: [],
    featuredGoal: null,
    ...overrides,
  }
}

function action(overrides: Partial<MonthlyAction> = {}): MonthlyAction {
  return {
    id: overrides.id ?? 'budget:missing',
    kind: overrides.kind ?? 'info',
    source: overrides.source ?? 'budget',
    title: overrides.title ?? 'Titulo da acao',
    message: overrides.message ?? 'Mensagem da acao',
    destinationHash: overrides.destinationHash ?? '#orcamento',
    priority: overrides.priority ?? 50,
  }
}

function insight(overrides: Partial<FinancialInsight> = {}): FinancialInsight {
  return {
    id: overrides.id ?? 'budget:usage',
    kind: overrides.kind ?? 'attention',
    source: overrides.source ?? 'budget',
    title: overrides.title ?? 'Titulo do insight',
    message: overrides.message ?? 'Mensagem do insight',
    priority: overrides.priority ?? 75,
    amount: overrides.amount,
    category: overrides.category,
  }
}

function allReportText(report: MonthlyDecisionReport) {
  return [
    report.status,
    report.headline,
    report.summaryMessage,
    ...report.primaryItems.flatMap((item) => [
      item.id,
      item.kind,
      item.source,
      item.title,
      item.message,
      item.destinationHash,
      String(item.priority),
    ]),
    ...report.secondaryItems.flatMap((item) => [
      item.id,
      item.kind,
      item.source,
      item.title,
      item.message,
      item.destinationHash,
      String(item.priority),
    ]),
  ].join(' ')
}

describe('buildMonthlyDecisionReport', () => {
  it('retorna estado vazio quando nao ha dados relevantes', () => {
    expect(buildMonthlyDecisionReport({})).toEqual({
      status: 'empty',
      headline: 'Sem dados suficientes para revisar o mês',
      summaryMessage: 'Registre movimentações reais ou planos do mês para formar uma leitura local.',
      primaryItems: [],
      secondaryItems: [],
    })
  })

  it('gera relatorio estavel quando ha poucos dados sem alerta', () => {
    const report = buildMonthlyDecisionReport({
      overview: overview({
        actual: { income: 500, expenses: 120, net: 380, transactionCount: 2 },
      }),
    })

    expect(report.status).toBe('stable')
    expect(report.primaryItems).toContainEqual(expect.objectContaining({
      id: 'overview:movements',
      kind: 'context',
      source: 'history',
      destinationHash: '#historico',
    }))
  })

  it('gera item de revisao quando o orcamento esta ausente', () => {
    const report = buildMonthlyDecisionReport({
      overview: overview({
        budget: {
          hasBudget: false,
          limit: 0,
          spent: 0,
          remaining: 0,
          percentageUsed: null,
          isOverLimit: false,
          overLimitAmount: 0,
        },
      }),
    })

    expect(report.status).toBe('review')
    expect(report.primaryItems).toContainEqual(expect.objectContaining({
      source: 'budget',
      kind: 'review',
      destinationHash: '#orcamento',
    }))
  })

  it('gera ponto de atencao quando o orcamento esta perto do limite', () => {
    const report = buildMonthlyDecisionReport({
      overview: overview({
        budget: { percentageUsed: 0.95 },
      }),
    })

    expect(report.status).toBe('attention')
    expect(report.primaryItems).toContainEqual(expect.objectContaining({
      id: 'overview:budget-near-limit',
      source: 'budget',
      kind: 'attention',
    }))
  })

  it('prioriza atencao quando o orcamento esta acima do limite', () => {
    const report = buildMonthlyDecisionReport({
      overview: overview({
        budget: { percentageUsed: 1.1, isOverLimit: true, overLimitAmount: 100 },
      }),
    })

    expect(report.status).toBe('attention')
    expect(report.primaryItems[0]).toEqual(expect.objectContaining({
      id: 'overview:budget-over-limit',
      source: 'budget',
      kind: 'attention',
      priority: 88,
    }))
  })

  it('gera item de cartao para fatura pendente ou aberta em highlights', () => {
    const report = buildMonthlyDecisionReport({
      highlights: highlights({
        commitments: [
          {
            id: 'card-2026-09',
            kind: 'card-invoice',
            label: 'Cartao',
            amount: 300,
            dueDate: '2026-09-10',
            status: 'pending',
          },
        ],
      }),
    })

    expect(report.status).toBe('review')
    expect(report.primaryItems).toContainEqual(expect.objectContaining({
      source: 'card',
      destinationHash: '#cartoes',
    }))
  })

  it('gera item de recorrencia para compromisso pendente em highlights', () => {
    const report = buildMonthlyDecisionReport({
      highlights: highlights({
        commitments: [
          {
            id: 'rent-2026-09',
            kind: 'recurring',
            label: 'Aluguel',
            amount: 1200,
            dueDate: '2026-09-05',
            status: 'pending',
          },
        ],
      }),
    })

    expect(report.status).toBe('review')
    expect(report.primaryItems).toContainEqual(expect.objectContaining({
      source: 'recurring',
      destinationHash: '#previsoes',
    }))
  })

  it('gera ponto de atencao para estimativa negativa de projecao', () => {
    const report = buildMonthlyDecisionReport({
      overview: overview({
        outlook: { projectedNet: -150 },
      }),
    })

    expect(report.status).toBe('attention')
    expect(report.primaryItems).toContainEqual(expect.objectContaining({
      id: 'overview:projection-negative',
      source: 'projection',
      destinationHash: '#projecao',
    }))
  })

  it('gera item de meta quando ha meta ativa em destaque', () => {
    const report = buildMonthlyDecisionReport({
      highlights: highlights({
        featuredGoal: {
          id: 'goal-1',
          name: 'Reserva',
          targetAmount: 1000,
          allocatedAmount: 300,
          remainingAmount: 700,
          percentageDisplay: 30,
          priority: 'high',
        },
      }),
    })

    expect(report.status).toBe('review')
    expect(report.primaryItems).toContainEqual(expect.objectContaining({
      id: 'highlight:goal:goal-1',
      source: 'goal',
      destinationHash: '#missoes',
    }))
  })

  it('inclui insight relevante como item do relatorio', () => {
    const report = buildMonthlyDecisionReport({
      insights: [
        insight({
          id: 'category:high',
          kind: 'warning',
          source: 'category',
          priority: 82,
        }),
      ],
    })

    expect(report.status).toBe('attention')
    expect(report.primaryItems).toContainEqual(expect.objectContaining({
      id: 'insight:category:high',
      source: 'insight',
      kind: 'attention',
      destinationHash: '#historico',
    }))
  })

  it('inclui acao mensal relevante como item do relatorio', () => {
    const report = buildMonthlyDecisionReport({
      actions: [
        action({
          id: 'card:review',
          kind: 'attention',
          source: 'card',
          destinationHash: '#cartoes',
          priority: 85,
        }),
      ],
    })

    expect(report.status).toBe('attention')
    expect(report.primaryItems).toContainEqual(expect.objectContaining({
      id: 'action:card:review',
      source: 'card',
      kind: 'attention',
      destinationHash: '#cartoes',
    }))
  })

  it('deduplica quando acao e insight apontam para o mesmo tema', () => {
    const report = buildMonthlyDecisionReport({
      actions: [
        action({
          id: 'budget:near-limit',
          kind: 'attention',
          source: 'budget',
          priority: 65,
        }),
      ],
      insights: [
        insight({
          id: 'budget:over-limit',
          kind: 'warning',
          source: 'budget',
          priority: 95,
        }),
      ],
    })

    const items = [...report.primaryItems, ...report.secondaryItems]
    expect(items.filter((item) => item.source === 'budget')).toHaveLength(1)
    expect(items[0]).toEqual(expect.objectContaining({
      id: 'insight:budget:over-limit',
      priority: 95,
    }))
  })

  it('ordena de forma deterministica por prioridade, fonte e id', () => {
    const report = buildMonthlyDecisionReport({
      actions: [
        action({ id: 'projection:review', source: 'projection', priority: 70, destinationHash: '#projecao' }),
        action({ id: 'card:review', source: 'card', priority: 70, destinationHash: '#cartoes' }),
        action({ id: 'goal:review', source: 'goal', priority: 90, destinationHash: '#missoes' }),
      ],
    })

    expect(report.primaryItems.map((item) => item.id)).toEqual([
      'action:goal:review',
      'action:card:review',
      'action:projection:review',
    ])
  })

  it('separa itens primarios e secundarios', () => {
    const report = buildMonthlyDecisionReport({
      maxPrimaryItems: 2,
      actions: [
        action({ id: 'goal:review', source: 'goal', priority: 50, destinationHash: '#missoes' }),
        action({ id: 'card:review', source: 'card', priority: 85, destinationHash: '#cartoes' }),
        action({ id: 'projection:review', source: 'projection', priority: 70, destinationHash: '#projecao' }),
        action({ id: 'recurring:review', source: 'recurring', priority: 80, destinationHash: '#previsoes' }),
      ],
    })

    expect(report.primaryItems.map((item) => item.id)).toEqual([
      'action:card:review',
      'action:recurring:review',
    ])
    expect(report.secondaryItems.map((item) => item.id)).toEqual([
      'action:projection:review',
      'action:goal:review',
    ])
  })

  it('usa linguagem segura sem termos proibidos', () => {
    const report = buildMonthlyDecisionReport({
      overview: overview({
        actual: { income: 1000, expenses: 900, net: 100, transactionCount: 3 },
        budget: { percentageUsed: 0.95 },
        outlook: { projectedNet: -200, committedCardExpense: 250 },
      }),
      actions: [
        action({ id: 'card:review', source: 'card', kind: 'attention', priority: 85, destinationHash: '#cartoes' }),
      ],
      insights: [
        insight({ id: 'projection:negative', source: 'projection', kind: 'attention', priority: 70 }),
      ],
      highlights: highlights({
        featuredGoal: {
          id: 'goal-1',
          name: 'Reserva',
          targetAmount: 1000,
          allocatedAmount: 250,
          remainingAmount: 750,
          percentageDisplay: 25,
        },
      }),
    })

    expect(allReportText(report).toLowerCase()).not.toMatch(
      /voce deve|você deve|corte gastos|saldo futuro|dinheiro disponivel|dinheiro disponível|faca isso agora|faça isso agora|recomendacao financeira|recomendação financeira|previsao garantida|previsão garantida|garantido/,
    )
  })

  it('nao muta o input', () => {
    const input: MonthlyDecisionCenterInput = {
      overview: overview({
        actual: { income: 1000, expenses: 120, net: 880, transactionCount: 2 },
      }),
      actions: [
        action({ id: 'budget:missing', source: 'budget', priority: 50 }),
      ],
      insights: [
        insight({ id: 'data:backup', source: 'data', kind: 'info', priority: 20 }),
      ],
      highlights: highlights({
        commitments: [
          {
            id: 'rent-2026-09',
            kind: 'recurring',
            label: 'Aluguel',
            amount: 1200,
            dueDate: '2026-09-05',
            status: 'pending',
          },
        ],
      }),
    }
    const before = JSON.stringify(input)

    buildMonthlyDecisionReport(input)

    expect(JSON.stringify(input)).toBe(before)
  })
})

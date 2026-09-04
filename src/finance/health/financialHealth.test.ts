import { describe, expect, it } from 'vitest'
import { calculateFinancialHealth, FINANCIAL_HEALTH_THRESHOLDS } from './financialHealth'
import type { MonthlySummary } from '../transactions'
import type { BudgetProgress } from '../budget/budget'

function summary(input: Partial<MonthlySummary>): MonthlySummary {
  return {
    income: 0,
    expenses: 0,
    balance: 0,
    count: 0,
    ...input,
  }
}

function budget(percentageUsed: number, input: Partial<BudgetProgress> = {}): BudgetProgress {
  return {
    hasBudget: true,
    limit: 1000,
    spent: percentageUsed * 1000,
    remaining: 1000 - percentageUsed * 1000,
    percentageUsed,
    isOverLimit: percentageUsed > 1,
    overLimitAmount: Math.max(0, percentageUsed * 1000 - 1000),
    ...input,
  }
}

describe('calculateFinancialHealth', () => {
  it('returns unknown when there are no entries', () => {
    expect(calculateFinancialHealth(summary({}))).toEqual({
      level: 'unknown',
      expenseRatio: null,
      messageKey: 'no_data',
    })
  })

  it('treats income-only months as healthy but not excellent', () => {
    expect(calculateFinancialHealth(summary({ income: 1000, balance: 1000, count: 1 }))).toEqual({
      level: 'healthy',
      expenseRatio: 0,
      messageKey: 'income_only',
    })
  })

  it('returns excellent when expenses are at or below the V1 excellent threshold', () => {
    const result = calculateFinancialHealth(summary({ income: 1000, expenses: 500, balance: 500, count: 2 }))

    expect(result.level).toBe('excellent')
    expect(result.expenseRatio).toBe(FINANCIAL_HEALTH_THRESHOLDS.excellentMaxExpenseRatio)
  })

  it('returns healthy when expenses are comfortably below income', () => {
    expect(calculateFinancialHealth(summary({ income: 1000, expenses: 700, balance: 300, count: 2 })).level).toBe('healthy')
  })

  it('returns attention when expenses are close to income', () => {
    expect(calculateFinancialHealth(summary({ income: 1000, expenses: 860, balance: 140, count: 2 })).level).toBe('attention')
  })

  it('returns tight when expenses nearly consume income', () => {
    expect(calculateFinancialHealth(summary({ income: 1000, expenses: 960, balance: 40, count: 2 })).level).toBe('tight')
  })

  it('returns critical when expenses exceed income', () => {
    const result = calculateFinancialHealth(summary({ income: 1000, expenses: 1200, balance: -200, count: 2 }))

    expect(result.level).toBe('critical')
    expect(result.expenseRatio).toBe(1.2)
  })

  it('handles expenses without income without dividing by zero', () => {
    expect(calculateFinancialHealth(summary({ expenses: 120, balance: -120, count: 1 }))).toEqual({
      level: 'critical',
      expenseRatio: null,
      messageKey: 'no_income_with_expenses',
    })
  })

  it('handles large values without changing the ratio rules', () => {
    expect(calculateFinancialHealth(summary({ income: 1_000_000, expenses: 250_000, balance: 750_000, count: 8 })).level).toBe('excellent')
  })

  it('returns unknown for invalid summaries', () => {
    expect(calculateFinancialHealth(summary({ income: Number.NaN, count: 1 }))).toEqual({
      level: 'unknown',
      expenseRatio: null,
      messageKey: 'invalid_summary',
    })
    expect(calculateFinancialHealth(summary({ income: -1, count: 1 })).level).toBe('unknown')
  })

  it('keeps the V1 fallback when no budget exists', () => {
    expect(calculateFinancialHealth(summary({ income: 1000, expenses: 500, balance: 500, count: 2 }), null).level).toBe('excellent')
  })

  it('uses budget pressure conservatively when budget exists', () => {
    expect(calculateFinancialHealth(summary({ income: 2000, expenses: 800, balance: 1200, count: 2 }), budget(0.8))).toEqual({
      level: 'attention',
      expenseRatio: 0.4,
      messageKey: 'budget_attention',
    })
  })

  it('treats near-full budget usage as tight even with good income ratio', () => {
    const result = calculateFinancialHealth(summary({ income: 4000, expenses: 950, balance: 3050, count: 3 }), budget(0.95))

    expect(result.level).toBe('tight')
    expect(result.messageKey).toBe('budget_tight')
  })

  it('treats relevant budget overrun as critical', () => {
    const result = calculateFinancialHealth(summary({ income: 4000, expenses: 1100, balance: 2900, count: 3 }), budget(1.1))

    expect(result.level).toBe('critical')
    expect(result.messageKey).toBe('budget_critical')
  })

  it('does not infer health from an empty month just because a budget exists', () => {
    expect(calculateFinancialHealth(summary({}), budget(0)).level).toBe('unknown')
  })
})

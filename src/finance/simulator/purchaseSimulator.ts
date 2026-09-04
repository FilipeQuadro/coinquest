import { db } from '../../db/database'
import type {
  CardInvoicePayment,
  CardPurchase,
  CreditCard,
  Goal,
  GoalContribution,
  MonthlyBudget,
  PaymentMethod,
  RecurringOccurrenceOverride,
  RecurringRule,
  Transaction,
} from '../../db/types'
import { calculateCreditLimitUsage, getInvoiceCycle, splitInstallments } from '../cards/cards'
import { compareMonths, isDateInMonth, monthFromDate, type SelectedMonth } from '../month'
import { projectMonths, type MonthlyProjection, type ProjectionInput } from '../projection/projection'
import { calculateGoalProgress } from '../goals/goals'

export type PurchaseScenarioMode = 'cash' | 'credit_card'

export interface PurchaseScenario {
  id?: string
  name: string
  totalAmount: number
  purchaseDate: string
  mode: PurchaseScenarioMode
  category?: string
  paymentMethod?: PaymentMethod
  cardId?: string
  installmentCount?: number
  goalId?: string
  goal?: Goal
}

export interface PurchaseSimulationInput extends ProjectionInput {
  goals?: Goal[]
  goalContributions?: GoalContribution[]
}

export interface MonthlyPurchaseImpact {
  year: number
  month: number
  baselineProjectedNet: number
  scenarioProjectedNet: number
  delta: number
}

export interface PurchaseSimulationSummary {
  totalPurchaseAmount: number
  impactWithinHorizon: number
  impactOutsideHorizon: number
  scenarioFullyVisibleInHorizon: boolean
  affectedMonths: SelectedMonth[]
  baselineNegativeMonths: SelectedMonth[]
  scenarioNegativeMonths: SelectedMonth[]
  newNegativeMonths: SelectedMonth[]
  worstProjectedMonth: MonthlyProjection
  largestMonthlyImpact: MonthlyPurchaseImpact
  baselineCumulativeProjectedNet: number
  scenarioCumulativeProjectedNet: number
  cumulativeDelta: number
}

export interface PurchaseSimulationLimitStatus {
  cardId: string
  hasLimit: boolean
  creditLimit: number | null
  availableLimitBefore: number | null
  hypotheticalCommitment: number
  availableLimitAfter: number | null
  exceedsCreditLimit: boolean | null
}

export interface PurchaseSimulationGoalContext {
  goalId: string
  name: string
  targetAmount: number
  allocatedAmount: number
  goalCoverageGap: number
}

export interface PurchaseSimulationResult {
  scenario: PurchaseScenario
  baselineMonths: MonthlyProjection[]
  scenarioMonths: MonthlyProjection[]
  monthlyImpact: MonthlyPurchaseImpact[]
  summary: PurchaseSimulationSummary
  cardLimit?: PurchaseSimulationLimitStatus
  goalContext?: PurchaseSimulationGoalContext
}

export interface PurchaseScenarioComparison {
  scenarios: PurchaseSimulationResult[]
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function cents(value: number) {
  return Math.round(value * 100)
}

function assertValidSimulation(startMonth: SelectedMonth, horizonMonths: number, scenario: PurchaseScenario, input: PurchaseSimulationInput) {
  if (!Number.isInteger(startMonth.year) || !Number.isInteger(startMonth.month) || startMonth.month < 0 || startMonth.month > 11) {
    throw new Error('Mes inicial invalido.')
  }
  if (!Number.isInteger(horizonMonths) || horizonMonths < 1) {
    throw new Error('Horizonte da simulacao invalido.')
  }
  if (!scenario.name.trim()) throw new Error('Informe o nome da compra simulada.')
  if (!Number.isFinite(scenario.totalAmount) || scenario.totalAmount <= 0) throw new Error('Informe um valor de compra valido.')

  const purchaseDate = new Date(scenario.purchaseDate)
  if (!Number.isFinite(purchaseDate.getTime())) throw new Error('Informe uma data de compra valida.')

  if (scenario.mode === 'credit_card') {
    if (!scenario.cardId) throw new Error('Escolha um cartao para simular compra no credito.')
    const card = input.creditCards.find((item) => item.id === scenario.cardId)
    if (!card) throw new Error('Cartao da simulacao nao encontrado.')
    if (!card.active) throw new Error('Cartao inativo nao aceita nova compra simulada.')

    const installmentCount = scenario.installmentCount ?? 1
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 12) {
      throw new Error('Informe parcelas entre 1 e 12 para simulacao.')
    }
  }

  if (scenario.mode === 'cash' && scenario.installmentCount && scenario.installmentCount !== 1) {
    throw new Error('Compra a vista nao usa parcelas.')
  }
}

function scenarioId(scenario: PurchaseScenario) {
  return scenario.id ?? `simulation-${scenario.mode}-${scenario.name.trim().toLowerCase().replace(/\s+/g, '-')}`
}

function cloneInput(input: PurchaseSimulationInput): PurchaseSimulationInput {
  return {
    transactions: input.transactions.map((transaction) => ({ ...transaction })),
    recurringRules: input.recurringRules.map((rule) => ({ ...rule })),
    recurringOverrides: input.recurringOverrides.map((override) => ({ ...override })),
    creditCards: input.creditCards.map((card) => ({ ...card })),
    cardPurchases: input.cardPurchases.map((purchase) => ({ ...purchase })),
    cardInvoicePayments: input.cardInvoicePayments.map((payment) => ({ ...payment })),
    monthlyBudgets: input.monthlyBudgets?.map((budget) => ({ ...budget })),
    goals: input.goals?.map((goal) => ({ ...goal })),
    goalContributions: input.goalContributions?.map((contribution) => ({ ...contribution })),
  }
}

function addHypotheticalPurchase(input: PurchaseSimulationInput, scenario: PurchaseScenario): PurchaseSimulationInput {
  const next = cloneInput(input)
  const now = new Date().toISOString()
  const id = scenarioId(scenario)

  if (scenario.mode === 'cash') {
    const transaction: Transaction = {
      id: `hypothetical-transaction-${id}`,
      type: 'expense',
      kind: 'standard',
      amount: roundMoney(scenario.totalAmount),
      description: scenario.name.trim(),
      category: scenario.category?.trim() || 'Outros',
      paymentMethod: scenario.paymentMethod ?? 'pix',
      occurredAt: scenario.purchaseDate,
      createdAt: now,
    }

    return {
      ...next,
      transactions: [...next.transactions, transaction],
    }
  }

  const purchase: CardPurchase = {
    id: `hypothetical-card-purchase-${id}`,
    cardId: scenario.cardId!,
    description: scenario.name.trim(),
    category: scenario.category?.trim() || 'Compras',
    totalAmount: roundMoney(scenario.totalAmount),
    purchaseDate: scenario.purchaseDate,
    installmentCount: scenario.installmentCount ?? 1,
    createdAt: now,
    updatedAt: now,
  }

  return {
    ...next,
    cardPurchases: [...next.cardPurchases, purchase],
  }
}

function isMonthInHorizon(month: SelectedMonth, horizon: MonthlyProjection[]) {
  return horizon.some((item) => item.year === month.year && item.month === month.month)
}

function calculateScenarioImpactTotal(scenario: PurchaseScenario, input: PurchaseSimulationInput, horizon: MonthlyProjection[]) {
  if (scenario.mode === 'cash') {
    const purchaseMonth = monthFromDate(new Date(scenario.purchaseDate))
    return isMonthInHorizon(purchaseMonth, horizon) ? roundMoney(scenario.totalAmount) : 0
  }

  const card = input.creditCards.find((item) => item.id === scenario.cardId)
  if (!card) return 0

  const firstCycle = getInvoiceCycle(card, scenario.purchaseDate)
  const installments = splitInstallments(scenario.totalAmount, scenario.installmentCount ?? 1)

  return roundMoney(installments.reduce((sum, amount, index) => {
    const invoiceMonthDate = new Date(firstCycle.invoiceYear, firstCycle.invoiceMonth + index, 1, 12)
    const invoiceMonth = monthFromDate(invoiceMonthDate)
    return isMonthInHorizon(invoiceMonth, horizon) ? sum + amount : sum
  }, 0))
}

function compareMonthsList(a: SelectedMonth, b: SelectedMonth) {
  return compareMonths(a, b)
}

function buildMonthlyImpact(baselineMonths: MonthlyProjection[], scenarioMonths: MonthlyProjection[]): MonthlyPurchaseImpact[] {
  return baselineMonths.map((baseline, index) => {
    const scenarioMonth = scenarioMonths[index]
    return {
      year: baseline.year,
      month: baseline.month,
      baselineProjectedNet: baseline.projectedNet,
      scenarioProjectedNet: scenarioMonth.projectedNet,
      delta: roundMoney(scenarioMonth.projectedNet - baseline.projectedNet),
    }
  })
}

function buildCardLimitStatus(scenario: PurchaseScenario, input: PurchaseSimulationInput, scenarioInput: PurchaseSimulationInput): PurchaseSimulationLimitStatus | undefined {
  if (scenario.mode !== 'credit_card' || !scenario.cardId) return undefined

  const card = input.creditCards.find((item) => item.id === scenario.cardId)
  const scenarioCard = scenarioInput.creditCards.find((item) => item.id === scenario.cardId)
  if (!card || !scenarioCard) return undefined

  const before = calculateCreditLimitUsage(card, input.cardPurchases, input.cardInvoicePayments, input.transactions)
  const after = calculateCreditLimitUsage(scenarioCard, scenarioInput.cardPurchases, scenarioInput.cardInvoicePayments, scenarioInput.transactions)
  const hypotheticalCommitment = roundMoney(after.committedAmount - before.committedAmount)

  return {
    cardId: card.id,
    hasLimit: before.hasLimit,
    creditLimit: before.creditLimit,
    availableLimitBefore: before.availableLimit,
    hypotheticalCommitment,
    availableLimitAfter: after.availableLimit,
    exceedsCreditLimit: before.hasLimit && after.availableLimit !== null ? after.availableLimit < 0 : null,
  }
}

function buildGoalContext(scenario: PurchaseScenario, input: PurchaseSimulationInput): PurchaseSimulationGoalContext | undefined {
  const goal = scenario.goal ?? input.goals?.find((item) => item.id === scenario.goalId)
  if (!goal) return undefined

  const progress = calculateGoalProgress(goal, input.goalContributions ?? [])
  return {
    goalId: goal.id,
    name: goal.name,
    targetAmount: goal.targetAmount,
    allocatedAmount: progress.allocatedAmount,
    goalCoverageGap: roundMoney(Math.max(0, scenario.totalAmount - progress.allocatedAmount)),
  }
}

function buildSummary(
  scenario: PurchaseScenario,
  input: PurchaseSimulationInput,
  baselineMonths: MonthlyProjection[],
  scenarioMonths: MonthlyProjection[],
  monthlyImpact: MonthlyPurchaseImpact[],
): PurchaseSimulationSummary {
  const impactWithinHorizon = calculateScenarioImpactTotal(scenario, input, scenarioMonths)
  const impactOutsideHorizon = roundMoney(scenario.totalAmount - impactWithinHorizon)
  const affectedMonths = monthlyImpact
    .filter((impact) => impact.delta !== 0)
    .map((impact) => ({ year: impact.year, month: impact.month }))
    .sort(compareMonthsList)
  const baselineNegativeMonths = baselineMonths
    .filter((month) => month.projectedNet < 0)
    .map((month) => ({ year: month.year, month: month.month }))
  const scenarioNegativeMonths = scenarioMonths
    .filter((month) => month.projectedNet < 0)
    .map((month) => ({ year: month.year, month: month.month }))
  const newNegativeMonths = monthlyImpact
    .filter((impact) => impact.baselineProjectedNet >= 0 && impact.scenarioProjectedNet < 0)
    .map((impact) => ({ year: impact.year, month: impact.month }))
  const worstProjectedMonth = scenarioMonths.reduce((worst, month) => (
    month.projectedNet < worst.projectedNet ? month : worst
  ), scenarioMonths[0])
  const largestMonthlyImpact = monthlyImpact.reduce((largest, impact) => (
    Math.abs(impact.delta) > Math.abs(largest.delta) ? impact : largest
  ), monthlyImpact[0])
  const baselineCumulativeProjectedNet = baselineMonths.at(-1)?.cumulativeProjectedNet ?? 0
  const scenarioCumulativeProjectedNet = scenarioMonths.at(-1)?.cumulativeProjectedNet ?? 0

  return {
    totalPurchaseAmount: roundMoney(scenario.totalAmount),
    impactWithinHorizon,
    impactOutsideHorizon,
    scenarioFullyVisibleInHorizon: impactOutsideHorizon === 0,
    affectedMonths,
    baselineNegativeMonths,
    scenarioNegativeMonths,
    newNegativeMonths,
    worstProjectedMonth,
    largestMonthlyImpact,
    baselineCumulativeProjectedNet,
    scenarioCumulativeProjectedNet,
    cumulativeDelta: roundMoney(scenarioCumulativeProjectedNet - baselineCumulativeProjectedNet),
  }
}

export function simulatePurchase(
  startMonth: SelectedMonth,
  horizonMonths: number,
  input: PurchaseSimulationInput,
  scenario: PurchaseScenario,
  now = new Date(),
): PurchaseSimulationResult {
  assertValidSimulation(startMonth, horizonMonths, scenario, input)

  const baselineInput = cloneInput(input)
  const scenarioInput = addHypotheticalPurchase(input, scenario)
  const baseline = projectMonths(startMonth, horizonMonths, baselineInput, now)
  const scenarioProjection = projectMonths(startMonth, horizonMonths, scenarioInput, now)
  const monthlyImpact = buildMonthlyImpact(baseline.months, scenarioProjection.months)

  return {
    scenario: { ...scenario },
    baselineMonths: baseline.months,
    scenarioMonths: scenarioProjection.months,
    monthlyImpact,
    summary: buildSummary(scenario, input, baseline.months, scenarioProjection.months, monthlyImpact),
    cardLimit: buildCardLimitStatus(scenario, input, scenarioInput),
    goalContext: buildGoalContext(scenario, input),
  }
}

export function comparePurchaseScenarios(
  startMonth: SelectedMonth,
  horizonMonths: number,
  input: PurchaseSimulationInput,
  scenarios: PurchaseScenario[],
  now = new Date(),
): PurchaseScenarioComparison {
  return {
    scenarios: scenarios.map((scenario) => simulatePurchase(startMonth, horizonMonths, input, scenario, now)),
  }
}

export async function simulatePurchaseFromDb(
  startMonth: SelectedMonth,
  horizonMonths: number,
  scenario: PurchaseScenario,
  now = new Date(),
) {
  const [
    transactions,
    recurringRules,
    recurringOverrides,
    creditCards,
    cardPurchases,
    cardInvoicePayments,
    monthlyBudgets,
    goals,
    goalContributions,
  ] = await Promise.all([
    db.transactions.toArray(),
    db.recurringRules.toArray(),
    db.recurringOccurrenceOverrides.toArray(),
    db.creditCards.toArray(),
    db.cardPurchases.toArray(),
    db.cardInvoicePayments.toArray(),
    db.monthlyBudgets.toArray(),
    db.goals.toArray(),
    db.goalContributions.toArray(),
  ])

  return simulatePurchase(startMonth, horizonMonths, {
    transactions,
    recurringRules,
    recurringOverrides,
    creditCards,
    cardPurchases,
    cardInvoicePayments,
    monthlyBudgets,
    goals,
    goalContributions,
  }, scenario, now)
}

export function isPurchaseScenarioInMonth(scenario: PurchaseScenario, month: SelectedMonth) {
  return isDateInMonth(scenario.purchaseDate, month)
}

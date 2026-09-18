import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { hasEquivalentCategory } from '../lib/categories'
import { useCategoryOptions } from '../lib/useCategoryOptions'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { CreditCard, Goal, PaymentMethod } from '../db/types'
import { getInvoiceCycle, splitInstallments } from '../finance/cards/cards'
import {
  addMonths,
  isSameMonth,
  localDateTimeToIso,
  monthFromDate,
  plannedDateForMonth,
  todayDateInputValue,
  type SelectedMonth,
} from '../finance/month'
import {
  comparePurchaseScenarios,
  type PurchaseScenario,
  type PurchaseSimulationResult,
} from '../finance/simulator/purchaseSimulator'
import { registerSimulatedPurchase } from '../finance/simulator/registerPurchase'
import { formatBRL, parseMoney } from '../lib/money'

const horizonOptions = [3, 6, 12] as const
const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: 'pix', label: 'PIX' },
  { value: 'debit', label: 'D\u00e9bito' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'transfer', label: 'Transfer\u00eancia' },
  { value: 'other', label: 'Outro' },
]

interface PurchaseSimulatorPanelProps {
  selectedMonth: SelectedMonth
}

interface MethodState {
  cash: boolean
  cardOne: boolean
  cardInstallments: boolean
}

function formatShortMonth(month: SelectedMonth) {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
    .format(new Date(month.year, month.month, 1, 12))
    .replace('.', '')
    .toUpperCase()

  return `${label}/${String(month.year).slice(-2)}`
}

function defaultPurchaseDate(selectedMonth: SelectedMonth) {
  const currentMonth = monthFromDate()
  if (isSameMonth(selectedMonth, currentMonth)) return todayDateInputValue()

  const day = Math.min(15, new Date(selectedMonth.year, selectedMonth.month + 1, 0, 12).getDate())
  return [
    selectedMonth.year,
    String(selectedMonth.month + 1).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

function scenarioLabel(result: PurchaseSimulationResult) {
  if (result.scenario.mode === 'cash') return '\u00c0 vista'
  const installments = result.scenario.installmentCount ?? 1
  return installments === 1 ? 'Cart\u00e3o 1x' : `${installments}x no cart\u00e3o`
}

function projectionTone(value: number) {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'neutral'
}

function barHeight(value: number, maxAbs: number) {
  return `${Math.max(5, Math.round((Math.abs(value) / Math.max(1, maxAbs)) * 46))}%`
}

function buildScenarios(input: {
  name: string
  amount: number
  purchaseDate: string
  category: string
  paymentMethod: PaymentMethod
  methods: MethodState
  cardId: string
  installmentCount: number
  goalId: string
}) {
  const scenarios: PurchaseScenario[] = []
  const base = {
    name: input.name.trim(),
    totalAmount: input.amount,
    purchaseDate: input.purchaseDate,
    category: input.category,
    goalId: input.goalId || undefined,
  }

  if (input.methods.cash) {
    scenarios.push({
      ...base,
      id: 'cash',
      mode: 'cash',
      paymentMethod: input.paymentMethod,
    })
  }

  if (input.methods.cardOne) {
    scenarios.push({
      ...base,
      id: 'card-1x',
      mode: 'credit_card',
      cardId: input.cardId,
      installmentCount: 1,
    })
  }

  if (input.methods.cardInstallments) {
    scenarios.push({
      ...base,
      id: `card-${input.installmentCount}x`,
      mode: 'credit_card',
      cardId: input.cardId,
      installmentCount: input.installmentCount,
    })
  }

  return scenarios
}

function cardSummary(card: CreditCard | undefined) {
  if (!card) return 'Nenhum cart\u00e3o selecionado'
  const limit = card.creditLimit === undefined ? 'limite n\u00e3o cadastrado' : `limite ${formatBRL(card.creditLimit)}`
  return `${card.name} - ${limit} - fecha dia ${card.closingDay} - vence dia ${card.dueDay}`
}

function goalLabel(goal: Goal) {
  return goal.status === 'completed' ? `${goal.name} (miss\u00e3o conclu\u00edda)` : goal.name
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(iso))
}

export function PurchaseSimulatorPanel({ selectedMonth }: PurchaseSimulatorPanelProps) {
  const [name, setName] = useState('Novo setup')
  const [amount, setAmount] = useState('1200')
  const [purchaseDate, setPurchaseDate] = useState(() => defaultPurchaseDate(selectedMonth))
  const [horizon, setHorizon] = useState<(typeof horizonOptions)[number]>(6)
  const [category, setCategory] = useState('Compras')
  const categories = useCategoryOptions('simulator')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix')
  const [methods, setMethods] = useState<MethodState>({ cash: true, cardOne: true, cardInstallments: true })
  const [cardId, setCardId] = useState('')
  const [installmentCount, setInstallmentCount] = useState(6)
  const [goalId, setGoalId] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [selectedScenarioId, setSelectedScenarioId] = useState('')
  const [error, setError] = useState('')
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState('')
  const [registerSuccess, setRegisterSuccess] = useState('')
  const [limitAcknowledged, setLimitAcknowledged] = useState(false)
  const registeringRef = useRef(false)

  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const recurringRules = useLiveQuery(() => db.recurringRules.toArray(), [])
  const recurringOverrides = useLiveQuery(() => db.recurringOccurrenceOverrides.toArray(), [])
  const creditCards = useLiveQuery(() => db.creditCards.toArray(), [])
  const cardPurchases = useLiveQuery(() => db.cardPurchases.toArray(), [])
  const cardInvoicePayments = useLiveQuery(() => db.cardInvoicePayments.toArray(), [])
  const monthlyBudgets = useLiveQuery(() => db.monthlyBudgets.toArray(), [])
  const goals = useLiveQuery(() => db.goals.toArray(), [])
  const goalContributions = useLiveQuery(() => db.goalContributions.toArray(), [])

  const activeCards = useMemo(() => (creditCards ?? []).filter((card) => card.active), [creditCards])
  const loaded = transactions
    && recurringRules
    && recurringOverrides
    && creditCards
    && cardPurchases
    && cardInvoicePayments
    && monthlyBudgets
    && goals
    && goalContributions
  const selectedCard = activeCards.find((card) => card.id === cardId)

  useEffect(() => {
    if (!cardId && activeCards[0]) setCardId(activeCards[0].id)
    if (cardId && !activeCards.some((card) => card.id === cardId)) setCardId(activeCards[0]?.id ?? '')
  }, [activeCards, cardId])

  useEffect(() => {
    setPurchaseDate(defaultPurchaseDate(selectedMonth))
  }, [selectedMonth.year, selectedMonth.month])

  useEffect(() => {
    if (categories[0] && !hasEquivalentCategory(categories, category)) setCategory(categories[0])
  }, [categories, category])

  const simulationState = useMemo(() => {
    if (!submitted || !loaded) return { comparison: null, error: '' }

    try {
      const parsedAmount = parseMoney(amount)
      const purchaseDateIso = localDateTimeToIso(purchaseDate, '12:00')
      if (parsedAmount === null) throw new Error('Informe um valor de compra v\u00e1lido.')
      if (!purchaseDateIso) throw new Error('Informe uma data de compra v\u00e1lida.')
      if (!methods.cash && !methods.cardOne && !methods.cardInstallments) {
        throw new Error('Selecione pelo menos um cen\u00e1rio para comparar.')
      }

      const nextMethods = activeCards.length === 0
        ? { ...methods, cardOne: false, cardInstallments: false }
        : methods
      const scenarios = buildScenarios({
        name,
        amount: parsedAmount,
        purchaseDate: purchaseDateIso,
        category,
        paymentMethod,
        methods: nextMethods,
        cardId,
        installmentCount,
        goalId,
      })
      if (scenarios.length === 0) throw new Error('Nenhum cen\u00e1rio dispon\u00edvel para simular.')

      return {
        comparison: comparePurchaseScenarios(selectedMonth, horizon, {
          transactions,
          recurringRules,
          recurringOverrides,
          creditCards,
          cardPurchases,
          cardInvoicePayments,
          monthlyBudgets,
          goals,
          goalContributions,
        }, scenarios),
        error: '',
      }
    } catch (caught) {
      return {
        comparison: null,
        error: caught instanceof Error ? caught.message : 'N\u00e3o foi poss\u00edvel simular a compra.',
      }
    }
  }, [
    submitted,
    loaded,
    amount,
    purchaseDate,
    methods,
    activeCards.length,
    name,
    category,
    paymentMethod,
    cardId,
    installmentCount,
    goalId,
    selectedMonth,
    horizon,
    transactions,
    recurringRules,
    recurringOverrides,
    creditCards,
    cardPurchases,
    cardInvoicePayments,
    monthlyBudgets,
    goals,
    goalContributions,
  ])

  const results = simulationState.comparison?.scenarios ?? []
  const selectedResult = results.find((result) => result.scenario.id === selectedScenarioId) ?? results[0] ?? null
  const baselineReference = results[0]
  const maxAbs = Math.max(1, ...(selectedResult?.monthlyImpact.flatMap((impact) => [
    Math.abs(impact.baselineProjectedNet),
    Math.abs(impact.scenarioProjectedNet),
  ]) ?? [0]))

  useEffect(() => {
    if (results.length > 0 && !results.some((result) => result.scenario.id === selectedScenarioId)) {
      setSelectedScenarioId(results[0].scenario.id ?? '')
    }
  }, [results, selectedScenarioId])

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setError('')
    setRegisterSuccess('')
    closeConfirmation()
  }

  function reset() {
    setSubmitted(false)
    setSelectedScenarioId('')
    setError('')
    setRegisterSuccess('')
    closeConfirmation()
  }

  const visibleError = error || simulationState.error
  const selectedInstallments = selectedResult?.scenario.mode === 'credit_card'
    ? splitInstallments(selectedResult.scenario.totalAmount, selectedResult.scenario.installmentCount ?? 1)
    : []
  const periodEnd = addMonths(selectedMonth, horizon - 1)
  const registrationCard = selectedResult?.scenario.cardId
    ? (creditCards ?? []).find((card) => card.id === selectedResult.scenario.cardId)
    : undefined
  const registrationInvoiceSummary = selectedResult?.scenario.mode === 'credit_card' && registrationCard
    ? (() => {
        const cycle = getInvoiceCycle(registrationCard, selectedResult.scenario.purchaseDate)
        const count = selectedResult.scenario.installmentCount ?? 1
        const lastInvoice = addMonths({ year: cycle.invoiceYear, month: cycle.invoiceMonth }, count - 1)
        return {
          firstInvoice: { year: cycle.invoiceYear, month: cycle.invoiceMonth },
          lastInvoice,
          approximateInstallment: selectedInstallments[0] ?? selectedResult.scenario.totalAmount,
        }
      })()
    : null

  function closeConfirmation() {
    setConfirmationOpen(false)
    setRegisterError('')
    setLimitAcknowledged(false)
  }

  async function confirmRegistration() {
    if (!selectedResult || registeringRef.current) return

    if (selectedResult.cardLimit?.exceedsCreditLimit && !limitAcknowledged) {
      setRegisterError('Confirme que deseja continuar mesmo excedendo o limite cadastrado.')
      return
    }

    registeringRef.current = true
    setRegistering(true)
    setRegisterError('')

    try {
      await registerSimulatedPurchase(selectedResult.scenario)
      setRegisterSuccess('Compra registrada.')
      setSubmitted(false)
      setSelectedScenarioId('')
      setConfirmationOpen(false)
      setLimitAcknowledged(false)
    } catch (caught) {
      setRegisterError(caught instanceof Error ? caught.message : 'Nao foi possivel registrar a compra.')
    } finally {
      registeringRef.current = false
      setRegistering(false)
    }
  }

  return (
    <section className="panel purchase-simulator-panel" data-testid="purchase-simulator-panel" aria-labelledby="purchase-simulator-title">
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">SIMULADOR</span>
          <h2 id="purchase-simulator-title">Simulador de compras</h2>
          <p className="muted">Compare cenários hipotéticos sem gravar nada no seu histórico.</p>
        </div>
        <button className="button ghost" type="button" data-testid="purchase-simulator-reset" onClick={reset}>
          Limpar simulação
        </button>
      </div>
      <p className="guidance-note">A simulacao nao cria movimentacao real. Registro so acontece se voce confirmar uma opcao.</p>
      <div className="guided-links" aria-label="Atalhos do simulador">
        <span className="guided-links-label">Depois de comparar cenarios:</span>
        <div className="guided-links-row">
          <a className="inline-link" href="#cartoes">Registrar compra no cartao</a>
          <a className="inline-link" href="#registrar">Registrar movimento real</a>
        </div>
      </div>

      <form className="purchase-simulator-form" data-testid="purchase-simulator-form" onSubmit={submit}>
        <label>
          Nome da compra
          <input data-testid="sim-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
        </label>
        <label>
          Valor
          <input data-testid="sim-amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" autoComplete="off" />
        </label>
        <label>
          Data da compra
          <input data-testid="sim-date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} type="date" />
        </label>
        <label>
          Horizonte
          <select data-testid="sim-horizon" value={horizon} onChange={(event) => setHorizon(Number(event.target.value) as typeof horizon)}>
            {horizonOptions.map((option) => <option key={option} value={option}>{option} meses</option>)}
          </select>
        </label>
        <label>
          Categoria
          <select data-testid="sim-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Meio à vista
          <select data-testid="sim-payment-method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
            {paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
          </select>
        </label>

        <fieldset className="sim-methods">
          <legend>Cenários para comparar</legend>
          <label className="checkbox-row">
            <input data-testid="sim-method-cash" type="checkbox" checked={methods.cash} onChange={(event) => setMethods({ ...methods, cash: event.target.checked })} />
            À vista
          </label>
          <label className="checkbox-row">
            <input data-testid="sim-method-card-one" type="checkbox" checked={methods.cardOne} disabled={activeCards.length === 0} onChange={(event) => setMethods({ ...methods, cardOne: event.target.checked })} />
            Cartão 1x
          </label>
          <label className="checkbox-row">
            <input data-testid="sim-method-card-installments" type="checkbox" checked={methods.cardInstallments} disabled={activeCards.length === 0} onChange={(event) => setMethods({ ...methods, cardInstallments: event.target.checked })} />
            Cartão parcelado
          </label>
        </fieldset>

        <label>
          Cartão
          <select data-testid="sim-card" value={cardId} disabled={activeCards.length === 0} onChange={(event) => setCardId(event.target.value)}>
            {activeCards.length === 0 && <option value="">Sem cartão cadastrado</option>}
            {activeCards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
          </select>
        </label>
        <label>
          Parcelas
          <select data-testid="sim-installments" value={installmentCount} disabled={activeCards.length === 0} onChange={(event) => setInstallmentCount(Number(event.target.value))}>
            {[2, 3, 4, 6, 10, 12].map((option) => <option key={option} value={option}>{option}x</option>)}
          </select>
        </label>
        <label>
          Missão relacionada
          <select data-testid="sim-goal" value={goalId} onChange={(event) => setGoalId(event.target.value)}>
            <option value="">Sem missão</option>
            {(goals ?? []).filter((goal) => goal.status !== 'archived').map((goal) => (
              <option key={goal.id} value={goal.id}>{goalLabel(goal)}</option>
            ))}
          </select>
        </label>

        <div className="sim-card-summary" data-testid="sim-card-summary">
          {activeCards.length === 0
            ? 'Cadastre um cartão para simular compras no crédito.'
            : cardSummary(selectedCard)}
        </div>

        {visibleError && <p className="form-error" role="alert" data-testid="sim-error">{visibleError}</p>}

        <div className="goal-form-actions">
          <button className="button primary" type="submit" data-testid="sim-submit">Simular impacto</button>
        </div>
      </form>

      {registerSuccess && <p className="success-text" data-testid="sim-register-success">{registerSuccess}</p>}

      {!loaded && <p className="empty-state" data-testid="sim-loading">Carregando dados para simulação...</p>}

      {baselineReference && (
        <div className="sim-baseline" data-testid="sim-baseline">
          <article>
            <span>PERÍODO</span>
            <strong>{formatShortMonth(selectedMonth)} -&gt; {formatShortMonth(periodEnd)}</strong>
          </article>
          <article>
            <span>SEM A COMPRA</span>
            <strong>{formatBRL(baselineReference.summary.baselineCumulativeProjectedNet)}</strong>
            <small>Resultado acumulado projetado no período.</small>
          </article>
          <article>
            <span>MESES NEGATIVOS</span>
            <strong>{baselineReference.summary.baselineNegativeMonths.length}</strong>
          </article>
        </div>
      )}

      {results.length > 0 && (
        <div className="sim-result-grid" data-testid="sim-results">
          {results.map((result) => {
            const isSelected = selectedResult?.scenario.id === result.scenario.id
            const summary = result.summary
            return (
              <button
                key={result.scenario.id}
                className={`sim-scenario-card ${isSelected ? 'active' : ''}`}
                type="button"
                data-testid="sim-scenario-card"
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedScenarioId(result.scenario.id ?? '')
                  closeConfirmation()
                }}
              >
                <span>{scenarioLabel(result)}</span>
                <strong>{formatBRL(summary.totalPurchaseAmount)}</strong>
                <small>Impacto no período: {formatBRL(summary.cumulativeDelta)}</small>
                <small>Novos meses negativos: {summary.newNegativeMonths.length}</small>
                <small>Menor resultado: {formatShortMonth(summary.worstProjectedMonth)} {formatBRL(summary.worstProjectedMonth.projectedNet)}</small>
                {!summary.scenarioFullyVisibleInHorizon && <em>Impacto parcial no período</em>}
              </button>
            )
          })}
        </div>
      )}

      {selectedResult && (
        <div className="sim-detail" data-testid="sim-detail">
          <div className="panel-title-row">
            <div>
              <span className="eyebrow">{scenarioLabel(selectedResult)}</span>
              <h3>Comparativo do cenário</h3>
            </div>
            <strong className={selectedResult.summary.cumulativeDelta < 0 ? 'expense' : 'income'} data-testid="sim-cumulative-delta">
              {formatBRL(selectedResult.summary.cumulativeDelta)}
            </strong>
          </div>

          <div className="sim-detail-summary">
            <article>
              <span>Preço total</span>
              <strong data-testid="sim-total-amount">{formatBRL(selectedResult.summary.totalPurchaseAmount)}</strong>
            </article>
            <article>
              <span>Impacto dentro dos {horizon} meses</span>
              <strong data-testid="sim-impact-within">{formatBRL(selectedResult.summary.impactWithinHorizon)}</strong>
            </article>
            <article>
              <span>Ainda fora do período</span>
              <strong data-testid="sim-impact-outside">{formatBRL(selectedResult.summary.impactOutsideHorizon)}</strong>
              {!selectedResult.summary.scenarioFullyVisibleInHorizon && <small>Parte desta compra continua após o período exibido.</small>}
            </article>
            <article>
              <span>Novos meses com resultado negativo</span>
              <strong data-testid="sim-new-negative">{selectedResult.summary.newNegativeMonths.length}</strong>
            </article>
          </div>

          {selectedInstallments.length > 0 && (
            <p className="sim-info" data-testid="sim-installment-info">
              {selectedInstallments.length}x de aproximadamente {formatBRL(selectedInstallments[0])}.
            </p>
          )}

          {selectedResult.cardLimit && (
            <div className="sim-limit" data-testid="sim-card-limit">
              {selectedResult.cardLimit.hasLimit ? (
                <>
                  <span>Limite disponível antes: <strong>{formatBRL(selectedResult.cardLimit.availableLimitBefore ?? 0)}</strong></span>
                  <span>Compromisso da compra: <strong>{formatBRL(selectedResult.cardLimit.hypotheticalCommitment)}</strong></span>
                  <span>Limite estimado depois: <strong>{formatBRL(selectedResult.cardLimit.availableLimitAfter ?? 0)}</strong></span>
                  {selectedResult.cardLimit.exceedsCreditLimit && <em>O valor simulado excede o limite cadastrado.</em>}
                </>
              ) : (
                <span>Limite não cadastrado.</span>
              )}
            </div>
          )}

          {selectedResult.goalContext && (
            <div className="sim-goal-context" data-testid="sim-goal-context">
              <span>Missão: <strong>{selectedResult.goalContext.name}</strong></span>
              <span>Reservado para a missão: <strong>{formatBRL(selectedResult.goalContext.allocatedAmount)}</strong></span>
              <span>Diferença para o preço: <strong>{formatBRL(selectedResult.goalContext.goalCoverageGap)}</strong></span>
              <small>O valor reservado é apenas contexto da missão e não reduz automaticamente o impacto financeiro da compra.</small>
            </div>
          )}

          <div className="sim-register-actions">
            <button
              className="button primary"
              type="button"
              data-testid="sim-register-open"
              onClick={() => {
                setConfirmationOpen(true)
                setRegisterError('')
                setRegisterSuccess('')
                setLimitAcknowledged(false)
              }}
            >
              Registrar esta compra
            </button>
          </div>

          {confirmationOpen && (
            <div className="sim-register-box" data-testid="sim-register-box">
              <div>
                <span className="eyebrow">CONFIRMACAO</span>
                <h4>Registrar compra real</h4>
              </div>

              {selectedResult.scenario.mode === 'cash' ? (
                <div className="sim-register-summary" data-testid="sim-register-cash-summary">
                  <span>Nome: <strong>{selectedResult.scenario.name}</strong></span>
                  <span>Valor: <strong>{formatBRL(selectedResult.scenario.totalAmount)}</strong></span>
                  <span>Data: <strong>{formatDate(selectedResult.scenario.purchaseDate)}</strong></span>
                  <span>Categoria: <strong>{selectedResult.scenario.category ?? 'Outros'}</strong></span>
                  <span>Meio de pagamento: <strong>{paymentMethods.find((method) => method.value === selectedResult.scenario.paymentMethod)?.label ?? 'PIX'}</strong></span>
                  <small>Esta acao criara uma despesa real no seu historico.</small>
                </div>
              ) : (
                <div className="sim-register-summary" data-testid="sim-register-card-summary">
                  <span>Nome: <strong>{selectedResult.scenario.name}</strong></span>
                  <span>Preco total: <strong>{formatBRL(selectedResult.scenario.totalAmount)}</strong></span>
                  <span>Cartao: <strong>{registrationCard?.name ?? 'Cartao nao encontrado'}</strong></span>
                  <span>Parcelas: <strong>{selectedResult.scenario.installmentCount ?? 1}x</strong></span>
                  <span>Data da compra: <strong>{formatDate(selectedResult.scenario.purchaseDate)}</strong></span>
                  {registrationInvoiceSummary && (
                    <>
                      <span>Primeira fatura: <strong>{formatShortMonth(registrationInvoiceSummary.firstInvoice)}</strong></span>
                      <span>Ultima fatura: <strong>{formatShortMonth(registrationInvoiceSummary.lastInvoice)}</strong></span>
                      <span>Parcela aproximada: <strong>{formatBRL(registrationInvoiceSummary.approximateInstallment)}</strong></span>
                    </>
                  )}
                  <small>Esta acao registrara a compra no cartao. O pagamento da fatura continuara separado.</small>
                </div>
              )}

              {selectedResult.goalContext && (
                <div className="sim-goal-context" data-testid="sim-register-goal-context">
                  <span>Missao: <strong>{selectedResult.goalContext.name}</strong></span>
                  <span>Reservado: <strong>{formatBRL(selectedResult.goalContext.allocatedAmount)}</strong></span>
                  <small>A missao e o valor reservado nao serao alterados automaticamente.</small>
                </div>
              )}

              {selectedResult.cardLimit?.exceedsCreditLimit && (
                <label className="checkbox-row warning-row">
                  <input
                    data-testid="sim-register-limit-ack"
                    type="checkbox"
                    checked={limitAcknowledged}
                    onChange={(event) => setLimitAcknowledged(event.target.checked)}
                  />
                  O valor simulado excede o limite cadastrado. Quero continuar mesmo assim.
                </label>
              )}

              {registerError && <p className="form-error" role="alert" data-testid="sim-register-error">{registerError}</p>}

              <div className="goal-form-actions">
                <button className="button ghost" type="button" onClick={closeConfirmation} disabled={registering}>
                  Cancelar
                </button>
                <button
                  className="button primary"
                  type="button"
                  data-testid="sim-register-confirm"
                  onClick={confirmRegistration}
                  disabled={registering || Boolean(selectedResult.cardLimit?.exceedsCreditLimit && !limitAcknowledged)}
                >
                  {registering ? 'Registrando...' : 'Confirmar registro'}
                </button>
              </div>
            </div>
          )}

          <div className="sim-chart" role="img" aria-label="Comparação entre sem compra e com compra por mês">
            {selectedResult.monthlyImpact.map((impact) => (
              <div className="sim-chart-month" key={`${impact.year}-${impact.month}`}>
                <div className="sim-chart-bars">
                  <span className={`baseline ${projectionTone(impact.baselineProjectedNet)}`} style={{ height: barHeight(impact.baselineProjectedNet, maxAbs) }} />
                  <span className={`scenario ${projectionTone(impact.scenarioProjectedNet)}`} style={{ height: barHeight(impact.scenarioProjectedNet, maxAbs) }} />
                </div>
                <strong>{formatShortMonth(impact)}</strong>
              </div>
            ))}
          </div>

          <div className="sim-month-list" data-testid="sim-month-list">
            {selectedResult.monthlyImpact.map((impact) => (
              <article key={`${impact.year}-${impact.month}`} data-testid="sim-month-impact">
                <strong>{formatShortMonth(impact)}</strong>
                <span>Sem compra: {formatBRL(impact.baselineProjectedNet)}</span>
                <span>Com compra: {formatBRL(impact.scenarioProjectedNet)}</span>
                <span>Impacto: {formatBRL(impact.delta)}</span>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

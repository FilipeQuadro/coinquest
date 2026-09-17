import { useMemo, useState, type FormEvent } from 'react'
import { useCategoryOptions } from '../lib/useCategoryOptions'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { PaymentMethod, RecurringRule, TransactionType } from '../db/types'
import {
  formatMonthYear,
  parseMonthInputValue,
  toMonthInputValue,
  type SelectedMonth,
} from '../finance/month'
import { buildCreditCardInvoices, getUnpaidInvoiceCommitment } from '../finance/cards/cards'
import {
  buildRecurringOccurrences,
  calculateMonthlyOutlook,
  confirmOccurrenceAsActual,
  deleteRecurringRule,
  saveRecurringRule,
  skipOccurrence,
  type RecurringOccurrence,
  type RecurringRuleDraft,
} from '../finance/recurring/recurring'
import { audioEngine } from '../lib/audio'
import { formatBRL, parseMoney } from '../lib/money'

const paymentLabels: Record<PaymentMethod, string> = {
  pix: 'PIX',
  debit: 'Debito',
  credit: 'Credito',
  cash: 'Dinheiro',
  transfer: 'Transferencia',
  other: 'Outro',
}

const statusLabels: Record<RecurringOccurrence['status'], string> = {
  pending: 'Previsto',
  overdue: 'Pendente',
  skipped: 'Ignorado',
  realized: 'Realizado',
}

interface RecurringPanelProps {
  selectedMonth: SelectedMonth
}

function emptyDraft(selectedMonth: SelectedMonth): RecurringRuleDraft {
  return {
    type: 'expense',
    description: '',
    amount: 0,
    category: 'Assinaturas',
    paymentMethod: 'pix',
    dayOfMonth: 10,
    startYear: selectedMonth.year,
    startMonth: selectedMonth.month,
    active: true,
  }
}

function formatDay(isoDate: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(isoDate)).replace('.', '')
}

export function RecurringPanel({ selectedMonth }: RecurringPanelProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<RecurringOccurrence | null>(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(() => emptyDraft(selectedMonth))
  const categories = useCategoryOptions('recurring', draft.category)
  const [amountText, setAmountText] = useState('')
  const [startMonthText, setStartMonthText] = useState(() => toMonthInputValue(selectedMonth))
  const [endMonthText, setEndMonthText] = useState('')

  const rules = useLiveQuery(
    async () => (await db.recurringRules.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [],
    [],
  )
  const overrides = useLiveQuery(
    () => db.recurringOccurrenceOverrides.where('[year+month]').equals([selectedMonth.year, selectedMonth.month]).toArray(),
    [selectedMonth.year, selectedMonth.month],
    [],
  )
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [])
  const cards = useLiveQuery(() => db.creditCards.toArray(), [], [])
  const cardPurchases = useLiveQuery(() => db.cardPurchases.toArray(), [], [])
  const cardPayments = useLiveQuery(() => db.cardInvoicePayments.toArray(), [], [])
  const occurrences = useMemo(
    () => buildRecurringOccurrences(rules, overrides, selectedMonth, transactions),
    [rules, overrides, selectedMonth, transactions],
  )
  const cardInvoices = buildCreditCardInvoices(cards, cardPurchases, cardPayments, selectedMonth, transactions)
  const outlook = calculateMonthlyOutlook(transactions, occurrences, selectedMonth, getUnpaidInvoiceCommitment(cardInvoices))

  function resetForm(month = selectedMonth) {
    setEditingRule(null)
    setDraft(emptyDraft(month))
    setAmountText('')
    setStartMonthText(toMonthInputValue(month))
    setEndMonthText('')
    setError('')
  }

  function startEdit(rule: RecurringRule) {
    setEditingRule(rule)
    setDraft({
      type: rule.type,
      description: rule.description,
      amount: rule.amount,
      category: rule.category,
      paymentMethod: rule.paymentMethod,
      dayOfMonth: rule.dayOfMonth,
      startYear: rule.startYear,
      startMonth: rule.startMonth,
      endYear: rule.endYear,
      endMonth: rule.endMonth,
      active: rule.active,
    })
    setAmountText(String(rule.amount).replace('.', ','))
    setStartMonthText(toMonthInputValue({ year: rule.startYear, month: rule.startMonth }))
    setEndMonthText(rule.endYear !== undefined && rule.endMonth !== undefined ? toMonthInputValue({ year: rule.endYear, month: rule.endMonth }) : '')
    setFormOpen(true)
    setPendingDeleteId(null)
    setError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsedAmount = parseMoney(amountText)
    const start = parseMonthInputValue(startMonthText)
    const end = endMonthText ? parseMonthInputValue(endMonthText) : null

    if (parsedAmount === null || !start || (endMonthText && !end)) {
      setError('Revise valor e meses da recorrencia.')
      return
    }

    try {
      await saveRecurringRule({
        ...draft,
        amount: parsedAmount,
        startYear: start.year,
        startMonth: start.month,
        endYear: end?.year,
        endMonth: end?.month,
      }, editingRule?.id)
      resetForm()
      setFormOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel salvar a recorrencia.')
    }
  }

  async function confirmAsActual(occurrence: RecurringOccurrence) {
    const transaction = await confirmOccurrenceAsActual(occurrence)
    transaction.type === 'income' ? audioEngine.income() : audioEngine.expense()
    setConfirming(null)
  }

  async function toggleActive(rule: RecurringRule) {
    await saveRecurringRule({
      type: rule.type,
      description: rule.description,
      amount: rule.amount,
      category: rule.category,
      paymentMethod: rule.paymentMethod,
      dayOfMonth: rule.dayOfMonth,
      startYear: rule.startYear,
      startMonth: rule.startMonth,
      endYear: rule.endYear,
      endMonth: rule.endMonth,
      active: !rule.active,
    }, rule.id)
  }

  return (
    <section className="panel recurring-panel" data-testid="recurring-panel">
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">PREVISOES DO MES</span>
          <h2>Compromissos de {formatMonthYear(selectedMonth)}</h2>
          <p className="muted">Planejado aparece separado do realizado. Nada vira transacao automaticamente.</p>
        </div>
        <button
          className="button secondary"
          type="button"
          data-testid="recurring-toggle-form"
          onClick={() => {
            if (formOpen) resetForm()
            setFormOpen(!formOpen)
          }}
        >
          {formOpen ? 'Fechar' : 'Adicionar recorrencia'}
        </button>
      </div>

      <div className="outlook-grid" data-testid="monthly-outlook">
        <article>
          <span>REALIZADO</span>
          <strong>{formatBRL(outlook.actualIncome - outlook.actualExpense)}</strong>
          <small>{formatBRL(outlook.actualIncome)} recebidos / {formatBRL(outlook.actualExpense)} gastos</small>
        </article>
        <article>
          <span>PREVISTO RESTANTE</span>
          <strong>{formatBRL(outlook.plannedIncome - outlook.plannedExpense)}</strong>
          <small>{formatBRL(outlook.plannedIncome)} entradas / {formatBRL(outlook.plannedExpense)} saidas / {formatBRL(outlook.committedCardExpense)} cartao</small>
        </article>
        <article>
          <span>RESULTADO PROJETADO</span>
          <strong data-testid="projected-net">{formatBRL(outlook.projectedNet)}</strong>
          <small>{outlook.pendingCount} previstos, {outlook.overdueCount} pendentes</small>
        </article>
      </div>

      {formOpen && (
        <form className="recurring-form" data-testid="recurring-form" onSubmit={submit}>
          <label>
            Tipo
            <select value={draft.type} data-testid="recurring-type" onChange={(event) => setDraft({ ...draft, type: event.target.value as TransactionType })}>
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
            </select>
          </label>
          <label>
            Valor
            <input data-testid="recurring-amount" value={amountText} onChange={(event) => setAmountText(event.target.value)} inputMode="decimal" placeholder="120,00" autoComplete="off" />
          </label>
          <label className="span-2">
            Descricao
            <input data-testid="recurring-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Ex.: Internet" autoComplete="off" />
          </label>
          <label>
            Categoria
            <select data-testid="recurring-category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Pagamento
            <select data-testid="recurring-payment" value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value as PaymentMethod })}>
              <option value="pix">PIX</option>
              <option value="debit">Debito</option>
              <option value="credit">Credito</option>
              <option value="cash">Dinheiro</option>
              <option value="transfer">Transferencia</option>
              <option value="other">Outro</option>
            </select>
          </label>
          <label>
            Dia
            <input data-testid="recurring-day" value={draft.dayOfMonth} onChange={(event) => setDraft({ ...draft, dayOfMonth: Number(event.target.value) })} inputMode="numeric" min="1" max="31" type="number" />
          </label>
          <label>
            Comeca em
            <input data-testid="recurring-start" value={startMonthText} onChange={(event) => setStartMonthText(event.target.value)} type="month" />
          </label>
          <label>
            Termina em
            <input data-testid="recurring-end" value={endMonthText} onChange={(event) => setEndMonthText(event.target.value)} type="month" />
          </label>
          <label className="checkbox-row">
            <input data-testid="recurring-active" type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />
            Ativa
          </label>
          {error && <div className="message error span-2">{error}</div>}
          <div className="transaction-editor-actions span-2">
            <button className="button ghost" type="button" onClick={() => { resetForm(); setFormOpen(false) }}>Cancelar</button>
            <button className="button primary" data-testid="recurring-save" type="submit">{editingRule ? 'Salvar regra' : 'Criar recorrencia'}</button>
          </div>
        </form>
      )}

      <div className="recurring-list" aria-label="Ocorrencias recorrentes do mes">
        {occurrences.length === 0 ? (
          <div className="empty-state">Nenhum compromisso previsto para este mes.</div>
        ) : occurrences.map((occurrence) => (
          <article className={`recurring-item status-${occurrence.status}`} data-testid="recurring-occurrence" key={`${occurrence.ruleId}-${occurrence.year}-${occurrence.month}`}>
            <div className="recurring-date">{formatDay(occurrence.plannedDate)}</div>
            <div className="recurring-main">
              <strong>{occurrence.description}</strong>
              <span>{occurrence.category} - {paymentLabels[occurrence.paymentMethod]} - {statusLabels[occurrence.status]}</span>
            </div>
            <strong className={occurrence.type === 'income' ? 'income' : 'expense'}>
              {occurrence.type === 'income' ? '+' : '-'} {formatBRL(occurrence.amount)}
            </strong>
            <div className="history-actions">
              {occurrence.status !== 'realized' && occurrence.status !== 'skipped' && (
                <>
                  <button className="button ghost compact" data-testid="skip-occurrence" type="button" onClick={() => skipOccurrence(occurrence.ruleId, selectedMonth)}>Pular</button>
                  <button className="button secondary compact" data-testid="confirm-occurrence" type="button" onClick={() => setConfirming(occurrence)}>
                    {occurrence.type === 'income' ? 'Confirmar recebimento' : 'Confirmar pagamento'}
                  </button>
                </>
              )}
              <button
                className="button ghost compact"
                data-testid="edit-recurring-rule"
                type="button"
                onClick={() => {
                  const rule = rules.find((item) => item.id === occurrence.ruleId)
                  if (rule) startEdit(rule)
                }}
              >
                Editar
              </button>
              {pendingDeleteId === occurrence.ruleId ? (
                <button className="button ghost danger compact" data-testid="confirm-delete-recurring-rule" type="button" onClick={() => deleteRecurringRule(occurrence.ruleId)}>Confirmar</button>
              ) : (
                <button className="button ghost compact" data-testid="delete-recurring-rule" type="button" onClick={() => setPendingDeleteId(occurrence.ruleId)}>Excluir</button>
              )}
              {(() => {
                const rule = rules.find((item) => item.id === occurrence.ruleId)
                return rule ? (
                  <button className="button ghost compact" data-testid="toggle-recurring-rule" type="button" onClick={() => toggleActive(rule)}>
                    {rule.active ? 'Pausar' : 'Ativar'}
                  </button>
                ) : null
              })()}
            </div>
          </article>
        ))}
      </div>

      {rules.length > 0 && (
        <div className="rule-list" aria-label="Regras recorrentes cadastradas">
          <span className="eyebrow">REGRAS CADASTRADAS</span>
          {rules.map((rule) => (
            <article className="rule-item" data-testid="recurring-rule" key={rule.id}>
              <div>
                <strong>{rule.description}</strong>
                <span>{rule.active ? 'Ativa' : 'Pausada'} - todo dia {rule.dayOfMonth}</span>
              </div>
              <div className="history-actions">
                <button className="button ghost compact" type="button" onClick={() => startEdit(rule)}>Editar regra</button>
                <button className="button ghost compact" type="button" onClick={() => toggleActive(rule)}>{rule.active ? 'Pausar' : 'Ativar'}</button>
                {pendingDeleteId === rule.id ? (
                  <button className="button ghost danger compact" type="button" onClick={() => deleteRecurringRule(rule.id)}>Confirmar exclusao</button>
                ) : (
                  <button className="button ghost compact" type="button" onClick={() => setPendingDeleteId(rule.id)}>Excluir regra</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {confirming && (
        <div className="confirm-box" data-testid="confirm-occurrence-box">
          <div>
            <strong>{confirming.type === 'income' ? 'Confirmar recebimento' : 'Confirmar pagamento'}</strong>
            <span>{confirming.description} - {formatBRL(confirming.amount)} - {new Date(confirming.plannedDate).toLocaleDateString('pt-BR')}</span>
          </div>
          <div className="history-actions">
            <button className="button ghost compact" type="button" onClick={() => setConfirming(null)}>Cancelar</button>
            <button className="button primary compact" data-testid="confirm-occurrence-actual" type="button" onClick={() => confirmAsActual(confirming)}>Criar transacao real</button>
          </div>
        </div>
      )}
    </section>
  )
}

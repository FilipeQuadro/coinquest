import { useState, type FormEvent } from 'react'
import { useCategoryOptions } from '../lib/useCategoryOptions'
import type { PaymentMethod, TransactionType } from '../db/types'
import type { SelectedMonth } from '../finance/month'
import {
  currentTimeInputValue,
  formatMonthYear,
  isSameMonth,
  localDateTimeToIso,
  monthFromDate,
  todayDateInputValue,
} from '../finance/month'
import { recordTransaction, validateTransactionDraft } from '../finance/transactions'
import { audioEngine } from '../lib/audio'
import { parseMoney } from '../lib/money'

interface ManualTransactionProps {
  selectedMonth: SelectedMonth
}

export function ManualTransaction({ selectedMonth }: ManualTransactionProps) {
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Outros')
  const categories = useCategoryOptions(`transaction-${type}`, category)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix')
  const [dateValue, setDateValue] = useState(() => todayDateInputValue())
  const [timeValue, setTimeValue] = useState(() => currentTimeInputValue())
  const [error, setError] = useState('')
  const viewingCurrentMonth = isSameMonth(selectedMonth, monthFromDate())

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsedAmount = parseMoney(amount)
    const occurredAt = localDateTimeToIso(dateValue, timeValue)

    if (!occurredAt) {
      setError('Informe uma data valida.')
      return
    }

    const draft = {
      type,
      amount: parsedAmount ?? 0,
      description,
      category,
      paymentMethod,
      occurredAt,
    }
    const validationError = validateTransactionDraft(draft)

    if (validationError) {
      setError(validationError)
      return
    }

    const transaction = await recordTransaction(draft)
    transaction.type === 'income' ? audioEngine.income() : audioEngine.expense()

    setAmount('')
    setDescription('')
    setDateValue(todayDateInputValue())
    setTimeValue(currentTimeInputValue())
    setError('')
  }

  return (
    <section className="panel manual-panel">
      <span className="eyebrow">CONTROLE MANUAL</span>
      <h2>Adicionar manualmente</h2>
      {!viewingCurrentMonth && (
        <div className="message info" data-testid="manual-month-context">
          Voce esta visualizando {formatMonthYear(selectedMonth)}. Este formulario usa a data indicada abaixo.
        </div>
      )}
      <form className="form-grid" onSubmit={submit}>
        <label>
          Tipo
          <select data-testid="manual-type-select" value={type} onChange={(event) => setType(event.target.value as TransactionType)}>
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
        </label>
        <label>
          Valor
          <input data-testid="manual-amount-input" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="39,90" autoComplete="off" />
        </label>
        <label className="span-2">
          Descricao
          <input data-testid="manual-description-input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Mercado" autoComplete="off" />
        </label>
        <label>
          Categoria
          <select data-testid="manual-category-select" value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Pagamento
          <select data-testid="manual-payment-select" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
            <option value="pix">PIX</option>
            <option value="debit">Debito</option>
            <option value="credit">Credito</option>
            <option value="cash">Dinheiro</option>
            <option value="transfer">Transferencia</option>
            <option value="other">Outro</option>
          </select>
        </label>
        <label>
          Data
          <input data-testid="manual-date-input" type="date" value={dateValue} onChange={(event) => setDateValue(event.target.value)} />
        </label>
        <label>
          Hora
          <input data-testid="manual-time-input" type="time" value={timeValue} onChange={(event) => setTimeValue(event.target.value)} />
        </label>
        {error && <div className="message error span-2">{error}</div>}
        <button className="button primary span-2" data-testid="manual-submit" type="submit">Guardar no cofre</button>
      </form>
    </section>
  )
}

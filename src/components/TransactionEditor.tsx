import { useState, type FormEvent } from 'react'
import type { PaymentMethod, Transaction, TransactionType } from '../db/types'
import {
  localDateTimeToIso,
  toDateInputValue,
  toTimeInputValue,
} from '../finance/month'
import { getTransactionKind, updateTransaction, validateTransactionDraft } from '../finance/transactions'
import { parseMoney } from '../lib/money'

const categories = ['Alimentacao', 'Transporte', 'Casa', 'Assinaturas', 'Saude', 'Estudos', 'Lazer', 'Compras', 'Renda', 'Outros']

interface TransactionEditorProps {
  transaction: Transaction
  onCancel: () => void
  onSaved: () => void
}

export function TransactionEditor({ transaction, onCancel, onSaved }: TransactionEditorProps) {
  const transactionKind = getTransactionKind(transaction)
  const [type, setType] = useState<TransactionType>(transaction.type)
  const [amount, setAmount] = useState(String(transaction.amount).replace('.', ','))
  const [description, setDescription] = useState(transaction.description)
  const [category, setCategory] = useState(transaction.category)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(transaction.paymentMethod)
  const [dateValue, setDateValue] = useState(() => toDateInputValue(transaction.occurredAt))
  const [timeValue, setTimeValue] = useState(() => toTimeInputValue(transaction.occurredAt))
  const [confirmTypeChange, setConfirmTypeChange] = useState(false)
  const [error, setError] = useState('')
  const typeChanged = type !== transaction.type

  if (transactionKind === 'credit_card_payment') {
    return (
      <div className="transaction-editor protected-transaction" data-testid="linked-invoice-transaction-warning">
        <div className="message info span-2">
          Este lancamento pertence ao pagamento de uma fatura. Corrija data e forma de pagamento pela area do cartao para manter o vinculo sincronizado.
        </div>
        <div className="transaction-editor-actions span-2">
          <button className="button ghost" type="button" onClick={onCancel}>Fechar</button>
        </div>
      </div>
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()

    if (typeChanged && !confirmTypeChange) {
      setError('Confirme a troca entre receita e despesa.')
      return
    }

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

    await updateTransaction(transaction.id, draft)
    setError('')
    onSaved()
  }

  return (
    <form className="transaction-editor" data-testid="transaction-editor" onSubmit={submit}>
      <label>
        Tipo
        <select data-testid="edit-transaction-type" value={type} onChange={(event) => setType(event.target.value as TransactionType)}>
          <option value="expense">Despesa</option>
          <option value="income">Receita</option>
        </select>
      </label>
      <label>
        Valor
        <input
          data-testid="edit-transaction-amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
        />
      </label>
      <label className="span-2">
        Descricao
        <input
          data-testid="edit-transaction-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          autoComplete="off"
        />
      </label>
      <label>
        Categoria
        <select data-testid="edit-transaction-category" value={category} onChange={(event) => setCategory(event.target.value)}>
          {categories.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label>
        Pagamento
        <select data-testid="edit-transaction-payment" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
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
        <input data-testid="edit-transaction-date" type="date" value={dateValue} onChange={(event) => setDateValue(event.target.value)} />
      </label>
      <label>
        Hora
        <input data-testid="edit-transaction-time" type="time" value={timeValue} onChange={(event) => setTimeValue(event.target.value)} />
      </label>

      {typeChanged && (
        <label className="checkbox-row span-2">
          <input
            data-testid="edit-transaction-type-confirm"
            type="checkbox"
            checked={confirmTypeChange}
            onChange={(event) => setConfirmTypeChange(event.target.checked)}
          />
          Confirmo a troca entre receita e despesa.
        </label>
      )}

      {error && <div className="message error span-2">{error}</div>}

      <div className="transaction-editor-actions span-2">
        <button className="button ghost" type="button" onClick={onCancel}>Cancelar</button>
        <button className="button primary" data-testid="edit-transaction-save" type="submit">Salvar edicao</button>
      </div>
    </form>
  )
}

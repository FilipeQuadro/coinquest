import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { hasEquivalentCategory } from '../lib/categories'
import { useCategoryOptions } from '../lib/useCategoryOptions'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { CardPurchase, CreditCard, PaymentMethod } from '../db/types'
import {
  currentTimeInputValue,
  formatMonthYear,
  localDateTimeToIso,
  todayDateInputValue,
  toDateInputValue,
  type SelectedMonth,
} from '../finance/month'
import {
  buildCreditCardInvoices,
  buildInstallmentOccurrences,
  calculateCreditLimitUsage,
  correctCreditCardInvoicePayment,
  deleteCreditCard,
  deleteCardPurchase,
  getInvoiceCycle,
  payCreditCardInvoice,
  saveCardPurchase,
  saveCreditCard,
  splitInstallments,
  type CardPurchaseDraft,
} from '../finance/cards/cards'
import { audioEngine } from '../lib/audio'
import { formatBRL, parseMoney } from '../lib/money'

const invoicePaymentMethods: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'pix', label: 'PIX' },
  { value: 'debit', label: 'Debito' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'other', label: 'Outro' },
]

interface CreditCardsPanelProps {
  selectedMonth: SelectedMonth
}

function invoiceLabel(year: number, month: number) {
  return formatMonthYear({ year, month })
}

export function CreditCardsPanel({ selectedMonth }: CreditCardsPanelProps) {
  const cards = useLiveQuery(() => db.creditCards.toArray(), [], [])
  const purchases = useLiveQuery(() => db.cardPurchases.toArray(), [], [])
  const payments = useLiveQuery(() => db.cardInvoicePayments.toArray(), [], [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [])
  const [cardFormOpen, setCardFormOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null)
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false)
  const [editingPurchase, setEditingPurchase] = useState<CardPurchase | null>(null)
  const [cardName, setCardName] = useState('')
  const [creditLimit, setCreditLimit] = useState('')
  const [closingDay, setClosingDay] = useState('25')
  const [dueDay, setDueDay] = useState('2')
  const [cardActive, setCardActive] = useState(true)
  const [selectedCardId, setSelectedCardId] = useState('')
  const [purchaseDescription, setPurchaseDescription] = useState('')
  const [purchaseAmount, setPurchaseAmount] = useState('')
  const [purchaseCategory, setPurchaseCategory] = useState('Compras')
  const categories = useCategoryOptions('card-purchase', editingPurchase ? purchaseCategory : undefined)
  const [purchaseDate, setPurchaseDate] = useState(() => toDateInputValue(new Date().toISOString()))
  const [installmentCount, setInstallmentCount] = useState('1')
  const [pendingDeleteCardId, setPendingDeleteCardId] = useState<string | null>(null)
  const [pendingDeletePurchaseId, setPendingDeletePurchaseId] = useState<string | null>(null)
  const [confirmingInvoiceKey, setConfirmingInvoiceKey] = useState<string | null>(null)
  const [correctingInvoiceKey, setCorrectingInvoiceKey] = useState<string | null>(null)
  const [invoicePaymentDate, setInvoicePaymentDate] = useState(() => todayDateInputValue())
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState<PaymentMethod>('pix')
  const [error, setError] = useState('')
  const activeCards = cards.filter((card) => card.active)
  const cardId = selectedCardId || activeCards[0]?.id || cards[0]?.id || ''
  const selectedCard = cards.find((card) => card.id === cardId)
  const invoices = buildCreditCardInvoices(cards, purchases, payments, selectedMonth, transactions)
  const selectedInvoice = selectedCard ? invoices.find((invoice) => invoice.cardId === selectedCard.id) : invoices[0]
  const selectedCardPurchases = purchases.filter((purchase) => purchase.cardId === cardId)
  const limitUsage = selectedCard ? calculateCreditLimitUsage(selectedCard, selectedCardPurchases, payments, transactions) : null

  useEffect(() => {
    if (!editingPurchase && categories[0] && !hasEquivalentCategory(categories, purchaseCategory)) {
      setPurchaseCategory(categories[0])
    }
  }, [categories, editingPurchase, purchaseCategory])

  const purchasePreview = useMemo(() => {
    if (!selectedCard) return null
    const total = parseMoney(purchaseAmount)
    const count = Number(installmentCount)
    const iso = localDateTimeToIso(purchaseDate, currentTimeInputValue())
    if (total === null || !Number.isInteger(count) || count < 1 || !iso) return null
    const firstCycle = getInvoiceCycle(selectedCard, iso)
    const last = buildInstallmentOccurrences(selectedCard, {
      id: 'preview',
      cardId: selectedCard.id,
      description: purchaseDescription || 'Compra',
      category: purchaseCategory,
      totalAmount: total,
      purchaseDate: iso,
      installmentCount: count,
      createdAt: '',
      updatedAt: '',
    }, []).at(-1)

    return {
      total,
      count,
      amounts: splitInstallments(total, count),
      first: { year: firstCycle.invoiceYear, month: firstCycle.invoiceMonth },
      last: last ? { year: last.invoiceYear, month: last.invoiceMonth } : { year: firstCycle.invoiceYear, month: firstCycle.invoiceMonth },
    }
  }, [selectedCard, purchaseAmount, installmentCount, purchaseDate, purchaseDescription, purchaseCategory])

  async function submitCard(event: FormEvent) {
    event.preventDefault()
    const parsedLimit = creditLimit.trim() ? parseMoney(creditLimit) : undefined

    if (parsedLimit === null) {
      setError('Informe um limite valido ou deixe vazio.')
      return
    }

    try {
      const card = await saveCreditCard({
        name: cardName,
        creditLimit: parsedLimit,
        closingDay: Number(closingDay),
        dueDay: Number(dueDay),
        active: cardActive,
      }, editingCard?.id)
      setSelectedCardId(card.id)
      resetCardForm()
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel salvar o cartao.')
    }
  }

  async function submitPurchase(event: FormEvent) {
    event.preventDefault()
    const total = parseMoney(purchaseAmount)
    const iso = localDateTimeToIso(purchaseDate, currentTimeInputValue())

    if (total === null || !iso) {
      setError('Revise valor e data da compra.')
      return
    }

    const draft: CardPurchaseDraft = {
      cardId,
      description: purchaseDescription,
      category: purchaseCategory,
      totalAmount: total,
      purchaseDate: iso,
      installmentCount: Number(installmentCount),
    }

    try {
      await saveCardPurchase(draft, editingPurchase?.id)
      resetPurchaseForm()
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel salvar a compra.')
    }
  }

  async function payInvoice() {
    if (!selectedInvoice) return
    const paymentDate = localDateTimeToIso(invoicePaymentDate, currentTimeInputValue())
    if (!paymentDate) {
      setError('Informe uma data de pagamento valida.')
      return
    }

    try {
      const transaction = await payCreditCardInvoice(selectedInvoice, {
        paymentDate,
        paymentMethod: invoicePaymentMethod,
      })
      audioEngine.expense()
      setConfirmingInvoiceKey(null)
      setError('')
      return transaction
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel pagar a fatura.')
    }
  }

  async function correctPayment() {
    if (!selectedInvoice) return
    const paymentDate = localDateTimeToIso(invoicePaymentDate, currentTimeInputValue())
    if (!paymentDate) {
      setError('Informe uma data de pagamento valida.')
      return
    }

    try {
      await correctCreditCardInvoicePayment(selectedInvoice, {
        paymentDate,
        paymentMethod: invoicePaymentMethod,
      })
      setCorrectingInvoiceKey(null)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel corrigir o pagamento.')
    }
  }

  async function toggleCardActive(card: CreditCard) {
    try {
      const updated = await saveCreditCard({
        name: card.name,
        creditLimit: card.creditLimit,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        active: !card.active,
      }, card.id)
      setSelectedCardId(updated.id)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel atualizar o cartao.')
    }
  }

  async function removeCard(id: string) {
    try {
      await deleteCreditCard(id)
      setPendingDeleteCardId(null)
      if (selectedCardId === id) setSelectedCardId('')
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel excluir o cartao.')
    }
  }

  async function removePurchase(id: string) {
    try {
      await deleteCardPurchase(id)
      setPendingDeletePurchaseId(null)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel excluir a compra.')
    }
  }

  function resetPurchaseForm() {
    setEditingPurchase(null)
    setPurchaseDescription('')
    setPurchaseAmount('')
    setPurchaseCategory('Compras')
    setPurchaseDate(toDateInputValue(new Date().toISOString()))
    setInstallmentCount('1')
    setPurchaseFormOpen(false)
  }

  function resetCardForm() {
    setEditingCard(null)
    setCardName('')
    setCreditLimit('')
    setClosingDay('25')
    setDueDay('2')
    setCardActive(true)
    setCardFormOpen(false)
  }

  function startEditingCard(card: CreditCard) {
    setEditingCard(card)
    setCardName(card.name)
    setCreditLimit(card.creditLimit === undefined ? '' : String(card.creditLimit).replace('.', ','))
    setClosingDay(String(card.closingDay))
    setDueDay(String(card.dueDay))
    setCardActive(card.active)
    setCardFormOpen(true)
    setError('')
  }

  function startEditingPurchase(purchase: CardPurchase) {
    setEditingPurchase(purchase)
    setSelectedCardId(purchase.cardId)
    setPurchaseDescription(purchase.description)
    setPurchaseAmount(String(purchase.totalAmount).replace('.', ','))
    setPurchaseCategory(purchase.category)
    setPurchaseDate(toDateInputValue(purchase.purchaseDate))
    setInstallmentCount(String(purchase.installmentCount))
    setPurchaseFormOpen(true)
    setError('')
  }

  function startPayingInvoice() {
    if (!selectedInvoice) return
    setInvoicePaymentDate(todayDateInputValue())
    setInvoicePaymentMethod(selectedInvoice.paymentMethod ?? 'pix')
    setConfirmingInvoiceKey(`${selectedInvoice.cardId}-${selectedInvoice.year}-${selectedInvoice.month}`)
    setCorrectingInvoiceKey(null)
  }

  function startCorrectingPayment() {
    if (!selectedInvoice) return
    setInvoicePaymentDate(toDateInputValue(selectedInvoice.paymentDate ?? new Date().toISOString()))
    setInvoicePaymentMethod(selectedInvoice.paymentMethod ?? 'pix')
    setCorrectingInvoiceKey(`${selectedInvoice.cardId}-${selectedInvoice.year}-${selectedInvoice.month}`)
    setConfirmingInvoiceKey(null)
  }

  return (
    <section className="panel card-panel" data-testid="credit-card-panel">
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">CARTOES</span>
          <h2>Cartoes e faturas</h2>
          <p className="muted">Compra no cartao e compromisso. Pagamento da fatura e transacao real.</p>
        </div>
        <button className="button secondary" data-testid="toggle-card-form" type="button" onClick={() => cardFormOpen ? resetCardForm() : setCardFormOpen(true)}>
          {cardFormOpen ? 'Fechar' : 'Adicionar cartao'}
        </button>
      </div>

      {cardFormOpen && (
        <form className="card-form" data-testid="card-form" onSubmit={submitCard}>
          <label>
            Nome
            <input data-testid="card-name" value={cardName} onChange={(event) => setCardName(event.target.value)} placeholder="Ex.: Nubank" autoComplete="off" />
          </label>
          <label>
            Limite opcional
            <input data-testid="card-limit" value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} inputMode="decimal" placeholder="R$ 3.000,00" autoComplete="off" />
          </label>
          <label>
            Fecha dia
            <input data-testid="card-closing-day" value={closingDay} onChange={(event) => setClosingDay(event.target.value)} type="number" min="1" max="31" />
          </label>
          <label>
            Vence dia
            <input data-testid="card-due-day" value={dueDay} onChange={(event) => setDueDay(event.target.value)} type="number" min="1" max="31" />
          </label>
          <label className="checkbox-row">
            <input
              data-testid="card-active"
              type="checkbox"
              checked={cardActive}
              onChange={(event) => setCardActive(event.target.checked)}
            />
            Cartao ativo
          </label>
          {editingCard && (
            <div className="message info span-2">
              Nome, limite e status podem mudar. Ciclo fecha/vence fica bloqueado quando ja existem compras.
            </div>
          )}
          <button className="button primary span-2" data-testid="save-card" type="submit">
            {editingCard ? 'Salvar cartao' : 'Salvar cartao'}
          </button>
        </form>
      )}

      {cards.length > 0 && (
        <div className="card-summary-grid">
          {cards.map((card) => {
            const usage = calculateCreditLimitUsage(card, purchases.filter((purchase) => purchase.cardId === card.id), payments, transactions)
            return (
              <button
                className={`credit-card-chip ${card.id === cardId ? 'active' : ''}`}
                data-testid="credit-card-chip"
                type="button"
                key={card.id}
                onClick={() => setSelectedCardId(card.id)}
              >
                <strong>{card.name}</strong>
                <span>{card.active ? 'Ativo' : 'Inativo'} - fecha {card.closingDay} / vence {card.dueDay}</span>
                <small>{usage.hasLimit ? `${formatBRL(usage.availableLimit ?? 0)} disponivel` : `${formatBRL(usage.committedAmount)} comprometidos`}</small>
              </button>
            )
          })}
        </div>
      )}

      {selectedCard && (
        <>
          <div className="card-actions-row">
            <div>
              <span className="eyebrow">COMPRA NO CARTAO</span>
              <strong>{selectedCard.name}</strong>
              {limitUsage && <small>{limitUsage.hasLimit ? `${formatBRL(limitUsage.committedAmount)} usados de ${formatBRL(limitUsage.creditLimit ?? 0)}` : 'Sem limite cadastrado'}</small>}
            </div>
            <div className="card-button-group">
              <button className="button ghost compact" data-testid="edit-card" type="button" onClick={() => startEditingCard(selectedCard)}>Editar cartao</button>
              <button className="button ghost compact" data-testid="toggle-card-active" type="button" onClick={() => toggleCardActive(selectedCard)}>
                {selectedCard.active ? 'Desativar' : 'Reativar'}
              </button>
              {pendingDeleteCardId === selectedCard.id ? (
                <button className="button ghost danger compact" data-testid="confirm-delete-card" type="button" onClick={() => removeCard(selectedCard.id)}>Confirmar exclusao</button>
              ) : (
                <button className="button ghost compact" data-testid="delete-card" type="button" onClick={() => setPendingDeleteCardId(selectedCard.id)}>Excluir</button>
              )}
              <button
                className="button secondary compact"
                data-testid="toggle-purchase-form"
                type="button"
                disabled={!selectedCard.active}
                onClick={() => purchaseFormOpen ? resetPurchaseForm() : setPurchaseFormOpen(true)}
              >
                {purchaseFormOpen ? 'Fechar compra' : 'Nova compra'}
              </button>
            </div>
          </div>

          {!selectedCard.active && (
            <div className="message info">Cartao inativo preserva faturas e pagamentos, mas nao aceita novas compras.</div>
          )}

          {purchaseFormOpen && (
            <form className="card-form purchase-form" data-testid="purchase-form" onSubmit={submitPurchase}>
              <label>
                Cartao
                <select data-testid="purchase-card" value={cardId} onChange={(event) => setSelectedCardId(event.target.value)}>
                  {cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
                </select>
              </label>
              <label>
                Valor total
                <input data-testid="purchase-amount" value={purchaseAmount} onChange={(event) => setPurchaseAmount(event.target.value)} inputMode="decimal" placeholder="1200,00" autoComplete="off" />
              </label>
              <label className="span-2">
                Descricao
                <input data-testid="purchase-description" value={purchaseDescription} onChange={(event) => setPurchaseDescription(event.target.value)} placeholder="Ex.: Notebook" autoComplete="off" />
              </label>
              <label>
                Categoria
                <select data-testid="purchase-category" value={purchaseCategory} onChange={(event) => setPurchaseCategory(event.target.value)}>
                  {categories.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                Data
                <input data-testid="purchase-date" type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} />
              </label>
              <label>
                Parcelas
                <input data-testid="purchase-installments" type="number" min="1" max="60" value={installmentCount} onChange={(event) => setInstallmentCount(event.target.value)} />
              </label>
              {purchasePreview && (
                <div className="purchase-preview span-2" data-testid="purchase-preview">
                  <strong>{purchasePreview.count}x de aproximadamente {formatBRL(purchasePreview.amounts[0] ?? 0)}</strong>
                  <span>Primeira fatura: {invoiceLabel(purchasePreview.first.year, purchasePreview.first.month)} / Ultima: {invoiceLabel(purchasePreview.last.year, purchasePreview.last.month)}</span>
                  <span>Total preservado: {formatBRL(purchasePreview.total)}</span>
                </div>
              )}
              {editingPurchase && (
                <div className="message info span-2">
                  Editando compra existente. Se alguma fatura relacionada ja estiver paga, a V1 bloqueia mudancas estruturais.
                </div>
              )}
              <button className="button primary span-2" data-testid="save-purchase" type="submit">
                {editingPurchase ? 'Salvar edicao da compra' : 'Salvar compra'}
              </button>
            </form>
          )}

          {selectedInvoice && (
            <div className={`invoice-card invoice-${selectedInvoice.status}`} data-testid="card-invoice">
              <div className="panel-title-row">
                <div>
                  <span className="eyebrow">FATURA</span>
                  <h3>{invoiceLabel(selectedInvoice.year, selectedInvoice.month)}</h3>
                  <p className="muted">
                    Vence {new Date(selectedInvoice.dueDate).toLocaleDateString('pt-BR')}
                    {' - '}
                    {selectedInvoice.status === 'paid'
                      ? `Paga${selectedInvoice.paymentDate ? ` em ${new Date(selectedInvoice.paymentDate).toLocaleDateString('pt-BR')}` : ''}${selectedInvoice.paidLate ? ' com atraso' : ''}`
                      : selectedInvoice.status === 'overdue' ? 'Vencida' : selectedInvoice.status === 'due' ? 'A vencer' : 'Aberta'}
                  </p>
                </div>
                <strong>{formatBRL(selectedInvoice.total)}</strong>
              </div>
              <div className="invoice-lines">
                {selectedInvoice.installments.map((installment) => (
                  <div data-testid="invoice-installment" key={`${installment.purchaseId}-${installment.installmentNumber}`}>
                    <span>{installment.description} {installment.installmentNumber}/{installment.installmentCount}</span>
                    <strong>{formatBRL(installment.amount)}</strong>
                  </div>
                ))}
              </div>
              {selectedInvoice.status !== 'paid' && (
                <div className="invoice-actions">
                  {confirmingInvoiceKey === `${selectedInvoice.cardId}-${selectedInvoice.year}-${selectedInvoice.month}` ? (
                    <div className="invoice-payment-box" data-testid="invoice-payment-box">
                      <span>Cartao: {selectedCard.name}</span>
                      <span>Competencia: {invoiceLabel(selectedInvoice.year, selectedInvoice.month)}</span>
                      <span>Valor: {formatBRL(selectedInvoice.total)}</span>
                      <span>Vencimento: {new Date(selectedInvoice.dueDate).toLocaleDateString('pt-BR')}</span>
                      <label>
                        Data do pagamento
                        <input data-testid="invoice-payment-date" type="date" value={invoicePaymentDate} onChange={(event) => setInvoicePaymentDate(event.target.value)} />
                      </label>
                      <label>
                        Forma
                        <select data-testid="invoice-payment-method" value={invoicePaymentMethod} onChange={(event) => setInvoicePaymentMethod(event.target.value as PaymentMethod)}>
                          {invoicePaymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                        </select>
                      </label>
                      <div className="invoice-actions">
                        <button className="button ghost compact" type="button" onClick={() => setConfirmingInvoiceKey(null)}>Cancelar</button>
                        <button className="button primary compact" data-testid="confirm-pay-invoice" type="button" onClick={payInvoice}>Confirmar pagamento</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="button secondary"
                      data-testid="pay-invoice"
                      type="button"
                      onClick={startPayingInvoice}
                    >
                      Pagar fatura
                    </button>
                  )}
                </div>
              )}
              {selectedInvoice.status === 'paid' && (
                <div className="invoice-actions">
                  {correctingInvoiceKey === `${selectedInvoice.cardId}-${selectedInvoice.year}-${selectedInvoice.month}` ? (
                    <div className="invoice-payment-box" data-testid="invoice-correction-box">
                      <span>Corrigir pagamento de {selectedCard.name}</span>
                      <span>Competencia: {invoiceLabel(selectedInvoice.year, selectedInvoice.month)}</span>
                      <span>Valor preservado: {formatBRL(selectedInvoice.total)}</span>
                      <span>Vencimento: {new Date(selectedInvoice.dueDate).toLocaleDateString('pt-BR')}</span>
                      <label>
                        Data do pagamento
                        <input data-testid="invoice-payment-date" type="date" value={invoicePaymentDate} onChange={(event) => setInvoicePaymentDate(event.target.value)} />
                      </label>
                      <label>
                        Forma
                        <select data-testid="invoice-payment-method" value={invoicePaymentMethod} onChange={(event) => setInvoicePaymentMethod(event.target.value as PaymentMethod)}>
                          {invoicePaymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                        </select>
                      </label>
                      <div className="invoice-actions">
                        <button className="button ghost compact" type="button" onClick={() => setCorrectingInvoiceKey(null)}>Cancelar</button>
                        <button className="button primary compact" data-testid="save-invoice-payment-correction" type="button" onClick={correctPayment}>Salvar correcao</button>
                      </div>
                    </div>
                  ) : (
                    <button className="button ghost compact" data-testid="correct-invoice-payment" type="button" onClick={startCorrectingPayment}>
                      Corrigir pagamento
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="purchase-list" aria-label="Compras no cartao">
            {selectedCardPurchases.length === 0 ? (
              <div className="empty-state empty-state-guide">
                <strong>Nenhuma compra neste cartao.</strong>
                <span>Use Nova compra para registrar compromissos de fatura. Isso nao cria saida de caixa imediata.</span>
              </div>
            ) : selectedCardPurchases.map((purchase) => {
              const installments = buildInstallmentOccurrences(selectedCard, purchase, payments, transactions)
              const futureInstallments = installments.filter((installment) => installment.status !== 'paid').length

              return (
                <article className="purchase-item" data-testid="card-purchase-item" key={purchase.id}>
                  <div>
                    <strong>{purchase.description}</strong>
                    <span>{formatBRL(purchase.totalAmount)} - {purchase.installmentCount}x - {futureInstallments}/{purchase.installmentCount} futuras</span>
                  </div>
                  <button className="button ghost compact" data-testid="edit-purchase" type="button" onClick={() => startEditingPurchase(purchase)}>Editar</button>
                  {pendingDeletePurchaseId === purchase.id ? (
                    <button className="button ghost danger compact" data-testid="confirm-delete-purchase" type="button" onClick={() => removePurchase(purchase.id)}>Confirmar</button>
                  ) : (
                    <button className="button ghost compact" data-testid="delete-purchase" type="button" onClick={() => setPendingDeletePurchaseId(purchase.id)}>Excluir</button>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}

      {!selectedCard && (
        <div className="empty-state empty-state-guide">
          <strong>Nenhum cartao cadastrado.</strong>
          <span>Cadastre um cartao para acompanhar faturas. O pagamento da fatura continuara separado como movimentacao real.</span>
        </div>
      )}
      {error && <div className="message error">{error}</div>}
    </section>
  )
}

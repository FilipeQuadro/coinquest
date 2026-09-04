import type { CardPurchase, Transaction } from '../../db/types'
import { saveCardPurchase } from '../cards/cards'
import { recordTransaction } from '../transactions'
import type { PurchaseScenario } from './purchaseSimulator'

export type RegisteredPurchase =
  | { kind: 'cash'; transaction: Transaction }
  | { kind: 'credit_card'; purchase: CardPurchase }

function normalizeName(scenario: PurchaseScenario) {
  return scenario.name.trim()
}

function validateBaseScenario(scenario: PurchaseScenario) {
  if (!normalizeName(scenario)) throw new Error('Informe o nome da compra.')
  if (!Number.isFinite(scenario.totalAmount) || scenario.totalAmount <= 0) {
    throw new Error('Informe um valor de compra valido.')
  }

  const purchaseDate = new Date(scenario.purchaseDate)
  if (!Number.isFinite(purchaseDate.getTime())) {
    throw new Error('Informe uma data de compra valida.')
  }
}

export async function registerSimulatedPurchase(scenario: PurchaseScenario): Promise<RegisteredPurchase> {
  validateBaseScenario(scenario)

  if (scenario.mode === 'cash') {
    const transaction = await recordTransaction({
      type: 'expense',
      kind: 'standard',
      amount: scenario.totalAmount,
      description: normalizeName(scenario),
      category: scenario.category?.trim() || 'Outros',
      paymentMethod: scenario.paymentMethod ?? 'pix',
      occurredAt: scenario.purchaseDate,
    })

    return { kind: 'cash', transaction }
  }

  if (scenario.mode === 'credit_card') {
    if (!scenario.cardId) throw new Error('Escolha um cartao para registrar a compra.')

    const purchase = await saveCardPurchase({
      cardId: scenario.cardId,
      description: normalizeName(scenario),
      category: scenario.category?.trim() || 'Compras',
      totalAmount: scenario.totalAmount,
      purchaseDate: scenario.purchaseDate,
      installmentCount: scenario.installmentCount ?? 1,
    })

    return { kind: 'credit_card', purchase }
  }

  throw new Error('Cenario de compra invalido.')
}


import type { PaymentMethod, TransactionType } from '../db/types'
import { parseMoney } from './money'

export interface ParsedQuickEntry {
  type: TransactionType
  amount: number
  description: string
  category: string
  paymentMethod: PaymentMethod
}

const CATEGORY_RULES: Array<[string, RegExp]> = [
  ['Alimentação', /(mercado|supermercado|lanche|almoço|almoco|jantar|café|cafe|pizza|hamburg|açaí|acai|ifood|comida)/i],
  ['Transporte', /(uber|99|ônibus|onibus|gasolina|combustível|combustivel|posto|transporte|passagem)/i],
  ['Casa', /(aluguel|energia|luz|água|agua|internet|casa|condomínio|condominio)/i],
  ['Assinaturas', /(netflix|spotify|youtube|assinatura|prime|icloud|google one)/i],
  ['Saúde', /(farmácia|farmacia|remédio|remedio|consulta|médico|medico|saúde|saude)/i],
  ['Estudos', /(curso|faculdade|livro|escola|material|mensalidade)/i],
  ['Lazer', /(jogo|cinema|show|lazer|steam|playstation|xbox)/i],
  ['Compras', /(roupa|tênis|tenis|shopping|compra|comprei|amazon|shopee|mercado livre)/i],
  ['Renda', /(salário|salario|recebi|pagamento|freela|freelance|renda)/i],
]

function guessType(input: string): TransactionType {
  if (/(recebi|ganhei|entrou|salário|salario|pagamento recebido|pix recebido)/i.test(input)) return 'income'
  return 'expense'
}

function guessPayment(input: string): PaymentMethod {
  if (/pix/i.test(input)) return 'pix'
  if (/(crédito|credito|cartão de crédito|cartao de credito)/i.test(input)) return 'credit'
  if (/(débito|debito|cartão|cartao)/i.test(input)) return 'debit'
  if (/(dinheiro|espécie|especie)/i.test(input)) return 'cash'
  if (/transfer/i.test(input)) return 'transfer'
  return 'other'
}

export function parseQuickEntry(input: string): ParsedQuickEntry | null {
  const amountMatch = input.match(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/)
  if (!amountMatch) return null

  const amount = parseMoney(amountMatch[1])
  if (!amount) return null

  const type = guessType(input)
  const category = CATEGORY_RULES.find(([, regex]) => regex.test(input))?.[0] ?? (type === 'income' ? 'Renda' : 'Outros')
  const paymentMethod = guessPayment(input)

  const description = input
    .replace(amountMatch[0], '')
    .replace(/\b(gastei|paguei|comprei|fiz|um|uma|de|no|na|em|recebi|ganhei|pix|r\$)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    type,
    amount,
    category,
    paymentMethod,
    description: description || category,
  }
}

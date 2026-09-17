import { describe, expect, it } from 'vitest'
import { parseQuickEntry } from './quickParser'

describe('parseQuickEntry', () => {
  it.each([
    [
      'gastei 39,90 no mercado no pix',
      {
        type: 'expense',
        amount: 39.9,
        description: 'mercado',
        category: 'Alimentacao',
        paymentMethod: 'pix',
      },
    ],
    [
      'paguei 120 de internet no pix',
      {
        type: 'expense',
        amount: 120,
        description: 'internet',
        category: 'Casa',
        paymentMethod: 'pix',
      },
    ],
    [
      'recebi 1500 de pagamento',
      {
        type: 'income',
        amount: 1500,
        description: 'pagamento',
        category: 'Renda',
        paymentMethod: 'other',
      },
    ],
    [
      'gastei 25 no almoço',
      {
        type: 'expense',
        amount: 25,
        description: 'almoço',
        category: 'Alimentacao',
        paymentMethod: 'other',
      },
    ],
    [
      'gastei 50 com transporte',
      {
        type: 'expense',
        amount: 50,
        description: 'com transporte',
        category: 'Transporte',
        paymentMethod: 'other',
      },
    ],
  ])('parses "%s"', (input, expected) => {
    expect(parseQuickEntry(input)).toMatchObject(expected)
  })

  it('uses the canonical health category for new entries', () => {
    expect(parseQuickEntry('paguei 50 na farmacia')?.category).toBe('Saude')
  })

  it('returns null when no amount is found', () => {
    expect(parseQuickEntry('paguei o mercado no pix')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  canonicalCategory, categoryComparisonKey, deduplicateCategories, emptyCategoryPreferences,
  getCategoryOptions, parseCategoryPreferences, preserveCurrentCategory, validateCategoryPreferences,
} from './categories'

describe('category options', () => {
  it('retains the existing context choices and order', () => {
    const transactions = ['Alimentacao', 'Transporte', 'Casa', 'Assinaturas', 'Saude', 'Estudos', 'Lazer', 'Compras', 'Renda', 'Outros']
    expect(getCategoryOptions('transaction-income')).toEqual(transactions)
    expect(getCategoryOptions('transaction-expense')).toEqual(transactions)
    expect(getCategoryOptions('recurring')).toEqual(transactions)
    expect(getCategoryOptions('budget')).toEqual(transactions.filter((value) => value !== 'Renda'))
    expect(getCategoryOptions('card-purchase')).toEqual(transactions.map((value) => value === 'Renda' ? 'Cartao' : value))
    expect(getCategoryOptions('simulator')).toEqual(['Compras', 'Casa', 'Estudos', 'Lazer', 'Saude', 'Transporte', 'Outros'])
  })

  it('compares accents, case and surrounding whitespace without mutating input', () => {
    const source = [' Alimenta\u00e7\u00e3o ', 'ALIMENTACAO', '', ' Pets ', 'pets']
    const original = [...source]
    expect(deduplicateCategories(source)).toEqual(['Alimenta\u00e7\u00e3o', 'Pets'])
    expect(categoryComparisonKey(' SA\u00daDE ')).toBe('saude')
    expect(source).toEqual(original)
    expect(canonicalCategory(' alimenta\u00e7\u00e3o ')).toBe('Alimentacao')
    expect(canonicalCategory(' Pets ')).toBe('Pets')
  })

  it('adds custom choices, hides equivalent keys and preserves current records exactly', () => {
    const preferences = validateCategoryPreferences({ version: 1,
      customCategories: [' Pets ', 'PETS', 'Sa\u00fade', ''], hiddenCategoryKeys: [' SA\u00daDE ', 'pets'] })
    expect(preferences.customCategories).toEqual(['Pets'])
    const options = getCategoryOptions('transaction-expense', preferences)
    expect(options).not.toContain('Saude')
    expect(options).not.toContain('Pets')
    expect(getCategoryOptions('recurring', preferences, ' Pets ')).toContain(' Pets ')
    expect(getCategoryOptions('card-purchase', preferences, 'Legado')).toContain('Legado')
    expect(getCategoryOptions('simulator', preferences, 'Sa\u00fade')).toContain('Sa\u00fade')
    expect(getCategoryOptions('budget', { ...preferences, hiddenCategoryKeys: [] })).toContain('Pets')
    const current = getCategoryOptions('transaction-expense', undefined, 'Alimenta\u00e7\u00e3o')
    expect(current).toContain('Alimenta\u00e7\u00e3o')
    expect(current).not.toContain('Alimentacao')
    expect(preserveCurrentCategory([], '')).toEqual([''])
  })

  it('uses safe defaults for missing, corrupt or unsupported settings', () => {
    for (const json of [undefined, '{', 'null', '{"version":2}', '{"version":1,"customCategories":[5],"hiddenCategoryKeys":[]}']) {
      expect(parseCategoryPreferences(json)).toEqual(emptyCategoryPreferences())
    }
    expect(() => validateCategoryPreferences({ version: 2 })).toThrow()
  })
})

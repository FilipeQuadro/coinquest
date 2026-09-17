import { describe, expect, it } from 'vitest'
import { normalizeProductSectionHash, productNavItems } from './productNavigation'

describe('product navigation', () => {
  it('keeps the main navigation compact', () => {
    expect(productNavItems).toHaveLength(7)
    expect(productNavItems.map((item) => item.id)).toEqual([
      'mundo',
      'registrar',
      'planejamento',
      'cartoes',
      'missoes',
      'sync',
      'backup',
    ])
  })

  it('normalizes known hashes and ignores unknown anchors', () => {
    expect(normalizeProductSectionHash('#sync')).toBe('sync')
    expect(normalizeProductSectionHash('planejamento')).toBe('planejamento')
    expect(normalizeProductSectionHash('#register')).toBe('registrar')
    expect(normalizeProductSectionHash('#planning')).toBe('planejamento')
    expect(normalizeProductSectionHash('#cards')).toBe('cartoes')
    expect(normalizeProductSectionHash('#goals')).toBe('missoes')
    expect(normalizeProductSectionHash('#dados')).toBe('backup')
    expect(normalizeProductSectionHash('#data')).toBe('backup')
    expect(normalizeProductSectionHash('#historico')).toBeNull()
    expect(normalizeProductSectionHash('')).toBeNull()
  })

  it('handles malformed encoded hashes without throwing', () => {
    expect(normalizeProductSectionHash('#%')).toBeNull()
  })
})

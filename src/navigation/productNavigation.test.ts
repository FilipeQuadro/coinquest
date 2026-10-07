import { describe, expect, it } from 'vitest'
import { normalizeProductSectionHash, productAreaForSection, productNavItems } from './productNavigation'

describe('product navigation', () => {
  it('keeps the main navigation compact', () => {
    expect(productNavItems).toHaveLength(7)
    expect(productNavItems.map((item) => item.id)).toEqual([
      'inicio',
      'registrar',
      'planejamento',
      'cartoes',
      'missoes',
      'backup',
      'mundo',
    ])
  })

  it('normalizes known hashes and ignores unknown anchors', () => {
    expect(normalizeProductSectionHash('#sync')).toBe('sync')
    expect(normalizeProductSectionHash('#inicio')).toBe('inicio')
    expect(normalizeProductSectionHash('#mundo')).toBe('mundo')
    expect(normalizeProductSectionHash('planejamento')).toBe('planejamento')
    expect(normalizeProductSectionHash('#register')).toBe('registrar')
    expect(normalizeProductSectionHash('#planning')).toBe('planejamento')
    expect(normalizeProductSectionHash('#cards')).toBe('cartoes')
    expect(normalizeProductSectionHash('#goals')).toBe('missoes')
    expect(normalizeProductSectionHash('#history')).toBe('historico')
    expect(normalizeProductSectionHash('#historico')).toBe('historico')
    expect(normalizeProductSectionHash('#dados')).toBe('backup')
    expect(normalizeProductSectionHash('#data')).toBe('backup')
    expect(normalizeProductSectionHash('')).toBeNull()
  })

  it('handles malformed encoded hashes without throwing', () => {
    expect(normalizeProductSectionHash('#%')).toBeNull()
    expect(normalizeProductSectionHash('#constructor')).toBeNull()
    expect(normalizeProductSectionHash('#__proto__')).toBeNull()
  })

  it.each([
    ['#registrar', 'registrar', 'registrar'],
    ['#historico', 'historico', 'registrar'],
    ['#history', 'historico', 'registrar'],
    ['#orcamento', 'orcamento', 'planejamento'],
    ['#previsoes', 'previsoes', 'planejamento'],
    ['#projecao', 'projecao', 'planejamento'],
    ['#simulador', 'simulador', 'planejamento'],
    ['#sync', 'sync', 'backup'],
    ['#cloud', 'sync', 'backup'],
    ['#backup', 'backup', 'backup'],
    ['#dados', 'backup', 'backup'],
    ['#mundo', 'mundo', 'mundo'],
    ['#%70rojecao', 'projecao', 'planejamento'],
  ])('opens %s in its focused area without losing the target', (hash, target, area) => {
    const section = normalizeProductSectionHash(hash)
    expect(section).toBe(target)
    expect(section && productAreaForSection(section)).toBe(area)
  })
})

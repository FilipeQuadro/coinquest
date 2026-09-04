import { describe, expect, it } from 'vitest'
import { parseMoney } from './money'

describe('parseMoney', () => {
  it.each([
    ['10', 10],
    ['10,50', 10.5],
    ['10.50', 10.5],
    ['R$ 10,50', 10.5],
    ['1.250,90', 1250.9],
  ])('parses %s as %s', (raw, expected) => {
    expect(parseMoney(raw)).toBe(expected)
  })

  it.each(['', 'abc', 'R$', 'dez reais', '12,3,4'])('rejects invalid value %s', (raw) => {
    expect(parseMoney(raw)).toBeNull()
  })

  it('rejects zero', () => {
    expect(parseMoney('0')).toBeNull()
  })

  it('rejects negative values', () => {
    expect(parseMoney('-10')).toBeNull()
  })
})

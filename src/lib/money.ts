export const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)

export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/R\$/gi, '').replace(/\s/g, '')

  if (!cleaned) return null

  const brThousands = /^-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/
  const plainNumber = /^-?\d+(?:[.,]\d{1,2})?$/

  if (!brThousands.test(cleaned) && !plainNumber.test(cleaned)) return null

  const normalized = brThousands.test(cleaned)
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(',', '.')

  const value = Number(normalized)
  return Number.isFinite(value) && value > 0 ? value : null
}

export type ProductSectionId =
  | 'mundo'
  | 'registrar'
  | 'planejamento'
  | 'cartoes'
  | 'missoes'
  | 'sync'
  | 'backup'

export interface ProductNavItem {
  id: ProductSectionId
  label: string
}

export const productNavItems: ProductNavItem[] = [
  { id: 'mundo', label: 'Inicio' },
  { id: 'registrar', label: 'Registrar' },
  { id: 'planejamento', label: 'Planejamento' },
  { id: 'cartoes', label: 'Cartoes' },
  { id: 'missoes', label: 'Metas' },
  { id: 'sync', label: 'Nuvem' },
  { id: 'backup', label: 'Backup' },
]

const productSectionIds = new Set(productNavItems.map((item) => item.id))

const productSectionAliases: Record<string, ProductSectionId> = {
  home: 'mundo',
  inicio: 'mundo',
  register: 'registrar',
  planning: 'planejamento',
  cards: 'cartoes',
  goals: 'missoes',
  cloud: 'sync',
}

export function normalizeProductSectionHash(hash: string): ProductSectionId | null {
  const rawId = hash.startsWith('#') ? hash.slice(1) : hash
  if (!rawId) return null

  let decodedId = rawId
  try {
    decodedId = decodeURIComponent(rawId)
  } catch {
    decodedId = rawId
  }

  if (productSectionIds.has(decodedId as ProductSectionId)) return decodedId as ProductSectionId

  return productSectionAliases[decodedId] ?? null
}

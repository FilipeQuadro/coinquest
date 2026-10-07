export type ProductSectionId =
  | 'inicio'
  | 'mundo'
  | 'registrar'
  | 'planejamento'
  | 'cartoes'
  | 'missoes'
  | 'historico'
  | 'sync'
  | 'backup'
  | 'orcamento'
  | 'previsoes'
  | 'projecao'
  | 'simulador'

export type ProductAreaId = 'inicio' | 'registrar' | 'planejamento' | 'cartoes' | 'missoes' | 'backup' | 'mundo'

export interface ProductNavItem {
  id: ProductSectionId
  label: string
}

export const productNavItems: ProductNavItem[] = [
  { id: 'inicio', label: 'Início' },
  { id: 'registrar', label: 'Registro e histórico' },
  { id: 'planejamento', label: 'Planejamento' },
  { id: 'cartoes', label: 'Cartões' },
  { id: 'missoes', label: 'Metas' },
  { id: 'backup', label: 'Dados' },
  { id: 'mundo', label: 'Mundo' },
]

const productSectionIds = new Set<ProductSectionId>([
  ...productNavItems.map((item) => item.id),
  'mundo',
  'sync',
  'historico',
  'orcamento',
  'previsoes',
  'projecao',
  'simulador',
])

const productSectionAliases: Record<string, ProductSectionId> = {
  home: 'inicio',
  inicio: 'inicio',
  mundo: 'mundo',
  register: 'registrar',
  planning: 'planejamento',
  cards: 'cartoes',
  goals: 'missoes',
  history: 'historico',
  cloud: 'sync',
  data: 'backup',
  dados: 'backup',
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

  return Object.prototype.hasOwnProperty.call(productSectionAliases, decodedId) ? productSectionAliases[decodedId] : null
}

export function productAreaForSection(section: ProductSectionId): ProductAreaId {
  switch (section) {
    case 'historico': return 'registrar'
    case 'sync': return 'backup'
    case 'orcamento':
    case 'previsoes':
    case 'projecao':
    case 'simulador': return 'planejamento'
    default: return section
  }
}

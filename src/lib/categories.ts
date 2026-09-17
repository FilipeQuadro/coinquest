// Values are financial strings, not ids to migrate or rewrite in existing records.
export const DEFAULT_CATEGORIES = {
  food: 'Alimentacao',
  transport: 'Transporte',
  home: 'Casa',
  subscriptions: 'Assinaturas',
  health: 'Saude',
  education: 'Estudos',
  leisure: 'Lazer',
  shopping: 'Compras',
  income: 'Renda',
  card: 'Cartao',
  other: 'Outros',
} as const

type DefaultCategoryKey = keyof typeof DEFAULT_CATEGORIES
export type CategoryContext = 'transaction-income' | 'transaction-expense' | 'budget' | 'card-purchase' | 'recurring' | 'simulator'

export interface CategoryPreferencesV1 {
  version: 1
  customCategories: string[]
  hiddenCategoryKeys: string[]
}

const expenseKeys: DefaultCategoryKey[] = ['food', 'transport', 'home', 'subscriptions', 'health', 'education', 'leisure', 'shopping']
const transactionKeys: DefaultCategoryKey[] = [...expenseKeys, 'income', 'other']
// Keep the existing choices and ordering; income/expense are not new restrictions.
const contextKeys: Record<CategoryContext, readonly DefaultCategoryKey[]> = {
  'transaction-income': transactionKeys,
  'transaction-expense': transactionKeys,
  budget: [...expenseKeys, 'other'],
  'card-purchase': [...expenseKeys, 'card', 'other'],
  recurring: transactionKeys,
  simulator: ['shopping', 'home', 'education', 'leisure', 'health', 'transport', 'other'],
}

export function categoryComparisonKey(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}

export function deduplicateCategories(values: readonly string[]): string[] {
  const seen = new Set<string>()
  return values.map((value) => value.trim()).filter((value) => {
    const key = categoryComparisonKey(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Resolve new input only. Never apply this to persisted financial records. */
export function canonicalCategory(value: string): string {
  const key = categoryComparisonKey(value)
  return Object.values(DEFAULT_CATEGORIES).find((category) => categoryComparisonKey(category) === key)
    ?? (value.trim() || DEFAULT_CATEGORIES.other)
}

export function isDefaultCategory(value: string): boolean {
  const key = categoryComparisonKey(value)
  return Object.values(DEFAULT_CATEGORIES).some((category) => categoryComparisonKey(category) === key)
}

export function hasEquivalentCategory(values: readonly string[], value: string): boolean {
  const key = categoryComparisonKey(value)
  return values.some((item) => categoryComparisonKey(item) === key)
}

export function emptyCategoryPreferences(): CategoryPreferencesV1 {
  return { version: 1, customCategories: [], hiddenCategoryKeys: [] }
}

export function validateCategoryPreferences(value: unknown): CategoryPreferencesV1 {
  if (!value || typeof value !== 'object') throw new Error('Preferencias de categorias invalidas.')
  const input = value as Partial<CategoryPreferencesV1>
  if (input.version !== 1
    || !Array.isArray(input.customCategories) || !input.customCategories.every((item) => typeof item === 'string')
    || !Array.isArray(input.hiddenCategoryKeys) || !input.hiddenCategoryKeys.every((item) => typeof item === 'string')) {
    throw new Error('Preferencias de categorias invalidas.')
  }
  const defaults = new Set(Object.values(DEFAULT_CATEGORIES).map(categoryComparisonKey))
  return {
    version: 1,
    customCategories: deduplicateCategories(input.customCategories).filter((item) => !defaults.has(categoryComparisonKey(item))),
    hiddenCategoryKeys: deduplicateCategories(input.hiddenCategoryKeys.map(categoryComparisonKey)),
  }
}

export function parseCategoryPreferences(json: string | undefined): CategoryPreferencesV1 {
  try {
    return validateCategoryPreferences(JSON.parse(json ?? 'null'))
  } catch {
    // Old, invalid or newer settings remain untouched in storage.
    return emptyCategoryPreferences()
  }
}

export function preserveCurrentCategory(options: readonly string[], current?: string): string[] {
  const result = deduplicateCategories(options)
  if (current === undefined) return result
  const index = result.findIndex((option) => categoryComparisonKey(option) === categoryComparisonKey(current))
  // A select must retain the exact stored value, including a legacy spelling.
  if (index >= 0) result[index] = current
  else result.push(current)
  return result
}

export function addCustomCategoryPreference(
  preferences: CategoryPreferencesV1,
  name: string,
): CategoryPreferencesV1 {
  const trimmed = name.trim()
  if (!categoryComparisonKey(trimmed)) throw new Error('Informe um nome de categoria.')
  if (isDefaultCategory(trimmed)) throw new Error('Essa categoria ja existe nas categorias padrao.')
  if (hasEquivalentCategory(preferences.customCategories, trimmed)) {
    throw new Error('Essa categoria personalizada ja existe.')
  }
  return validateCategoryPreferences({
    ...preferences,
    customCategories: [...preferences.customCategories, trimmed],
  })
}

export function hideCategoryPreference(
  preferences: CategoryPreferencesV1,
  category: string,
): CategoryPreferencesV1 {
  const key = categoryComparisonKey(category)
  if (!key) return validateCategoryPreferences(preferences)
  return validateCategoryPreferences({
    ...preferences,
    hiddenCategoryKeys: [...preferences.hiddenCategoryKeys, key],
  })
}

export function showCategoryPreference(
  preferences: CategoryPreferencesV1,
  category: string,
): CategoryPreferencesV1 {
  const key = categoryComparisonKey(category)
  return validateCategoryPreferences({
    ...preferences,
    hiddenCategoryKeys: preferences.hiddenCategoryKeys.filter((item) => categoryComparisonKey(item) !== key),
  })
}

export function getCategoryOptions(
  context: CategoryContext,
  preferences: CategoryPreferencesV1 = emptyCategoryPreferences(),
  current?: string,
): string[] {
  const hidden = new Set(preferences.hiddenCategoryKeys.map(categoryComparisonKey))
  const options = deduplicateCategories([
    ...contextKeys[context].map((key) => DEFAULT_CATEGORIES[key]),
    ...preferences.customCategories,
  ]).filter((value) => !hidden.has(categoryComparisonKey(value)))
  return preserveCurrentCategory(options, current)
}

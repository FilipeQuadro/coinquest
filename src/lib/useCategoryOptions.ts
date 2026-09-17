import { useLiveQuery } from 'dexie-react-hooks'
import { getCategoryOptions, type CategoryContext } from './categories'
import { readCategoryPreferences } from './categoryPreferences'

export function useCategoryOptions(context: CategoryContext, current?: string): string[] {
  const preferences = useLiveQuery(readCategoryPreferences, [])
  return getCategoryOptions(context, preferences, current)
}

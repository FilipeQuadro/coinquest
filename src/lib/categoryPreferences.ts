import { db } from '../db/database'
import { parseCategoryPreferences, validateCategoryPreferences, type CategoryPreferencesV1 } from './categories'

export const CATEGORY_PREFERENCES_SETTING_KEY = 'categoryPreferences'

export async function readCategoryPreferences(): Promise<CategoryPreferencesV1> {
  const setting = await db.settings.get(CATEGORY_PREFERENCES_SETTING_KEY)
  return parseCategoryPreferences(setting?.value)
}

export async function saveCategoryPreferences(preferences: CategoryPreferencesV1): Promise<void> {
  const value = JSON.stringify(validateCategoryPreferences(preferences))
  await db.settings.put({ key: CATEGORY_PREFERENCES_SETTING_KEY, value })
}

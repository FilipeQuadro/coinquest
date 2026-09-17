import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import { emptyCategoryPreferences } from './categories'
import { CATEGORY_PREFERENCES_SETTING_KEY, readCategoryPreferences, saveCategoryPreferences } from './categoryPreferences'
import { exportBackup, importBackup } from '../backup/backup'
import { createLocalSyncSnapshotFromDb } from '../sync/syncSnapshot'

describe('local category preferences', () => {
  beforeEach(async () => { await db.delete(); await db.open() })

  it('reads defaults without writing or replacing unrecognized settings', async () => {
    expect(await readCategoryPreferences()).toEqual(emptyCategoryPreferences())
    expect(await db.settings.count()).toBe(0)
    await db.settings.put({ key: CATEGORY_PREFERENCES_SETTING_KEY, value: '{"version":2}' })
    expect(await readCategoryPreferences()).toEqual(emptyCategoryPreferences())
    expect((await db.settings.get(CATEGORY_PREFERENCES_SETTING_KEY))?.value).toBe('{"version":2}')
  })

  it('persists offline preferences without rewriting financial data, and uses existing backup/sync', async () => {
    const transaction = { id: 'old', type: 'expense' as const, amount: 42, category: 'Alimenta\u00e7\u00e3o',
      description: 'Mercado', paymentMethod: 'pix' as const, occurredAt: '2026-08-10T12:00:00Z', createdAt: '2026-08-10T12:00:00Z' }
    const budget = { id: 'budget', year: 2026, month: 7, category: 'Alimenta\u00e7\u00e3o', limit: 100, createdAt: '', updatedAt: '' }
    await db.transactions.put(transaction)
    await db.categoryBudgets.put(budget)
    await db.settings.put({ key: 'theme', value: 'tech' })
    const preferences = { version: 1 as const, customCategories: ['Pets'], hiddenCategoryKeys: ['saude'] }
    await saveCategoryPreferences(preferences)
    db.close()
    await db.open()
    expect(await readCategoryPreferences()).toEqual(preferences)
    expect(await db.transactions.toArray()).toEqual([transaction])
    expect(await db.categoryBudgets.toArray()).toEqual([budget])
    expect((await db.settings.get('theme'))?.value).toBe('tech')
    const snapshots = await createLocalSyncSnapshotFromDb()
    expect(snapshots.get(`setting:${CATEGORY_PREFERENCES_SETTING_KEY}`)?.payload).toEqual(await db.settings.get(CATEGORY_PREFERENCES_SETTING_KEY))
    const backup = await exportBackup()
    await saveCategoryPreferences(emptyCategoryPreferences())
    await importBackup(backup)
    expect(await readCategoryPreferences()).toEqual(preferences)
    expect(await db.transactions.toArray()).toEqual([transaction])
    expect(await db.categoryBudgets.toArray()).toEqual([budget])
  })
})

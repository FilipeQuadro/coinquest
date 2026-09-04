import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = 'http://127.0.0.1:5173/?timeOfDay=night'
const outputDir = 'test-results/screenshots'
const paths = []

await mkdir(outputDir, { recursive: true })

const timeout = setTimeout(() => {
  console.error('Missions screenshot capture timed out.')
  process.exit(1)
}, 120_000)

function isoForOffset(monthOffset, day = 15) {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + monthOffset, day, 12, 0, 0).toISOString()
}

async function prepare(page) {
  await page.goto(baseUrl)
  await page.locator('.game-canvas canvas').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('.pwa-toast .icon-button').click({ timeout: 1500 }).catch(() => {})
}

async function seedMissions(page) {
  const now = new Date().toISOString()
  const storesToClear = ['goals', 'goalContributions']
  const data = {
    goals: [
      {
        id: 'goal-pc',
        name: 'Novo PC',
        description: 'Setup principal para trabalho e estudos.',
        targetAmount: 5000,
        targetDate: isoForOffset(8),
        monthlyPlan: 500,
        status: 'active',
        priority: 'high',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'goal-setup',
        name: 'Setup completo',
        description: 'Perif\u00e9ricos e upgrades reservados.',
        targetAmount: 1000,
        targetDate: isoForOffset(2),
        monthlyPlan: 250,
        status: 'completed',
        priority: 'medium',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'goal-course',
        name: 'Curso avan\u00e7ado',
        description: 'Miss\u00e3o guardada para rever depois.',
        targetAmount: 1800,
        status: 'archived',
        priority: 'low',
        createdAt: now,
        updatedAt: now,
      },
    ],
    goalContributions: [
      {
        id: 'contribution-pc-1',
        goalId: 'goal-pc',
        amount: 1000,
        date: isoForOffset(0, 1),
        note: 'Reserva inicial',
        createdAt: now,
      },
      {
        id: 'contribution-pc-2',
        goalId: 'goal-pc',
        amount: 500,
        date: isoForOffset(0, 10),
        note: 'Aporte extra',
        createdAt: now,
      },
      {
        id: 'contribution-pc-3',
        goalId: 'goal-pc',
        amount: -200,
        date: isoForOffset(0, 20),
        note: 'Ajuste da reserva',
        createdAt: now,
      },
      {
        id: 'contribution-setup-1',
        goalId: 'goal-setup',
        amount: 1100,
        date: isoForOffset(0, 5),
        note: 'Reserva completa com excedente',
        createdAt: now,
      },
    ],
  }

  await page.evaluate(({ storesToClear, data }) => new Promise((resolve, reject) => {
    const request = indexedDB.open('coinquest-db')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(storesToClear, 'readwrite')
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => {
        database.close()
        resolve(null)
      }

      for (const storeName of storesToClear) {
        const store = transaction.objectStore(storeName)
        store.clear()
        for (const record of data[storeName] ?? []) store.put(record)
      }
    }
  }), { storesToClear, data })

  await page.reload()
  await page.locator('.game-canvas canvas').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByTestId('goals-panel').waitFor({ state: 'visible', timeout: 8_000 })
  await page.locator('.pwa-toast .icon-button').click({ timeout: 1500 }).catch(() => {})
}

async function clearMissions(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('coinquest-db')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(['goals', 'goalContributions'], 'readwrite')
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => {
        database.close()
        resolve(null)
      }
      transaction.objectStore('goalContributions').clear()
      transaction.objectStore('goals').clear()
    }
  }))

  await page.reload()
  await page.locator('.game-canvas canvas').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByTestId('goals-panel').waitFor({ state: 'visible', timeout: 8_000 })
}

async function triggerMissionCompletion(page) {
  await page.getByTestId('goals-panel').scrollIntoViewIfNeeded()
  await page.getByTestId('toggle-goal-form').click()
  await page.getByTestId('goal-name-input').fill('Upgrade do setup')
  await page.getByTestId('goal-target-input').fill('1000')
  await page.getByTestId('save-goal').click()
  const mission = page.getByTestId('goal-card').filter({ hasText: 'Upgrade do setup' })
  await mission.getByTestId('reserve-goal').click()
  await page.getByTestId('goal-contribution-amount').fill('1000')
  await page.getByTestId('save-goal-contribution').click()
  await page.locator('.game-canvas canvas').waitFor({ state: 'visible', timeout: 8_000 })
  await page.waitForTimeout(220)
}

async function screenshot(locator, filename) {
  const path = `${outputDir}/${filename}`
  await locator.screenshot({ path })
  paths.push(path)
}

const browser = await chromium.launch()

const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const desktopPage = await desktop.newPage()
await prepare(desktopPage)
await seedMissions(desktopPage)
await desktopPage.getByTestId('goals-panel').scrollIntoViewIfNeeded()
await screenshot(desktopPage.getByTestId('goals-panel'), 'missions-desktop.png')

await desktopPage.getByTestId('goal-card').filter({ hasText: 'Novo PC' }).getByTestId('open-goal-details').click()
await screenshot(desktopPage.getByTestId('mission-details'), 'mission-details.png')
await screenshot(desktopPage.getByTestId('goal-card').filter({ hasText: 'Setup completo' }), 'mission-completed.png')
await desktop.close()

const worldDesktop = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const worldDesktopPage = await worldDesktop.newPage()
await prepare(worldDesktopPage)
await clearMissions(worldDesktopPage)
await triggerMissionCompletion(worldDesktopPage)
await worldDesktopPage.locator('.game-shell').scrollIntoViewIfNeeded()
await screenshot(worldDesktopPage.locator('.game-shell'), 'mission-world-complete-desktop.png')
await worldDesktop.close()

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mobilePage = await mobile.newPage()
await prepare(mobilePage)
await seedMissions(mobilePage)
await mobilePage.getByTestId('goals-panel').scrollIntoViewIfNeeded()
await screenshot(mobilePage.getByTestId('goals-panel'), 'missions-iphone-390.png')
await mobile.close()

const worldMobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const worldMobilePage = await worldMobile.newPage()
await prepare(worldMobilePage)
await clearMissions(worldMobilePage)
await triggerMissionCompletion(worldMobilePage)
await worldMobilePage.locator('.game-shell').scrollIntoViewIfNeeded()
await screenshot(worldMobilePage.locator('.game-shell'), 'mission-world-complete-iphone-390.png')
await worldMobile.close()

await browser.close()
clearTimeout(timeout)

console.log(paths.join('\n'))

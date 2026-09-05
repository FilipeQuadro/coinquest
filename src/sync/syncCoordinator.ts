import { getCurrentSession, type SyncAuthResult } from './remote/syncAuth'
import { runSync, type SyncRunResult } from './syncOrchestrator'

export type SyncReason = 'manual' | 'session-restored' | 'signed-in' | 'online' | 'foreground'

export const AUTO_SYNC_COOLDOWN_MS = 30_000

export type SyncCoordinatorSkipStatus = 'not-configured' | 'not-authenticated' | 'cooldown-skipped'

export type SyncCoordinatorResult =
  | { ok: true; result: SyncRunResult; shared: boolean }
  | { ok: false; status: SyncCoordinatorSkipStatus }

export interface SyncCoordinatorDependencies {
  runSync?: () => Promise<SyncRunResult>
  getCurrentSession?: () => Promise<SyncAuthResult<unknown>>
  nowMs?: () => number
}

export interface SyncCoordinator {
  requestSync(input: { reason: SyncReason }): Promise<SyncCoordinatorResult>
}

function isAutomaticReason(reason: SyncReason): boolean {
  return reason !== 'manual'
}

function hasAuthenticatedSession(result: SyncAuthResult<unknown>): SyncCoordinatorSkipStatus | null {
  if (!result.ok) return result.error === 'not-configured' ? 'not-configured' : 'not-authenticated'
  return result.data ? null : 'not-authenticated'
}

export function createSyncCoordinator(dependencies: SyncCoordinatorDependencies = {}): SyncCoordinator {
  const executeRunSync = dependencies.runSync ?? (() => runSync())
  const loadSession = dependencies.getCurrentSession ?? getCurrentSession
  const nowMs = dependencies.nowMs ?? (() => Date.now())
  let inFlight: Promise<SyncCoordinatorResult> | null = null
  let lastAutoSyncStartedAt: number | null = null

  return {
    async requestSync({ reason }) {
      if (inFlight) return inFlight.then((result) => (result.ok ? { ...result, shared: true } : result))

      inFlight = (async () => {
        if (isAutomaticReason(reason)) {
          const sessionStatus = hasAuthenticatedSession(await loadSession())
          if (sessionStatus) return { ok: false as const, status: sessionStatus }

          const currentTime = nowMs()
          if (lastAutoSyncStartedAt !== null && currentTime - lastAutoSyncStartedAt < AUTO_SYNC_COOLDOWN_MS) {
            return { ok: false as const, status: 'cooldown-skipped' as const }
          }

          lastAutoSyncStartedAt = currentTime
        }

        const result = await executeRunSync()
        return { ok: true as const, result, shared: false }
      })().finally(() => {
        inFlight = null
      })

      return inFlight
    },
  }
}

export const syncCoordinator = createSyncCoordinator()

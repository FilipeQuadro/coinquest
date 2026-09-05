import { describe, expect, it, vi } from 'vitest'
import {
  AUTO_SYNC_COOLDOWN_MS,
  createSyncCoordinator,
  type SyncCoordinatorResult,
  type SyncReason,
} from './syncCoordinator'
import type { SyncRunResult } from './syncOrchestrator'

const successResult: SyncRunResult = {
  status: 'success',
  pushed: 1,
  pulled: 0,
  remoteDeletes: 0,
  localDeletes: 0,
  converged: 0,
  conflicts: 0,
  errors: [],
}

function authenticatedSession() {
  return { ok: true as const, data: { user: { id: 'user-1' } } }
}

function signedOutSession() {
  return { ok: true as const, data: null }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('sync coordinator', () => {
  it('runs manual sync through runSync without requiring an auth preflight', async () => {
    const runSync = vi.fn(async () => successResult)
    const getCurrentSession = vi.fn(async () => signedOutSession())
    const coordinator = createSyncCoordinator({ runSync, getCurrentSession })

    await expect(coordinator.requestSync({ reason: 'manual' })).resolves.toMatchObject({
      ok: true,
      result: successResult,
    })

    expect(runSync).toHaveBeenCalledTimes(1)
    expect(getCurrentSession).not.toHaveBeenCalled()
  })

  it('runs automatic sync only when an authenticated session exists', async () => {
    const runSync = vi.fn(async () => successResult)
    const coordinator = createSyncCoordinator({
      runSync,
      getCurrentSession: vi.fn(async () => authenticatedSession()),
      nowMs: () => 10,
    })

    await expect(coordinator.requestSync({ reason: 'signed-in' })).resolves.toMatchObject({ ok: true })
    expect(runSync).toHaveBeenCalledTimes(1)
  })

  it('skips automatic sync when cloud is unavailable or no user is authenticated', async () => {
    const runSync = vi.fn(async () => successResult)
    const signedOutCoordinator = createSyncCoordinator({
      runSync,
      getCurrentSession: vi.fn(async () => signedOutSession()),
    })
    const notConfiguredCoordinator = createSyncCoordinator({
      runSync,
      getCurrentSession: vi.fn(async () => ({ ok: false as const, error: 'not-configured' as const })),
    })

    await expect(signedOutCoordinator.requestSync({ reason: 'online' })).resolves.toEqual({
      ok: false,
      status: 'not-authenticated',
    })
    await expect(notConfiguredCoordinator.requestSync({ reason: 'foreground' })).resolves.toEqual({
      ok: false,
      status: 'not-configured',
    })
    expect(runSync).not.toHaveBeenCalled()
  })

  it('uses single-flight so simultaneous requests share one runSync execution', async () => {
    const pending = deferred<SyncRunResult>()
    const runSync = vi.fn(() => pending.promise)
    const coordinator = createSyncCoordinator({ runSync })

    const first = coordinator.requestSync({ reason: 'manual' })
    const second = coordinator.requestSync({ reason: 'manual' })

    expect(runSync).toHaveBeenCalledTimes(1)
    pending.resolve(successResult)

    await expect(first).resolves.toMatchObject({ ok: true, shared: false })
    await expect(second).resolves.toMatchObject({ ok: true, shared: true })
  })

  it('single-flights automatic requests while the auth preflight is pending', async () => {
    const session = deferred<ReturnType<typeof authenticatedSession>>()
    const runSync = vi.fn(async () => successResult)
    const coordinator = createSyncCoordinator({
      runSync,
      getCurrentSession: vi.fn(() => session.promise),
      nowMs: () => 1_000,
    })

    const first = coordinator.requestSync({ reason: 'online' })
    const second = coordinator.requestSync({ reason: 'foreground' })

    session.resolve(authenticatedSession())

    await expect(first).resolves.toMatchObject({ ok: true, shared: false })
    await expect(second).resolves.toMatchObject({ ok: true, shared: true })
    expect(runSync).toHaveBeenCalledTimes(1)
  })

  it('single-flights mixed manual and automatic requests', async () => {
    const pending = deferred<SyncRunResult>()
    const runSync = vi.fn(() => pending.promise)
    const getCurrentSession = vi.fn(async () => authenticatedSession())
    const coordinator = createSyncCoordinator({ runSync, getCurrentSession })

    const first = coordinator.requestSync({ reason: 'manual' })
    const second = coordinator.requestSync({ reason: 'online' })

    expect(runSync).toHaveBeenCalledTimes(1)
    expect(getCurrentSession).not.toHaveBeenCalled()
    pending.resolve(successResult)

    await expect(first).resolves.toMatchObject({ ok: true, shared: false })
    await expect(second).resolves.toMatchObject({ ok: true, shared: true })
  })

  it('applies cooldown to automatic sync while manual sync ignores that cooldown', async () => {
    let time = 1_000
    const runSync = vi.fn(async () => successResult)
    const coordinator = createSyncCoordinator({
      runSync,
      getCurrentSession: vi.fn(async () => authenticatedSession()),
      nowMs: () => time,
    })

    await expect(coordinator.requestSync({ reason: 'online' })).resolves.toMatchObject({ ok: true })
    await expect(coordinator.requestSync({ reason: 'foreground' })).resolves.toEqual({
      ok: false,
      status: 'cooldown-skipped',
    })

    await expect(coordinator.requestSync({ reason: 'manual' })).resolves.toMatchObject({ ok: true })
    time += AUTO_SYNC_COOLDOWN_MS
    await expect(coordinator.requestSync({ reason: 'session-restored' })).resolves.toMatchObject({ ok: true })
    expect(runSync).toHaveBeenCalledTimes(3)
  })

  it('does not start cooldown when automatic sync is skipped before authentication', async () => {
    let session: ReturnType<typeof signedOutSession> | ReturnType<typeof authenticatedSession> = signedOutSession()
    const runSync = vi.fn(async () => successResult)
    const coordinator = createSyncCoordinator({
      runSync,
      getCurrentSession: vi.fn(async () => session),
      nowMs: () => 1_000,
    })

    await expect(coordinator.requestSync({ reason: 'online' })).resolves.toEqual({
      ok: false,
      status: 'not-authenticated',
    })

    session = authenticatedSession()
    await expect(coordinator.requestSync({ reason: 'foreground' })).resolves.toMatchObject({ ok: true })
    expect(runSync).toHaveBeenCalledTimes(1)
  })

  it('allows a later sync after a run finishes and does not stay locked after failure', async () => {
    const runSync = vi
      .fn<() => Promise<SyncRunResult>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(successResult)
    const coordinator = createSyncCoordinator({ runSync })

    await expect(coordinator.requestSync({ reason: 'manual' })).rejects.toThrow('network')
    await expect(coordinator.requestSync({ reason: 'manual' })).resolves.toMatchObject({ ok: true })
    expect(runSync).toHaveBeenCalledTimes(2)
  })

  it('keeps reason in the coordinator and does not pass it to runSync', async () => {
    const reasons: SyncReason[] = ['manual']
    const runSync = vi.fn(async () => successResult)
    const coordinator = createSyncCoordinator({ runSync })

    await coordinator.requestSync({ reason: reasons[0] })

    expect(runSync).toHaveBeenCalledWith()
  })
})

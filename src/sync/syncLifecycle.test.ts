import { describe, expect, it, vi } from 'vitest'
import { createSyncCoordinator } from './syncCoordinator'
import { startSyncLifecycle } from './syncLifecycle'
import type { SyncCoordinator } from './syncCoordinator'
import type { SyncRunResult } from './syncOrchestrator'

type Listener = () => void
type AuthCallback = (event: string, session: unknown) => Promise<void>

function fakeWindowTarget() {
  const listeners = new Map<string, Listener>()
  return {
    target: {
      addEventListener: vi.fn((event: string, listener: Listener) => {
        listeners.set(event, listener)
      }),
      removeEventListener: vi.fn((event: string, listener: Listener) => {
        if (listeners.get(event) === listener) listeners.delete(event)
      }),
    } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>,
    emit(event: string) {
      listeners.get(event)?.()
    },
    listeners,
  }
}

function fakeDocumentTarget(initialVisibility: Document['visibilityState']) {
  const listeners = new Map<string, Listener>()
  const target = {
    visibilityState: initialVisibility,
    addEventListener: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, listener)
    }),
    removeEventListener: vi.fn((event: string, listener: Listener) => {
      if (listeners.get(event) === listener) listeners.delete(event)
    }),
  } as Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>

  return {
    target,
    setVisibility(value: Document['visibilityState']) {
      Object.defineProperty(target, 'visibilityState', { value, configurable: true })
    },
    emit(event: string) {
      listeners.get(event)?.()
    },
    listeners,
  }
}

function fakeCoordinator() {
  return {
    requestSync: vi.fn(async () => ({
      ok: true as const,
      result: {
        status: 'success' as const,
        pushed: 0,
        pulled: 0,
        remoteDeletes: 0,
        localDeletes: 0,
        converged: 0,
        conflicts: 0,
        errors: [],
      },
      shared: false,
    })),
  } satisfies SyncCoordinator
}

const successResult: SyncRunResult = {
  status: 'success',
  pushed: 0,
  pulled: 0,
  remoteDeletes: 0,
  localDeletes: 0,
  converged: 0,
  conflicts: 0,
  errors: [],
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('sync lifecycle', () => {
  it('requests auto sync once when a session is restored on startup', async () => {
    const coordinator = fakeCoordinator()
    const cleanup = startSyncLifecycle({
      coordinator,
      getCurrentSession: vi.fn(async () => ({ ok: true as const, data: { user: { id: 'user-1' } } as never })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) as never,
    })

    await flushMicrotasks()
    cleanup()

    expect(coordinator.requestSync).toHaveBeenCalledWith({ reason: 'session-restored' })
    expect(coordinator.requestSync).toHaveBeenCalledTimes(1)
  })

  it('lets the coordinator absorb StrictMode mount cleanup remount session checks', async () => {
    const runSync = vi.fn(async () => successResult)
    const coordinator = createSyncCoordinator({
      runSync,
      getCurrentSession: vi.fn(async () => ({ ok: true as const, data: { user: { id: 'user-1' } } })),
      nowMs: () => 1_000,
    })
    const options = {
      coordinator,
      getCurrentSession: vi.fn(async () => ({ ok: true as const, data: { user: { id: 'user-1' } } as never })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) as never,
    }

    const firstCleanup = startSyncLifecycle(options)
    await flushMicrotasks()
    firstCleanup()
    const secondCleanup = startSyncLifecycle(options)
    await flushMicrotasks()
    secondCleanup()

    expect(runSync).toHaveBeenCalledTimes(1)
  })

  it('does not run twice when session restoration and SIGNED_IN happen close together', async () => {
    const runSync = vi.fn(async () => successResult)
    const coordinator = createSyncCoordinator({
      runSync,
      getCurrentSession: vi.fn(async () => ({ ok: true as const, data: { user: { id: 'user-1' } } })),
      nowMs: () => 1_000,
    })
    let callback: AuthCallback = async () => undefined
    const cleanup = startSyncLifecycle({
      coordinator,
      getCurrentSession: vi.fn(async () => ({ ok: true as const, data: { user: { id: 'user-1' } } as never })),
      onAuthStateChange: vi.fn((handler: AuthCallback) => {
        callback = handler
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }) as never,
    })

    await flushMicrotasks()
    await callback('SIGNED_IN', { user: { id: 'user-1' } })
    cleanup()

    expect(runSync).toHaveBeenCalledTimes(1)
  })

  it('syncs on SIGNED_IN and ignores SIGNED_OUT and TOKEN_REFRESHED auth events', async () => {
    const coordinator = fakeCoordinator()
    let callback: AuthCallback = async () => undefined
    const cleanup = startSyncLifecycle({
      coordinator,
      getCurrentSession: vi.fn(async () => ({ ok: true as const, data: null })),
      onAuthStateChange: vi.fn((handler: AuthCallback) => {
        callback = handler
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }) as never,
    })
    await flushMicrotasks()

    void callback('SIGNED_OUT', null)
    void callback('TOKEN_REFRESHED', { user: { id: 'user-1' } })
    void callback('SIGNED_IN', { user: { id: 'user-1' } })
    cleanup()

    expect(coordinator.requestSync).toHaveBeenCalledTimes(1)
    expect(coordinator.requestSync).toHaveBeenCalledWith({ reason: 'signed-in' })
  })

  it('syncs on browser online events and visible foreground events only', async () => {
    const coordinator = fakeCoordinator()
    const windowTarget = fakeWindowTarget()
    const documentTarget = fakeDocumentTarget('hidden')
    const cleanup = startSyncLifecycle({
      coordinator,
      windowTarget: windowTarget.target,
      documentTarget: documentTarget.target,
      getCurrentSession: vi.fn(async () => ({ ok: true as const, data: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) as never,
    })
    await flushMicrotasks()

    windowTarget.emit('online')
    documentTarget.emit('visibilitychange')
    documentTarget.setVisibility('visible')
    documentTarget.emit('visibilitychange')
    cleanup()

    expect(coordinator.requestSync).toHaveBeenCalledWith({ reason: 'online' })
    expect(coordinator.requestSync).toHaveBeenCalledWith({ reason: 'foreground' })
    expect(coordinator.requestSync).toHaveBeenCalledTimes(2)
  })

  it('removes event listeners and auth subscription on cleanup', async () => {
    const coordinator = fakeCoordinator()
    const windowTarget = fakeWindowTarget()
    const documentTarget = fakeDocumentTarget('visible')
    const unsubscribe = vi.fn()
    const cleanup = startSyncLifecycle({
      coordinator,
      windowTarget: windowTarget.target,
      documentTarget: documentTarget.target,
      getCurrentSession: vi.fn(async () => ({ ok: true as const, data: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })) as never,
    })
    await flushMicrotasks()

    cleanup()
    windowTarget.emit('online')
    documentTarget.emit('visibilitychange')

    expect(windowTarget.target.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function))
    expect(documentTarget.target.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(coordinator.requestSync).not.toHaveBeenCalled()
  })

  it('swallows automatic sync rejection without creating a retry loop', async () => {
    const coordinator = {
      requestSync: vi.fn(async () => {
        throw new Error('network')
      }),
    } satisfies SyncCoordinator
    const windowTarget = fakeWindowTarget()
    const cleanup = startSyncLifecycle({
      coordinator,
      windowTarget: windowTarget.target,
      getCurrentSession: vi.fn(async () => ({ ok: true as const, data: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) as never,
    })
    await flushMicrotasks()

    windowTarget.emit('online')
    await flushMicrotasks()
    cleanup()

    expect(coordinator.requestSync).toHaveBeenCalledTimes(1)
    expect(coordinator.requestSync).toHaveBeenCalledWith({ reason: 'online' })
  })
})

import { describe, expect, it, vi } from 'vitest'
import { watchServiceWorkerUpdates } from './serviceWorkerUpdates'

function setup(onLine = true) {
  const listeners = new Map<string, () => void>()
  let intervalHandler: (() => void) | undefined
  const env = {
    document: {
      visibilityState: 'hidden' as DocumentVisibilityState,
      addEventListener: vi.fn((type: string, handler: () => void) => listeners.set(type, handler)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    },
    navigator: { onLine },
    setInterval: vi.fn((handler: () => void) => {
      intervalHandler = handler
      return 7
    }),
    clearInterval: vi.fn(),
  }
  const registration = { update: vi.fn(() => Promise.resolve()) }
  const stop = watchServiceWorkerUpdates(registration, env as never, 1000)
  return { env, registration, stop, listeners, tick: () => intervalHandler?.() }
}

describe('watchServiceWorkerUpdates', () => {
  it('checks once as soon as the app starts', () => {
    const { registration } = setup()
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('checks for a new version when the app becomes visible again', () => {
    const { env, registration, listeners } = setup()
    listeners.get('visibilitychange')?.()
    expect(registration.update).toHaveBeenCalledTimes(1)

    env.document.visibilityState = 'visible'
    listeners.get('visibilitychange')?.()
    expect(registration.update).toHaveBeenCalledTimes(2)
  })

  it('checks periodically while open', () => {
    const { env, registration, tick } = setup()
    expect(env.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000)
    tick()
    tick()
    expect(registration.update).toHaveBeenCalledTimes(3)
  })

  it('skips checks while offline so the local-first app keeps working', () => {
    const { registration, tick } = setup(false)
    tick()
    expect(registration.update).not.toHaveBeenCalled()
  })

  it('removes listeners and the timer on cleanup', () => {
    const { env, stop, listeners } = setup()
    stop()
    expect(listeners.has('visibilitychange')).toBe(false)
    expect(env.clearInterval).toHaveBeenCalledWith(7)
  })
})

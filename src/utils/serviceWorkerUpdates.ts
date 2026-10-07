export const SERVICE_WORKER_UPDATE_INTERVAL_MS = 60 * 60 * 1000

interface UpdatableRegistration {
  update: () => Promise<unknown>
}

interface UpdateEnvironment {
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>
  navigator: Pick<Navigator, 'onLine'>
  setInterval: (handler: () => void, timeout: number) => unknown
  clearInterval: (id: never) => void
}

/**
 * Installed PWAs often reopen without the browser checking for a new service worker, and resumed
 * ones never navigate. Check once on start, whenever the app becomes visible again and hourly.
 */
export function watchServiceWorkerUpdates(
  registration: UpdatableRegistration,
  env: UpdateEnvironment = { document, navigator, setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window) },
  intervalMs = SERVICE_WORKER_UPDATE_INTERVAL_MS,
) {
  const check = () => {
    if (!env.navigator.onLine) return
    registration.update().catch(() => undefined)
  }
  const onVisibilityChange = () => {
    if (env.document.visibilityState === 'visible') check()
  }

  check()
  env.document.addEventListener('visibilitychange', onVisibilityChange)
  const timer = env.setInterval(check, intervalMs)

  return () => {
    env.document.removeEventListener('visibilitychange', onVisibilityChange)
    env.clearInterval(timer as never)
  }
}

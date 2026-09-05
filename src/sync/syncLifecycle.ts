import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { getCurrentSession, onAuthStateChange, type SyncAuthResult } from './remote/syncAuth'
import { syncCoordinator, type SyncCoordinator, type SyncReason } from './syncCoordinator'

type AuthSubscription = ReturnType<typeof onAuthStateChange>
type AuthStateChangeCallback = (event: AuthChangeEvent, session: Session | null) => Promise<void>
type AuthStateChangeSubscriber = (callback: AuthStateChangeCallback) => AuthSubscription

export interface SyncLifecycleEnvironment {
  coordinator?: SyncCoordinator
  getCurrentSession?: () => Promise<SyncAuthResult<Session | null>>
  onAuthStateChange?: AuthStateChangeSubscriber
  windowTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>
  documentTarget?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
}

function requestAutoSync(coordinator: SyncCoordinator, reason: SyncReason) {
  void coordinator.requestSync({ reason }).catch(() => undefined)
}

export function startSyncLifecycle(environment: SyncLifecycleEnvironment = {}): () => void {
  const coordinator = environment.coordinator ?? syncCoordinator
  const loadSession = environment.getCurrentSession ?? getCurrentSession
  const subscribeAuth: AuthStateChangeSubscriber = environment.onAuthStateChange ?? onAuthStateChange
  const windowTarget = environment.windowTarget ?? (typeof window === 'undefined' ? null : window)
  const documentTarget = environment.documentTarget ?? (typeof document === 'undefined' ? null : document)
  let stopped = false
  let initialSessionChecked = false

  void loadSession().then((result) => {
    if (stopped || initialSessionChecked) return
    initialSessionChecked = true
    if (result.ok && result.data) requestAutoSync(coordinator, 'session-restored')
  })

  const subscription: AuthSubscription = subscribeAuth(async (event: AuthChangeEvent, session: Session | null) => {
    if (stopped) return
    if (event === 'SIGNED_IN' && session) requestAutoSync(coordinator, 'signed-in')
  })

  const handleOnline = () => {
    if (!stopped) requestAutoSync(coordinator, 'online')
  }
  const handleVisibilityChange = () => {
    if (!stopped && documentTarget?.visibilityState === 'visible') {
      requestAutoSync(coordinator, 'foreground')
    }
  }

  windowTarget?.addEventListener('online', handleOnline)
  documentTarget?.addEventListener('visibilitychange', handleVisibilityChange)

  return () => {
    stopped = true
    windowTarget?.removeEventListener('online', handleOnline)
    documentTarget?.removeEventListener('visibilitychange', handleVisibilityChange)
    subscription?.data.subscription.unsubscribe()
  }
}

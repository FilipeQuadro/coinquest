import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { SyncConflictsPanel, pendingConflictCountLabel } from './SyncConflictsPanel'
import { syncCoordinator } from '../sync/syncCoordinator'
import type { SyncRunResult, SyncRunStatus } from '../sync/syncOrchestrator'
import type { AuthChangeEvent } from '@supabase/supabase-js'
import {
  getCurrentSession,
  onAuthStateChange,
  requestPasswordReset,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  updatePassword,
} from '../sync/remote/syncAuth'

type AuthViewState = 'checking' | 'signed-out' | 'signed-in' | 'password-recovery' | 'not-configured'

interface AuthSessionSummary {
  email: string
}

export function syncStatusMessage(status: SyncRunStatus): string {
  switch (status) {
    case 'success':
      return 'Sincronização concluída.'
    case 'partial':
      return 'Sincronização parcial. Algumas alterações não puderam ser sincronizadas.'
    case 'not-configured':
      return 'Sincronização em nuvem não configurada.'
    case 'not-authenticated':
      return 'Entre na sua conta para sincronizar.'
    case 'failed':
      return 'Não foi possível concluir a sincronização.'
    default: {
      const exhaustive: never = status
      return exhaustive
    }
  }
}

export function sanitizeAuthError(error: 'not-configured' | 'auth-error'): string {
  if (error === 'not-configured') return 'Sincronização em nuvem não configurada.'
  return 'Não foi possível concluir a autenticação.'
}

export function formatLastSync(value?: string): string {
  if (!value) return 'Nunca sincronizado.'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function connectionStatusLabel(isOnline: boolean): string {
  return isOnline ? 'Dispositivo online' : 'Dispositivo offline'
}

export const SYNC_PASSWORD_MIN_LENGTH = 6

export function passwordResetRedirectTo(locationLike: Pick<Location, 'origin' | 'pathname'>): string {
  return `${locationLike.origin}${locationLike.pathname}`
}

export function isPasswordRecoveryLocation(locationLike: Pick<Location, 'hash' | 'search'>): boolean {
  const candidates = [locationLike.search, locationLike.hash.replace(/^#/, '?')]
  return candidates.some((value) => {
    if (!value) return false
    return new URLSearchParams(value).get('type') === 'recovery'
  })
}

export function validatePasswordResetRequest(emailValue: string): string | null {
  if (!emailValue.trim()) return 'Informe seu e-mail.'
  return null
}

export function validateNewPassword(passwordValue: string, confirmPasswordValue: string): string | null {
  if (!passwordValue || !confirmPasswordValue) return 'Informe a nova senha e a confirmação.'
  if (passwordValue.length < SYNC_PASSWORD_MIN_LENGTH) {
    return `A nova senha precisa ter pelo menos ${SYNC_PASSWORD_MIN_LENGTH} caracteres.`
  }
  if (passwordValue !== confirmPasswordValue) return 'As senhas não conferem.'
  return null
}

function sessionEmail(session: unknown): string {
  const maybeSession = session as { user?: { email?: string } } | null | undefined
  return maybeSession?.user?.email ?? ''
}

export function authStateFromSession(
  session: unknown,
  locationLike?: Pick<Location, 'hash' | 'search'> | null,
): {
  authState: AuthViewState
  sessionSummary: AuthSessionSummary | null
} {
  const currentEmail = sessionEmail(session)
  if (currentEmail && locationLike && isPasswordRecoveryLocation(locationLike)) {
    return { authState: 'password-recovery', sessionSummary: { email: currentEmail } }
  }
  if (currentEmail) return { authState: 'signed-in', sessionSummary: { email: currentEmail } }
  return { authState: 'signed-out', sessionSummary: null }
}

export function authStateFromAuthEvent(
  event: AuthChangeEvent,
  session: unknown,
  current?: { authState: AuthViewState; sessionSummary: AuthSessionSummary | null },
): {
  authState: AuthViewState
  sessionSummary: AuthSessionSummary | null
} {
  const currentEmail = sessionEmail(session)
  if (event === 'PASSWORD_RECOVERY') {
    return {
      authState: 'password-recovery',
      sessionSummary: currentEmail ? { email: currentEmail } : current?.sessionSummary ?? null,
    }
  }
  if (current?.authState === 'password-recovery' && event !== 'SIGNED_OUT') {
    return {
      authState: 'password-recovery',
      sessionSummary: currentEmail ? { email: currentEmail } : current.sessionSummary,
    }
  }
  if (currentEmail) return { authState: 'signed-in', sessionSummary: { email: currentEmail } }
  return { authState: 'signed-out', sessionSummary: null }
}

export function shouldShowPasswordRecoveryForm(authState: AuthViewState): boolean {
  return authState === 'password-recovery'
}

export function shouldShowAuthenticatedSyncControls(authState: AuthViewState): boolean {
  return authState === 'signed-in'
}

export function passwordRecoverySuccessTransition() {
  return {
    authState: 'signed-in' as const,
    password: '',
    newPassword: '',
    confirmNewPassword: '',
    message: 'Senha atualizada. Sua conta continua conectada.',
  }
}

function resultHasChanges(result: SyncRunResult): boolean {
  return Boolean(
    result.pushed
    || result.pulled
    || result.remoteDeletes
    || result.localDeletes
    || result.converged
    || result.conflicts,
  )
}

export function SyncPanel() {
  const [authState, setAuthState] = useState<AuthViewState>('checking')
  const [sessionSummary, setSessionSummary] = useState<AuthSessionSummary | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [lastResult, setLastResult] = useState<SyncRunResult | null>(null)
  const passwordRecoveryActiveRef = useRef(false)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const syncState = useLiveQuery(() => db.syncState.get('default'), [], undefined)
  const pendingConflictCount = useLiveQuery(
    () => db.syncConflicts.where('status').equals('pending').count(),
    [],
    0,
  )

  useEffect(() => {
    let active = true

    async function loadSession() {
      const result = await getCurrentSession()
      if (!active) return

      if (!result.ok) {
        setAuthState(result.error === 'not-configured' ? 'not-configured' : 'signed-out')
        return
      }

      const nextAuthState = authStateFromSession(
        result.data,
        typeof window === 'undefined' ? null : window.location,
      )
      passwordRecoveryActiveRef.current = nextAuthState.authState === 'password-recovery'
      setSessionSummary(nextAuthState.sessionSummary)
      setAuthState(nextAuthState.authState)
      if (nextAuthState.authState === 'password-recovery') {
        setMessage('Informe uma nova senha para concluir a recuperação.')
      }
    }

    void loadSession()

    const subscription = onAuthStateChange(async (event, session) => {
      const nextAuthState = authStateFromAuthEvent(event, session, {
        authState: passwordRecoveryActiveRef.current ? 'password-recovery' : authState,
        sessionSummary,
      })
      passwordRecoveryActiveRef.current = nextAuthState.authState === 'password-recovery'
      setSessionSummary(nextAuthState.sessionSummary)
      setAuthState(nextAuthState.authState)
      if (event === 'PASSWORD_RECOVERY') {
        setPassword('')
        setNewPassword('')
        setConfirmNewPassword('')
        setMessage('Informe uma nova senha para concluir a recuperação.')
        setError('')
      }
    })

    return () => {
      active = false
      subscription?.data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const updateConnectionState = () => {
      setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    }

    window.addEventListener('online', updateConnectionState)
    window.addEventListener('offline', updateConnectionState)
    return () => {
      window.removeEventListener('online', updateConnectionState)
      window.removeEventListener('offline', updateConnectionState)
    }
  }, [])

  async function submitAuth(mode: 'signin' | 'signup') {
    if (authBusy) return

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError('Informe seu e-mail.')
      return
    }
    if (!password) {
      setError('Informe sua senha.')
      return
    }

    setAuthBusy(true)
    setMessage('')
    setError('')

    try {
      const result = mode === 'signin'
        ? await signInWithEmail(trimmedEmail, password)
        : await signUpWithEmail(trimmedEmail, password)

      if (result.ok === false) {
        setError(sanitizeAuthError(result.error))
        return
      }

      const currentEmail = sessionEmail(result.data.session)
      passwordRecoveryActiveRef.current = false
      setPassword('')
      setNewPassword('')
      setConfirmNewPassword('')

      if (currentEmail) {
        setSessionSummary({ email: currentEmail })
        setAuthState('signed-in')
        setMessage(mode === 'signin' ? 'Entrada realizada.' : 'Conta criada e conectada.')
        return
      }

      if (mode === 'signup') {
        setMessage('Conta criada. Confirme seu e-mail para entrar.')
        setAuthState('signed-out')
        return
      }

      setMessage('Entrada realizada.')
    } catch {
      setError('Não foi possível concluir a autenticação.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>, mode: 'signin' | 'signup') {
    event.preventDefault()
    await submitAuth(mode)
  }

  async function handleForgotPassword() {
    if (authBusy) return

    const trimmedEmail = email.trim()
    const validationError = validatePasswordResetRequest(trimmedEmail)
    if (validationError) {
      setError(validationError)
      return
    }

    setAuthBusy(true)
    setMessage('')
    setError('')

    try {
      const result = await requestPasswordReset(trimmedEmail, passwordResetRedirectTo(window.location))
      if (result.ok === false) {
        setError(sanitizeAuthError(result.error))
        return
      }

      setPassword('')
      setMessage('Enviamos um link de recuperação para seu e-mail.')
    } catch {
      setError('Não foi possível enviar o link de recuperação.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handlePasswordRecoverySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (authBusy) return

    const validationError = validateNewPassword(newPassword, confirmNewPassword)
    if (validationError) {
      setError(validationError)
      return
    }

    setAuthBusy(true)
    setMessage('')
    setError('')

    try {
      const result = await updatePassword(newPassword)
      if (result.ok === false) {
        setError(sanitizeAuthError(result.error))
        return
      }

      const transition = passwordRecoverySuccessTransition()
      passwordRecoveryActiveRef.current = false
      setNewPassword(transition.newPassword)
      setConfirmNewPassword(transition.confirmNewPassword)
      setPassword(transition.password)
      setAuthState(transition.authState)
      setMessage(transition.message)
    } catch {
      setError('Não foi possível atualizar a senha.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleLogout() {
    if (authBusy) return
    setAuthBusy(true)
    setMessage('')
    setError('')

    try {
      const result = await signOut()
      if (result.ok === false) {
        setError(sanitizeAuthError(result.error))
        return
      }

      setSessionSummary(null)
      passwordRecoveryActiveRef.current = false
      setAuthState('signed-out')
      setNewPassword('')
      setConfirmNewPassword('')
      setPassword('')
      setMessage('Você saiu da conta de sincronização.')
    } catch {
      setError('Não foi possível sair da conta.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleManualSync() {
    if (syncBusy) return

    if (!isOnline) {
      setMessage('')
      setError('Dispositivo offline. Seus dados continuam salvos localmente; sincronize quando voltar a ficar online.')
      return
    }

    setSyncBusy(true)
    setMessage('Sincronizando...')
    setError('')

    try {
      const coordinatorResult = await syncCoordinator.requestSync({ reason: 'manual' })
      if (!coordinatorResult.ok) {
        setMessage('')
        setError(coordinatorResult.status === 'not-configured'
          ? syncStatusMessage('not-configured')
          : 'Sincronização em andamento ou temporariamente adiada.')
        return
      }

      setLastResult(coordinatorResult.result)
      setMessage(syncStatusMessage(coordinatorResult.result.status))
    } catch {
      setError('Não foi possível concluir a sincronização.')
    } finally {
      setSyncBusy(false)
    }
  }

  return (
    <section className="panel sync-panel" data-testid="sync-panel" aria-labelledby="sync-title">
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">NUVEM OPCIONAL</span>
          <h2 id="sync-title">Sincronização</h2>
          <p className="muted">Conecte sua conta para sincronizar manualmente este dispositivo com a nuvem.</p>
          <span className={`connection-chip ${isOnline ? 'online' : 'offline'}`}>
            {connectionStatusLabel(isOnline)}
          </span>
        </div>
        <span className={`sync-state-chip ${authState}`}>
          {authState === 'signed-in'
            ? 'Conectado'
            : authState === 'password-recovery'
              ? 'Recuperação'
              : authState === 'checking' ? 'Verificando' : 'Offline local'}
        </span>
      </div>

      {authState === 'not-configured' && (
        <div className="sync-box" data-testid="sync-not-configured">
          <strong>Sincronização em nuvem não configurada.</strong>
          <p>O CoinQuest continua funcionando localmente neste dispositivo.</p>
        </div>
      )}

      {authState === 'checking' && <p className="muted">Verificando sessão...</p>}

      {authState === 'signed-out' && (
        <form className="sync-auth-form" onSubmit={(event) => handleAuthSubmit(event, 'signin')} data-testid="sync-auth-form">
          <label>
            E-mail
            <input
              data-testid="sync-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Senha
            <input
              data-testid="sync-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <div className="goal-form-actions">
            <button className="button primary" type="submit" disabled={authBusy}>
              {authBusy ? 'Entrando...' : 'Entrar'}
            </button>
            <button className="button ghost" type="button" onClick={() => void submitAuth('signup')} disabled={authBusy}>
              {authBusy ? 'Criando...' : 'Criar conta'}
            </button>
            <button className="button ghost" type="button" onClick={() => void handleForgotPassword()} disabled={authBusy}>
              Esqueci minha senha
            </button>
          </div>
          <p className="sync-auth-note">
            Essa senha será necessária para entrar novamente. O CoinQuest não consegue recuperá-la se você esquecer.
          </p>
        </form>
      )}

      {shouldShowPasswordRecoveryForm(authState) && (
        <form
          className="sync-auth-form password-recovery-form"
          onSubmit={handlePasswordRecoverySubmit}
          data-testid="sync-password-recovery-form"
        >
          <div className="span-2">
            <strong>Redefinir senha</strong>
            <p className="muted">Crie uma nova senha para {sessionSummary?.email || 'sua conta'}.</p>
          </div>
          <label>
            Nova senha
            <input
              data-testid="sync-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Confirmar nova senha
            <input
              data-testid="sync-confirm-new-password"
              type="password"
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <div className="goal-form-actions">
            <button className="button primary" type="submit" disabled={authBusy}>
              {authBusy ? 'Atualizando...' : 'Atualizar senha'}
            </button>
          </div>
        </form>
      )}

      {shouldShowAuthenticatedSyncControls(authState) && (
        <div className="sync-box" data-testid="sync-authenticated">
          <div>
            <span>Conta conectada</span>
            <strong>{sessionSummary?.email}</strong>
          </div>
          <div>
            <span>Última sincronização</span>
            <strong>{formatLastSync(syncState?.lastSuccessfulSyncAt)}</strong>
          </div>
          {pendingConflictCount > 0 && (
            <div>
              <span>Conflitos</span>
              <strong>{pendingConflictCountLabel(pendingConflictCount)}</strong>
            </div>
          )}
          <div className="sync-actions">
            <button className="button primary" type="button" onClick={handleManualSync} disabled={syncBusy}>
              {syncBusy ? 'Sincronizando...' : 'Sincronizar agora'}
            </button>
            <button className="button ghost" type="button" onClick={handleLogout} disabled={authBusy || syncBusy}>
              Sair
            </button>
          </div>
        </div>
      )}

      {lastResult && (
        <div className="sync-result" data-testid="sync-result">
          <strong>{syncStatusMessage(lastResult.status)}</strong>
          {resultHasChanges(lastResult) ? (
            <div className="sync-result-grid">
              <span>Enviados <strong>{lastResult.pushed}</strong></span>
              <span>Recebidos <strong>{lastResult.pulled}</strong></span>
              <span>Deletes remotos <strong>{lastResult.remoteDeletes}</strong></span>
              <span>Deletes locais <strong>{lastResult.localDeletes}</strong></span>
              <span>Convergidos <strong>{lastResult.converged}</strong></span>
              <span>Conflitos <strong>{lastResult.conflicts}</strong></span>
            </div>
          ) : (
            <p>Nenhuma alteração sincronizada neste ciclo.</p>
          )}
          {lastResult.conflicts > 0 && (
            <p className="sync-warning" role="status">
              {lastResult.conflicts} conflito(s) encontrado(s). Seus dados não foram sobrescritos.
            </p>
          )}
        </div>
      )}

      {message && <p className="success-text" data-testid="sync-message">{message}</p>}
      {error && <p className="form-error" role="alert" data-testid="sync-error">{error}</p>}
      <SyncConflictsPanel />
    </section>
  )
}

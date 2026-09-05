import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { runSync, type SyncRunResult, type SyncRunStatus } from '../sync/syncOrchestrator'
import {
  getCurrentSession,
  onAuthStateChange,
  signInWithEmail,
  signOut,
  signUpWithEmail,
} from '../sync/remote/syncAuth'

type AuthViewState = 'checking' | 'signed-out' | 'signed-in' | 'not-configured'

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

function sessionEmail(session: unknown): string {
  const maybeSession = session as { user?: { email?: string } } | null | undefined
  return maybeSession?.user?.email ?? ''
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
  const [authBusy, setAuthBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [lastResult, setLastResult] = useState<SyncRunResult | null>(null)
  const syncRunningRef = useRef(false)
  const syncState = useLiveQuery(() => db.syncState.get('default'), [], undefined)

  useEffect(() => {
    let active = true

    async function loadSession() {
      const result = await getCurrentSession()
      if (!active) return

      if (!result.ok) {
        setAuthState(result.error === 'not-configured' ? 'not-configured' : 'signed-out')
        return
      }

      const currentEmail = sessionEmail(result.data)
      if (currentEmail) {
        setSessionSummary({ email: currentEmail })
        setAuthState('signed-in')
      } else {
        setSessionSummary(null)
        setAuthState('signed-out')
      }
    }

    void loadSession()

    const subscription = onAuthStateChange(async (_event, session) => {
      const currentEmail = sessionEmail(session)
      if (currentEmail) {
        setSessionSummary({ email: currentEmail })
        setAuthState('signed-in')
        return
      }

      setSessionSummary(null)
      setAuthState('signed-out')
    })

    return () => {
      active = false
      subscription?.data.subscription.unsubscribe()
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
      setPassword('')

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
      setAuthState('signed-out')
      setPassword('')
      setMessage('Você saiu da conta de sincronização.')
    } catch {
      setError('Não foi possível sair da conta.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleManualSync() {
    if (syncRunningRef.current) return

    syncRunningRef.current = true
    setSyncBusy(true)
    setMessage('Sincronizando...')
    setError('')

    try {
      const result = await runSync()
      setLastResult(result)
      setMessage(syncStatusMessage(result.status))
    } catch {
      setError('Não foi possível concluir a sincronização.')
    } finally {
      syncRunningRef.current = false
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
        </div>
        <span className={`sync-state-chip ${authState}`}>
          {authState === 'signed-in' ? 'Conectado' : authState === 'checking' ? 'Verificando' : 'Offline local'}
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
          </div>
        </form>
      )}

      {authState === 'signed-in' && (
        <div className="sync-box" data-testid="sync-authenticated">
          <div>
            <span>Conta conectada</span>
            <strong>{sessionSummary?.email}</strong>
          </div>
          <div>
            <span>Última sincronização</span>
            <strong>{formatLastSync(syncState?.lastSuccessfulSyncAt)}</strong>
          </div>
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
    </section>
  )
}

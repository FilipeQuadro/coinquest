import { describe, expect, it } from 'vitest'
import {
  authStateFromAuthEvent,
  authStateFromSession,
  connectionStatusLabel,
  formatLastSync,
  isPasswordRecoveryLocation,
  passwordRecoverySuccessTransition,
  passwordResetRedirectTo,
  sanitizeAuthError,
  shouldShowAuthenticatedSyncControls,
  shouldShowPasswordRecoveryForm,
  syncStatusMessage,
  validateNewPassword,
  validatePasswordResetRequest,
} from './SyncPanel'

describe('SyncPanel helpers', () => {
  it('maps SyncRunResult statuses to safe user-facing messages', () => {
    expect(syncStatusMessage('success')).toBe('Sincronização concluída.')
    expect(syncStatusMessage('partial')).toBe('Sincronização parcial. Algumas alterações não puderam ser sincronizadas.')
    expect(syncStatusMessage('not-configured')).toBe('Sincronização em nuvem não configurada.')
    expect(syncStatusMessage('not-authenticated')).toBe('Entre na sua conta para sincronizar.')
    expect(syncStatusMessage('failed')).toBe('Não foi possível concluir a sincronização.')
  })

  it('sanitizes auth errors without exposing provider objects', () => {
    expect(sanitizeAuthError('not-configured')).toBe('Sincronização em nuvem não configurada.')
    expect(sanitizeAuthError('auth-error')).toBe('Não foi possível concluir a autenticação.')
  })

  it('formats missing last sync as never synchronized', () => {
    expect(formatLastSync()).toBe('Nunca sincronizado.')
  })

  it('labels browser connectivity without promising server reachability', () => {
    expect(connectionStatusLabel(true)).toBe('Dispositivo online')
    expect(connectionStatusLabel(false)).toBe('Dispositivo offline')
  })

  it('builds password reset redirects from the current app location', () => {
    expect(passwordResetRedirectTo({
      origin: 'https://coinquest.example.com',
      pathname: '/app/',
    } as Location)).toBe('https://coinquest.example.com/app/')
  })

  it('detects password recovery URLs independently of the signed-in session', () => {
    expect(isPasswordRecoveryLocation({ search: '?type=recovery', hash: '' } as Location)).toBe(true)
    expect(isPasswordRecoveryLocation({ search: '', hash: '#access_token=abc&type=recovery' } as Location)).toBe(true)
    expect(isPasswordRecoveryLocation({ search: '?type=signup', hash: '' } as Location)).toBe(false)
  })

  it('uses the recovery form when a session exists on a recovery URL', () => {
    expect(authStateFromSession({
      user: { email: 'user@example.com' },
    }, {
      search: '?type=recovery',
      hash: '',
    } as Location)).toEqual({
      authState: 'password-recovery',
      sessionSummary: { email: 'user@example.com' },
    })
  })

  it('validates password reset request and new password fields', () => {
    expect(validatePasswordResetRequest('')).toBe('Informe seu e-mail.')
    expect(validatePasswordResetRequest('user@example.com')).toBeNull()
    expect(validateNewPassword('', '')).toBe('Informe a nova senha e a confirmação.')
    expect(validateNewPassword('12345', '12345')).toBe('A nova senha precisa ter pelo menos 6 caracteres.')
    expect(validateNewPassword('123456', '654321')).toBe('As senhas não conferem.')
    expect(validateNewPassword('123456', '123456')).toBeNull()
  })

  it('uses PASSWORD_RECOVERY as a password reset state instead of normal sign-in', () => {
    expect(authStateFromAuthEvent('PASSWORD_RECOVERY', {
      user: { email: 'user@example.com' },
    })).toEqual({
      authState: 'password-recovery',
      sessionSummary: { email: 'user@example.com' },
    })
  })

  it('keeps normal SIGNED_IN and SIGNED_OUT auth events unchanged', () => {
    expect(authStateFromAuthEvent('SIGNED_IN', {
      user: { email: 'user@example.com' },
    })).toEqual({
      authState: 'signed-in',
      sessionSummary: { email: 'user@example.com' },
    })
    expect(authStateFromAuthEvent('SIGNED_OUT', null)).toEqual({
      authState: 'signed-out',
      sessionSummary: null,
    })
  })

  it('keeps password recovery active when SIGNED_IN arrives nearby', () => {
    const recovery = authStateFromAuthEvent('PASSWORD_RECOVERY', {
      user: { email: 'user@example.com' },
    })

    expect(authStateFromAuthEvent('SIGNED_IN', {
      user: { email: 'user@example.com' },
    }, recovery)).toEqual({
      authState: 'password-recovery',
      sessionSummary: { email: 'user@example.com' },
    })
  })

  it('prioritizes the recovery form over normal sync controls while a session exists', () => {
    expect(shouldShowPasswordRecoveryForm('password-recovery')).toBe(true)
    expect(shouldShowAuthenticatedSyncControls('password-recovery')).toBe(false)
    expect(shouldShowPasswordRecoveryForm('signed-in')).toBe(false)
    expect(shouldShowAuthenticatedSyncControls('signed-in')).toBe(true)
  })

  it('clears password fields and exits recovery after successful update', () => {
    expect(passwordRecoverySuccessTransition()).toEqual({
      authState: 'signed-in',
      password: '',
      newPassword: '',
      confirmNewPassword: '',
      message: 'Senha atualizada. Sua conta continua conectada.',
    })
  })

  it('keeps recovery copy without mojibake', () => {
    const messages = [
      validateNewPassword('', ''),
      validateNewPassword('123456', '654321'),
      passwordRecoverySuccessTransition().message,
      'Recuperação',
    ]

    for (const message of messages) {
      expect(message).not.toMatch(/\u00c3/)
    }
  })
})

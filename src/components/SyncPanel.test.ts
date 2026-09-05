import { describe, expect, it } from 'vitest'
import { formatLastSync, sanitizeAuthError, syncStatusMessage } from './SyncPanel'

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
})

import { getSupabaseClient } from './supabaseClient'
import type { AuthResponse, Session, UserResponse } from '@supabase/supabase-js'

export type SyncAuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: 'not-configured' | 'auth-error'; cause?: unknown }

function notConfigured<T>(): SyncAuthResult<T> {
  return { ok: false, error: 'not-configured' }
}

export async function signUpWithEmail(email: string, password: string): Promise<SyncAuthResult<AuthResponse['data']>> {
  const client = getSupabaseClient()
  if (!client) return notConfigured()

  const { data, error } = await client.auth.signUp({ email, password })
  if (error) return { ok: false, error: 'auth-error' as const, cause: error }
  return { ok: true as const, data }
}

export async function signInWithEmail(email: string, password: string): Promise<SyncAuthResult<AuthResponse['data']>> {
  const client = getSupabaseClient()
  if (!client) return notConfigured()

  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: 'auth-error' as const, cause: error }
  return { ok: true as const, data }
}

export async function signOut(): Promise<SyncAuthResult<null>> {
  const client = getSupabaseClient()
  if (!client) return notConfigured()

  const { error } = await client.auth.signOut()
  if (error) return { ok: false, error: 'auth-error' as const, cause: error }
  return { ok: true as const, data: null }
}

export async function getCurrentSession(): Promise<SyncAuthResult<Session | null>> {
  const client = getSupabaseClient()
  if (!client) return notConfigured()

  const { data, error } = await client.auth.getSession()
  if (error) return { ok: false, error: 'auth-error' as const, cause: error }
  return { ok: true as const, data: data.session }
}

export async function getCurrentUser(): Promise<SyncAuthResult<UserResponse['data']['user']>> {
  const client = getSupabaseClient()
  if (!client) return notConfigured()

  const { data, error } = await client.auth.getUser()
  if (error) return { ok: false, error: 'auth-error' as const, cause: error }
  return { ok: true as const, data: data.user }
}

export function onAuthStateChange(
  callback: Parameters<NonNullable<ReturnType<typeof getSupabaseClient>>['auth']['onAuthStateChange']>[0],
) {
  const client = getSupabaseClient()
  if (!client) return null

  return client.auth.onAuthStateChange(callback)
}

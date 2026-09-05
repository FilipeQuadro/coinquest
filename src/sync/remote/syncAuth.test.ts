import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSupabaseClientMock } = vi.hoisted(() => ({
  getSupabaseClientMock: vi.fn(),
}))

vi.mock('./supabaseClient', () => ({
  getSupabaseClient: getSupabaseClientMock,
}))

const {
  getCurrentSession,
  onAuthStateChange,
  signInWithEmail,
  signOut,
  signUpWithEmail,
} = await import('./syncAuth')

function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      signUp: vi.fn(async () => ({ data: { session: { user: { email: 'user@example.com' } } }, error: null })),
      signInWithPassword: vi.fn(async () => ({ data: { session: { user: { email: 'user@example.com' } } }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session: { user: { email: 'user@example.com' } } }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      ...overrides,
    },
  }
}

describe('sync auth service', () => {
  beforeEach(() => {
    getSupabaseClientMock.mockReset()
  })

  it('returns not-configured without a Supabase client', async () => {
    getSupabaseClientMock.mockReturnValue(null)

    await expect(getCurrentSession()).resolves.toEqual({ ok: false, error: 'not-configured' })
    await expect(signInWithEmail('user@example.com', 'secret')).resolves.toEqual({ ok: false, error: 'not-configured' })
  })

  it('signs up with a session when confirmation is not required', async () => {
    const client = fakeClient()
    getSupabaseClientMock.mockReturnValue(client)

    const result = await signUpWithEmail('user@example.com', 'secret')

    expect(result).toEqual({ ok: true, data: { session: { user: { email: 'user@example.com' } } } })
    expect(client.auth.signUp).toHaveBeenCalledWith({ email: 'user@example.com', password: 'secret' })
  })

  it('allows signup without session for email confirmation flow', async () => {
    const client = fakeClient({
      signUp: vi.fn(async () => ({ data: { session: null, user: { email: 'user@example.com' } }, error: null })),
    })
    getSupabaseClientMock.mockReturnValue(client)

    await expect(signUpWithEmail('user@example.com', 'secret')).resolves.toEqual({
      ok: true,
      data: { session: null, user: { email: 'user@example.com' } },
    })
  })

  it('signs in and signs out through the existing Supabase client', async () => {
    const client = fakeClient()
    getSupabaseClientMock.mockReturnValue(client)

    await expect(signInWithEmail('user@example.com', 'secret')).resolves.toMatchObject({ ok: true })
    await expect(signOut()).resolves.toEqual({ ok: true, data: null })
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'user@example.com', password: 'secret' })
    expect(client.auth.signOut).toHaveBeenCalled()
  })

  it('subscribes to auth state changes and returns null when cloud is unavailable', () => {
    const client = fakeClient()
    getSupabaseClientMock.mockReturnValue(client)

    const callback = vi.fn()
    expect(onAuthStateChange(callback)).toMatchObject({ data: { subscription: expect.any(Object) } })
    expect(client.auth.onAuthStateChange).toHaveBeenCalledWith(callback)

    getSupabaseClientMock.mockReturnValue(null)
    expect(onAuthStateChange(callback)).toBeNull()
  })
})

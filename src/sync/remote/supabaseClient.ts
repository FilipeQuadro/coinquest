import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface SupabaseCloudConfig {
  configured: boolean
  url?: string
  publishableKey?: string
}

let cachedClient: SupabaseClient | null | undefined

export function getSupabaseCloudConfig(): SupabaseCloudConfig {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!url || !publishableKey) return { configured: false }

  return {
    configured: true,
    url,
    publishableKey,
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient

  const config = getSupabaseCloudConfig()
  if (!config.configured) {
    cachedClient = null
    return cachedClient
  }

  if (!config.url || !config.publishableKey) {
    cachedClient = null
    return cachedClient
  }

  cachedClient = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return cachedClient
}

import type { StorageAdapter, StorageAdapterEnvironment } from './types'
import { LocalAdapter } from './local-adapter'
import { SupabaseAdapter } from './supabase-adapter'

function browserEnvironment(): StorageAdapterEnvironment {
  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
}

export async function createStorageAdapter(environment = browserEnvironment()): Promise<StorageAdapter> {
  const hasUrl = Boolean(environment.supabaseUrl)
  const hasAnonKey = Boolean(environment.supabaseAnonKey)
  if (hasUrl !== hasAnonKey) {
    throw new Error('Supabase configuration is incomplete: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must both be set.')
  }
  if (hasUrl && hasAnonKey) return SupabaseAdapter.create(environment.supabaseUrl!, environment.supabaseAnonKey!)
  return LocalAdapter.create()
}

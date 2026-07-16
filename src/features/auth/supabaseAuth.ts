import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const DASHBOARD_AUTH_EMAIL = 'angela@madebyangela.local'
export const isDemoMode = !supabaseUrl || !supabaseAnonKey

export type AuthClient = Pick<SupabaseClient, 'auth'>

let client: AuthClient | null = null

export function getAuthClient(): AuthClient | null {
  if (isDemoMode) return null

  client ??= createClient(supabaseUrl, supabaseAnonKey)
  return client
}

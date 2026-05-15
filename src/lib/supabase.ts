import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables.\n' +
    'Create a .env.local file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.\n' +
    'Find these in your Supabase project Settings → API.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist session in localStorage so users stay logged in
    persistSession: true,
    // Auto-refresh tokens before they expire
    autoRefreshToken: true,
    // Detect session from URL (for magic link callbacks)
    detectSessionInUrl: true,
  },
})

export type { Session as SupabaseSession } from '@supabase/supabase-js'

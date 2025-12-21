import { createClient, Session } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vnhauomvzjucxadrbywg.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseAnonKey && !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('VITE_SUPABASE_ANON_KEY is not set. Please add it to your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})

/**
 * Wait for Supabase session to be hydrated from localStorage.
 * This prevents race conditions where API calls are made before JWT is attached.
 *
 * @returns Session if available, null if timeout or no session
 */
export async function waitForSession(): Promise<Session | null> {
  // Fast path: Check if session is immediately available (from localStorage cache)
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    if (import.meta.env.DEV) {
      console.log('[waitForSession] Session immediately available')
    }
    return session
  }

  // Session not immediately available - wait briefly for auth state
  // This handles the case where localStorage is still being parsed
  if (import.meta.env.DEV) {
    console.log('[waitForSession] Waiting briefly for session...')
  }

  return new Promise((resolve) => {
    const timeout = 500 // 500ms is plenty for localStorage hydration
    let resolved = false

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!resolved && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        resolved = true
        if (import.meta.env.DEV) {
          console.log('[waitForSession] Session loaded via onAuthStateChange')
        }
        subscription.unsubscribe()
        resolve(session)
      }
    })

    // Timeout fallback - no session available
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        if (import.meta.env.DEV) {
          console.log('[waitForSession] No session available after timeout')
        }
        subscription.unsubscribe()
        resolve(null)
      }
    }, timeout)
  })
}

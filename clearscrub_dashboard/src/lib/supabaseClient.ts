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
  // Fast path: Check if session is immediately available
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    console.log('[waitForSession] Session immediately available')
    return session
  }

  console.log('[waitForSession] Waiting for session...')

  // Slow path: Wait for session to load via onAuthStateChange
  return new Promise((resolve) => {
    let resolved = false
    const timeout = 5000 // 5 second timeout

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!resolved && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        resolved = true
        console.log('[waitForSession] Session loaded via onAuthStateChange')
        subscription.unsubscribe()
        resolve(session)
      }
    })

    // Timeout fallback
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true
        console.warn('[waitForSession] Timeout waiting for session')
        subscription.unsubscribe()
        resolve(null)
      }
    }, timeout)

    // Check session periodically in case onAuthStateChange doesn't fire
    const checkInterval = setInterval(async () => {
      if (resolved) {
        clearInterval(checkInterval)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        resolved = true
        clearTimeout(timeoutId)
        clearInterval(checkInterval)
        console.log('[waitForSession] Session found via interval check')
        subscription.unsubscribe()
        resolve(session)
      }
    }, 100)
  })
}

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { User, Session } from '@supabase/supabase-js'
import type { AuthUser } from '../types/auth'

/**
 * Auth context type with org_id support
 */
interface AuthContextType {
  user: AuthUser | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  isAuthenticated: boolean
  refreshOrgId: () => Promise<void>
  /**
   * Indicates if authentication is FULLY ready for API calls.
   *
   * True when:
   * - Session is established AND
   * - org_id has been successfully fetched from profiles table AND
   * - User object is fully hydrated
   *
   * False when:
   * - No session exists
   * - Session exists but org_id fetch is in progress
   * - Session exists but org_id fetch failed
   *
   * Use this flag to prevent race conditions where API calls are made
   * before org_id is available, which would cause RLS policy failures.
   */
  authReady: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Hook to access authentication context
 *
 * @throws {Error} If used outside of AuthProvider
 * @returns {AuthContextType} Authentication state and methods
 *
 * @example
 * ```tsx
 * const { user, loading, signOut } = useAuth()
 *
 * if (loading) return <div>Loading...</div>
 * if (!user) return <div>Please sign in</div>
 *
 * console.log('User org_id:', user.org_id)
 * ```
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

/**
 * Authentication provider component
 *
 * Features:
 * - Fetches org_id from profiles table after authentication
 * - Caches org_id in state to avoid repeated lookups
 * - Refreshes org_id when session changes
 * - Handles edge cases (missing profile, null org_id)
 *
 * @param {ReactNode} children - Child components
 */
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authReady, setAuthReady] = useState(false)

  /**
   * Fetch org_id from profiles table for the given user
   *
   * Architecture notes:
   * - org_id is stored in profiles table, NOT in JWT
   * - Profile is created via database trigger on user signup
   * - RLS policies use: WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
   *
   * @param {User} supabaseUser - Supabase user object from auth.getSession()
   * @returns {Promise<AuthUser>} User object with org_id included
   */
  const fetchUserWithOrgId = async (supabaseUser: User): Promise<AuthUser> => {
    if (import.meta.env.DEV) {
      console.log('[useAuth] Fetching org_id for user:', supabaseUser.id)
    }

    // Query profiles table to get org_id
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', supabaseUser.id)
      .single()

    if (error) {
      console.error('[useAuth] Failed to fetch profile:', error)
      // Return user without org_id if profile fetch fails
      return {
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        org_id: null
      }
    }

    if (!profile?.org_id) {
      console.warn('[useAuth] User profile exists but org_id is NULL:', supabaseUser.id)
    }

    if (import.meta.env.DEV) {
      console.log('[useAuth] User authenticated with org_id:', profile?.org_id)
    }

    return {
      id: supabaseUser.id,
      email: supabaseUser.email || '',
      org_id: profile?.org_id || null
    }
  }

  /**
   * Manually refresh org_id from database
   *
   * Use case: After user updates their profile or changes organizations
   */
  const refreshOrgId = async (): Promise<void> => {
    if (!session?.user) {
      console.warn('[useAuth] Cannot refresh org_id: No active session')
      return
    }

    try {
      const updatedUser = await fetchUserWithOrgId(session.user)
      setUser(updatedUser)
    } catch (error) {
      console.error('[useAuth] Failed to refresh org_id:', error)
    }
  }

  /**
   * Initialize auth state on mount
   *
   * Fetches:
   * 1. Current session from Supabase Auth
   * 2. org_id from profiles table
   *
   * Then sets up listener for auth state changes (login, logout, token refresh)
   */
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)

      if (session?.user) {
        const authUser = await fetchUserWithOrgId(session.user)
        setUser(authUser)

        // Ready once we have a session. org_id may be null for new users.
        setAuthReady(!!session)

        if (import.meta.env.DEV) {
          console.log('[useAuth] authReady:', !!session, '(session loaded, org_id may be null)')
        }
      } else {
        setUser(null)
        setAuthReady(false)

        if (import.meta.env.DEV) {
          console.log('[useAuth] authReady: false (no session)')
        }
      }

      setLoading(false)
    })

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (import.meta.env.DEV) {
        console.log('[useAuth] Auth state changed:', _event)
      }

      setSession(session)

      if (session?.user) {
        // Reset authReady while fetching org_id
        setAuthReady(false)

        // Fetch fresh org_id on auth state change
        const authUser = await fetchUserWithOrgId(session.user)
        setUser(authUser)

        // Ready once we have a session. org_id may be null for new users.
        setAuthReady(!!session)

        if (import.meta.env.DEV) {
          console.log('[useAuth] authReady:', !!session, '(session loaded, org_id may be null)')
        }
      } else {
        setUser(null)
        setAuthReady(false)

        if (import.meta.env.DEV) {
          console.log('[useAuth] authReady: false (session cleared)')
        }
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  /**
   * Sign in with email and password
   *
   * On success:
   * - Updates session state
   * - Fetches org_id from profiles table
   * - Updates user state
   * - Sets authReady to true
   *
   * @param {string} email - User email
   * @param {string} password - User password
   * @throws {Error} If sign in fails (wrong credentials, network error, etc.)
   */
  const signIn = async (email: string, password: string): Promise<void> => {
    setLoading(true)
    setAuthReady(false)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error

      setSession(data.session)

      if (data.user) {
        const authUser = await fetchUserWithOrgId(data.user)
        setUser(authUser)

        // Ready once we have a session. org_id may be null for new users.
        setAuthReady(!!data.session)

        if (import.meta.env.DEV) {
          console.log('[useAuth] authReady:', !!data.session, '(signed in, org_id may be null)')
        }
      }
    } catch (error) {
      throw error
    } finally {
      setLoading(false)
    }
  }

  /**
   * Sign out current user
   *
   * Clears:
   * - Supabase auth session
   * - Local session state
   * - Local user state (including org_id)
   * - authReady flag
   *
   * @throws {Error} If sign out fails (network error, etc.)
   */
  const signOut = async (): Promise<void> => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error

      setSession(null)
      setUser(null)
      setAuthReady(false)

      if (import.meta.env.DEV) {
        console.log('[useAuth] authReady: false (signed out)')
      }
    } catch (error) {
      throw error
    } finally {
      setLoading(false)
    }
  }

  const value: AuthContextType = {
    user,
    session,
    loading,
    signIn,
    signOut,
    isAuthenticated: !!session,
    refreshOrgId,
    authReady
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// Re-export AuthUser type for convenience
export type { AuthUser } from '../types/auth'

export { AuthContext }

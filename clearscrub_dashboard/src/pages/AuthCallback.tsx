import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Skeleton } from '../components/ui/skeleton'

/**
 * AuthCallback Component
 *
 * Handles email verification redirect from Supabase.
 *
 * Flow:
 * 1. User clicks verification link in email
 * 2. Link redirects to /auth/callback with token in URL fragment
 * 3. Supabase client auto-detects token (via detectSessionInUrl: true)
 * 4. This component waits for auth state to settle
 * 5. Redirects to dashboard on success or login on timeout/error
 *
 * Why this works:
 * - supabaseClient.ts has detectSessionInUrl: true
 * - Supabase automatically processes #access_token from URL
 * - useAuth hook provides authReady flag (session + org_id loaded)
 * - No manual token processing needed
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const { authReady, isAuthenticated, loading } = useAuth()
  const [timeoutError, setTimeoutError] = useState(false)

  useEffect(() => {
    console.log('[AuthCallback] Component mounted, waiting for auth state...')
    console.log('[AuthCallback] Current state:', { authReady, isAuthenticated, loading })

    // Set timeout for verification (10 seconds)
    // If auth doesn't settle in this time, redirect to login with error
    const timeoutId = setTimeout(() => {
      if (!authReady) {
        console.error('[AuthCallback] Timeout waiting for auth verification')
        console.error('[AuthCallback] This may indicate an expired or invalid token')
        setTimeoutError(true)
        navigate('/login?error=verification_timeout', { replace: true })
      }
    }, 10000)

    // Success case: auth is fully ready (session + org_id loaded)
    if (authReady && isAuthenticated) {
      console.log('[AuthCallback] Email verified successfully!')
      console.log('[AuthCallback] Redirecting to dashboard...')
      clearTimeout(timeoutId)
      navigate('/companies', { replace: true })
    }

    // Cleanup timeout on unmount
    return () => {
      console.log('[AuthCallback] Cleaning up timeout')
      clearTimeout(timeoutId)
    }
  }, [authReady, isAuthenticated, loading, navigate])

  // If timeout occurred, don't render anything (already redirecting)
  if (timeoutError) {
    return null
  }

  // Show loading state while processing token
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        {/* Loading Spinner using Skeleton */}
        <div className="w-12 h-12 rounded-full mx-auto mb-4">
          <Skeleton className="w-full h-full rounded-full" />
        </div>

        {/* Loading Message */}
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Verifying your email...
        </h2>
        <p className="text-gray-600">
          Please wait while we confirm your account
        </p>

        {/* Debug Info (only in development) */}
        {import.meta.env.DEV && (
          <div className="mt-8 text-xs text-gray-400 space-y-1">
            <div>authReady: {authReady ? 'true' : 'false'}</div>
            <div>isAuthenticated: {isAuthenticated ? 'true' : 'false'}</div>
            <div>loading: {loading ? 'true' : 'false'}</div>
          </div>
        )}
      </div>
    </div>
  )
}

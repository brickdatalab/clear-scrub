/**
 * Example Component: useAuth Hook Usage
 *
 * This file demonstrates proper usage of the enhanced useAuth hook
 * with org_id support. Use as reference when building new components.
 *
 * @see /docs/AUTH_HOOK_ENHANCEMENT.md for full documentation
 */

import React from 'react'
import { useAuth, type AuthUser } from '../hooks/useAuth'
import { hasOrgId } from '../types/auth'

/**
 * Example 1: Basic Usage
 *
 * Shows proper loading states and null checks
 */
export function BasicAuthExample() {
  const { user, loading, signOut } = useAuth()

  // Show loading state while fetching auth data
  if (loading) {
    return <div>Loading authentication...</div>
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <div>Please sign in to continue</div>
  }

  // Handle case where org_id is not set (edge case)
  if (!user.org_id) {
    return (
      <div>
        <p>Organization not set. Please contact support.</p>
        <button onClick={signOut}>Sign Out</button>
      </div>
    )
  }

  // Safe to use user.org_id here
  return (
    <div>
      <h1>Welcome, {user.email}</h1>
      <p>User ID: {user.id}</p>
      <p>Organization ID: {user.org_id}</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  )
}

/**
 * Example 2: Using Type Guard
 *
 * Shows how to use hasOrgId() type guard for stricter typing
 */
export function TypeGuardExample() {
  const { user, loading } = useAuth()

  if (loading) return <div>Loading...</div>
  if (!user) return <div>Not signed in</div>

  // Type guard narrows type to AuthUser & { org_id: string }
  if (!hasOrgId(user)) {
    return <div>Organization not set</div>
  }

  // TypeScript knows user.org_id is string (not null)
  const uppercasedOrgId = user.org_id.toUpperCase()

  return (
    <div>
      <p>Org ID (uppercase): {uppercasedOrgId}</p>
    </div>
  )
}

/**
 * Example 3: Accessing org_id in useEffect
 *
 * Shows proper dependency array usage
 */
export function EffectExample() {
  const { user } = useAuth()
  const [data, setData] = React.useState<string | null>(null)

  React.useEffect(() => {
    // Only fetch when org_id is available
    if (user?.org_id) {
      console.log('Fetching data for org:', user.org_id)

      // Fetch org-specific data
      // Note: RLS automatically filters by org_id
      // No need to add WHERE clause manually
      fetch('/api/data')
        .then(res => res.json())
        .then(setData)
    }
  }, [user?.org_id]) // Re-run when org_id changes

  if (!user?.org_id) {
    return <div>Waiting for organization...</div>
  }

  return (
    <div>
      <h2>Organization Data</h2>
      <p>Org ID: {user.org_id}</p>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}

/**
 * Example 4: Manual Refresh
 *
 * Shows how to manually refresh org_id (rare use case)
 */
export function ManualRefreshExample() {
  const { user, refreshOrgId } = useAuth()
  const [refreshing, setRefreshing] = React.useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshOrgId()
      console.log('org_id refreshed successfully')
    } catch (error) {
      console.error('Failed to refresh org_id:', error)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div>
      <p>Current org_id: {user?.org_id ?? 'Not set'}</p>
      <button onClick={handleRefresh} disabled={refreshing}>
        {refreshing ? 'Refreshing...' : 'Refresh org_id'}
      </button>
    </div>
  )
}

/**
 * Example 5: Conditional Rendering
 *
 * Shows clean pattern for org_id-dependent components
 */
export function ConditionalRenderExample() {
  const { user, loading } = useAuth()

  // Early returns for loading and auth states
  if (loading) return <LoadingState />
  if (!user) return <UnauthenticatedState />
  if (!user.org_id) return <NoOrgState />

  // Component only renders when org_id is guaranteed
  return <OrganizationDashboard orgId={user.org_id} user={user} />
}

// Helper components for Example 5
function LoadingState() {
  return (
    <div className="loading">
      <div className="spinner" />
      <p>Loading...</p>
    </div>
  )
}

function UnauthenticatedState() {
  const { signIn } = useAuth()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    }
  }

  return (
    <div className="login-form">
      <h1>Sign In</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <button type="submit">Sign In</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  )
}

function NoOrgState() {
  const { signOut } = useAuth()

  return (
    <div className="no-org">
      <h1>Organization Not Set</h1>
      <p>Your account is not associated with an organization.</p>
      <p>Please contact support for assistance.</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  )
}

interface OrganizationDashboardProps {
  orgId: string
  user: AuthUser
}

function OrganizationDashboard({ orgId, user }: OrganizationDashboardProps) {
  return (
    <div className="dashboard">
      <h1>Organization Dashboard</h1>
      <p>Signed in as: {user.email}</p>
      <p>Organization ID: {orgId}</p>
      {/* Rest of dashboard content */}
    </div>
  )
}

/**
 * Example 6: Custom Hook Pattern
 *
 * Shows how to create derived hooks that depend on org_id
 */
export function useOrgData() {
  const { user } = useAuth()
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<Error | null>(null)

  React.useEffect(() => {
    if (!user?.org_id) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // Fetch org-specific data
    // RLS automatically filters by org_id
    fetch('/api/org-data')
      .then(res => res.json())
      .then(data => {
        setData(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err)
        setLoading(false)
      })
  }, [user?.org_id])

  return { data, loading, error, orgId: user?.org_id }
}

export function CustomHookExample() {
  const { data, loading, error, orgId } = useOrgData()

  if (loading) return <div>Loading organization data...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!orgId) return <div>No organization set</div>

  return (
    <div>
      <h2>Organization Data</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}

/**
 * Example 7: TypeScript Types
 *
 * Shows proper type annotations for components
 */
interface UserProfileProps {
  // When you need to pass user as prop
  user: AuthUser
}

export function UserProfile({ user }: UserProfileProps) {
  // TypeScript knows user has id, email, org_id
  return (
    <div>
      <dl>
        <dt>User ID</dt>
        <dd>{user.id}</dd>

        <dt>Email</dt>
        <dd>{user.email}</dd>

        <dt>Organization ID</dt>
        <dd>{user.org_id ?? 'Not set'}</dd>
      </dl>
    </div>
  )
}

/**
 * Example 8: Protected Route Pattern
 *
 * Shows how to create protected routes that require org_id
 */
interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth()

  // Show loading while checking auth
  if (loading) {
    return <LoadingState />
  }

  // Redirect to login if not authenticated
  if (!user) {
    // In real app, use router to redirect to /login
    return <UnauthenticatedState />
  }

  // Show error if org_id not set
  if (!user.org_id) {
    return <NoOrgState />
  }

  // User is authenticated with valid org_id
  return <>{children}</>
}

// Usage:
// <ProtectedRoute>
//   <CompanyDashboard />
// </ProtectedRoute>

/**
 * Example 9: Error Boundary Integration
 *
 * Shows how to handle auth errors in error boundary
 */
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class AuthErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log auth errors
    if (error.message.includes('useAuth must be used within an AuthProvider')) {
      console.error('Auth provider not found:', error, errorInfo)
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1>Authentication Error</h1>
          <p>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      )
    }

    return this.props.children
  }
}

// Usage:
// <AuthErrorBoundary>
//   <App />
// </AuthErrorBoundary>

/**
 * Example 10: Testing Helper
 *
 * Shows how to mock useAuth for testing
 */
export const mockAuthUser = (overrides?: Partial<AuthUser>): AuthUser => ({
  id: '12345678-1234-1234-1234-123456789abc',
  email: 'test@example.com',
  org_id: '87654321-4321-4321-4321-cba987654321',
  ...overrides
})

// In tests:
// jest.mock('../hooks/useAuth', () => ({
//   useAuth: () => ({
//     user: mockAuthUser(),
//     loading: false,
//     signIn: jest.fn(),
//     signOut: jest.fn(),
//     isAuthenticated: true,
//     refreshOrgId: jest.fn()
//   })
// }))

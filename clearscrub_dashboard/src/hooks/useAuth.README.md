# useAuth Hook - Quick Reference

## Basic Usage

```tsx
import { useAuth } from './hooks/useAuth'

function MyComponent() {
  const { user, loading } = useAuth()

  if (loading) return <div>Loading...</div>
  if (!user) return <div>Please sign in</div>
  if (!user.org_id) return <div>Organization not set</div>

  return <div>Org: {user.org_id}</div>
}
```

---

## API Reference

### Return Values

```typescript
const {
  user,           // AuthUser | null - User with org_id
  session,        // Session | null - Supabase session
  loading,        // boolean - True while fetching auth
  signIn,         // (email, password) => Promise<void>
  signOut,        // () => Promise<void>
  isAuthenticated,// boolean - True if session exists
  refreshOrgId    // () => Promise<void> - Manual refresh
} = useAuth()
```

### AuthUser Type

```typescript
interface AuthUser {
  id: string          // User UUID
  email: string       // User email
  org_id: string | null  // Organization UUID
}
```

---

## Common Patterns

### Protected Component

```tsx
function ProtectedComponent() {
  const { user, loading } = useAuth()

  if (loading) return <Loading />
  if (!user?.org_id) return <AccessDenied />

  return <SecureContent orgId={user.org_id} />
}
```

### With Type Guard

```tsx
import { hasOrgId } from '../types/auth'

function MyComponent() {
  const { user } = useAuth()

  if (!hasOrgId(user)) return <div>No org</div>

  // TypeScript knows user.org_id is string (not null)
  return <div>{user.org_id.toUpperCase()}</div>
}
```

### In useEffect

```tsx
function DataFetcher() {
  const { user } = useAuth()

  useEffect(() => {
    if (user?.org_id) {
      // Fetch org-specific data
      fetchData(user.org_id)
    }
  }, [user?.org_id]) // Re-run when org_id changes
}
```

### Sign In Form

```tsx
function SignInForm() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await signIn(email, password)
    } catch (error) {
      console.error('Sign in failed:', error)
    }
  }

  return <form onSubmit={handleSubmit}>...</form>
}
```

### Manual Refresh

```tsx
function OrgSwitcher() {
  const { refreshOrgId } = useAuth()

  const switchOrg = async (newOrgId) => {
    // Update org_id in database first
    await updateUserProfile({ org_id: newOrgId })

    // Refresh cached org_id
    await refreshOrgId()
  }
}
```

---

## Important Notes

### org_id NOT in JWT

org_id is stored in the `profiles` table, NOT in the JWT token. The hook automatically fetches it after authentication.

### When org_id is Fetched

- Initial load (if session exists)
- Sign in
- Token refresh (~1 hour)
- Manual `refreshOrgId()` call

### When org_id is NOT Fetched

- Component re-renders (uses cached value)
- Route changes (uses cached value)

### Error Handling

If org_id fetch fails, `user.org_id` will be `null`. Always check before using:

```tsx
if (!user?.org_id) {
  return <div>Organization not set</div>
}
```

---

## Type Safety

### Valid Usage

```tsx
// ✓ OK
const orgId = user?.org_id ?? 'default'

// ✓ OK
if (user?.org_id) {
  console.log(user.org_id)
}

// ✓ OK
if (hasOrgId(user)) {
  const upper = user.org_id.toUpperCase()
}
```

### Invalid Usage

```tsx
// ✗ ERROR: Cannot access property of possibly null
console.log(user.org_id)

// ✗ ERROR: Type 'string | null' not assignable to 'string'
const orgId: string = user?.org_id
```

---

## Troubleshooting

### "Organization not set" error

**Cause:** User profile missing org_id

**Fix:**
1. Check profiles table: `SELECT org_id FROM profiles WHERE id = '<user_id>'`
2. Verify trigger exists: `on_auth_user_created`
3. Manually set org_id if needed

### org_id is stale after update

**Cause:** React state cached old value

**Fix:** Call `refreshOrgId()`

```tsx
await updateProfile({ org_id: newOrgId })
await refreshOrgId()
```

### Console logs not showing

**Cause:** Production mode (logs disabled)

**Fix:** Run app in dev mode:
```bash
npm run dev
```

---

## Performance

- **Query time:** <10ms (indexed lookup)
- **Cache:** React state (no repeated queries)
- **Frequency:** Once per session + token refresh

---

## Breaking Changes from Old Version

### Changed

```tsx
// OLD
const { user } = useAuth()
user.app_metadata // ✓ Available

// NEW
const { user } = useAuth()
user.app_metadata // ✗ Not available (use session.user)
user.org_id       // ✓ Available (NEW!)
```

### Migration

Replace `user.app_metadata` with `session.user.app_metadata`:

```tsx
const { user, session } = useAuth()
const metadata = session?.user.app_metadata
```

---

## See Also

- **Full docs:** `/docs/AUTH_HOOK_ENHANCEMENT.md`
- **Testing guide:** `__tests__/useAuth.test.md`
- **Examples:** `/examples/UseAuthExample.tsx`
- **Types:** `/types/auth.ts`
- **Flow diagram:** `/docs/AUTH_FLOW_DIAGRAM.md`

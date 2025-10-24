# useAuth Hook Testing Guide

## Overview

This document provides testing recommendations for the enhanced `useAuth` hook with org_id support.

## Manual Testing Checklist

### Test 1: Initial Load (No Session)

**Steps:**
1. Clear browser cookies/localStorage
2. Navigate to app
3. Check console logs

**Expected:**
- `loading` should be `true` initially
- After fetch completes, `loading` should be `false`
- `user` should be `null`
- `session` should be `null`
- `isAuthenticated` should be `false`

### Test 2: Sign In Flow

**Steps:**
1. Enter valid credentials
2. Click sign in
3. Check console logs (dev mode only)

**Expected Console Logs:**
```
[useAuth] Fetching org_id for user: <user_uuid>
[useAuth] User authenticated with org_id: <org_uuid>
```

**Expected State:**
- `loading` should transition: `false` → `true` → `false`
- `user` should be populated with `{ id, email, org_id }`
- `session` should be populated with Supabase session
- `isAuthenticated` should be `true`
- `user.org_id` should be a valid UUID string

### Test 3: Verify org_id is Accessible

**Steps:**
1. After sign in, add this to a component:
```tsx
const { user } = useAuth()
console.log('User org_id:', user?.org_id)
```

**Expected:**
- Console should show valid UUID
- TypeScript should allow accessing `user.org_id` (typed as `string | null`)

### Test 4: Token Refresh

**Steps:**
1. Sign in
2. Wait for Supabase token to refresh (default: 1 hour)
3. Check console logs

**Expected Console Logs:**
```
[useAuth] Auth state changed: TOKEN_REFRESHED
[useAuth] Fetching org_id for user: <user_uuid>
[useAuth] User authenticated with org_id: <org_uuid>
```

**Expected State:**
- org_id should remain consistent (not reset to null)
- No user-visible disruption

### Test 5: Sign Out Flow

**Steps:**
1. While signed in, click sign out
2. Check console logs

**Expected:**
- `loading` should transition: `false` → `true` → `false`
- `user` should be `null`
- `session` should be `null`
- `isAuthenticated` should be `false`

### Test 6: Refresh org_id Manually

**Steps:**
1. Sign in
2. Call `refreshOrgId()` from auth context
3. Check console logs

**Expected Console Logs:**
```
[useAuth] Fetching org_id for user: <user_uuid>
[useAuth] User authenticated with org_id: <org_uuid>
```

**Use Case:** After user updates their profile or switches organizations

## Edge Case Testing

### Edge Case 1: Profile Missing org_id

**Scenario:** User profile exists but org_id is NULL (database inconsistency)

**Expected Behavior:**
- Console warning: `[useAuth] User profile exists but org_id is NULL: <user_id>`
- `user.org_id` should be `null`
- App should handle gracefully (show "Organization not set" message)

**How to Test:**
```sql
-- Manually set org_id to NULL in database
UPDATE profiles SET org_id = NULL WHERE id = '<user_id>';
```

### Edge Case 2: Profile Doesn't Exist

**Scenario:** User exists in auth.users but no profile record (trigger failed)

**Expected Behavior:**
- Console error: `[useAuth] Failed to fetch profile: ...`
- `user.org_id` should be `null`
- App should handle gracefully

**How to Test:**
```sql
-- Delete user's profile
DELETE FROM profiles WHERE id = '<user_id>';
```

### Edge Case 3: Network Error During org_id Fetch

**Scenario:** Database is unreachable during fetchUserWithOrgId()

**Expected Behavior:**
- Console error: `[useAuth] Failed to fetch profile: ...`
- `user.org_id` should be `null`
- User can still access app (with limited functionality)

**How to Test:**
- Disconnect from internet after sign in but before org_id fetch
- Use browser DevTools to throttle/block network

## Integration Testing

### Test with Real API Calls

**Component Example:**
```tsx
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabaseClient'

function TestComponent() {
  const { user, loading } = useAuth()
  const [companies, setCompanies] = useState([])

  useEffect(() => {
    if (user?.org_id) {
      // Fetch companies (RLS will filter by org_id automatically)
      supabase
        .from('companies')
        .select('*')
        .then(({ data }) => setCompanies(data || []))
    }
  }, [user?.org_id])

  if (loading) return <div>Loading...</div>
  if (!user) return <div>Please sign in</div>
  if (!user.org_id) return <div>Organization not set</div>

  return (
    <div>
      <h1>User: {user.email}</h1>
      <p>Org ID: {user.org_id}</p>
      <p>Companies: {companies.length}</p>
    </div>
  )
}
```

**Expected:**
- Companies query should return only data for user's org
- RLS policies automatically filter by org_id
- No manual org_id filtering needed in application code

## TypeScript Type Checking

### Test Type Safety

**Valid Usage:**
```tsx
const { user } = useAuth()

// OK: TypeScript knows org_id can be null
if (user?.org_id) {
  console.log('Org:', user.org_id)
}

// OK: Using optional chaining
const orgId = user?.org_id ?? 'no-org'

// OK: Type guard
import { hasOrgId } from '../types/auth'
if (hasOrgId(user)) {
  // TypeScript knows user.org_id is string (not null)
  console.log('Org:', user.org_id.toUpperCase())
}
```

**Invalid Usage (Should Error):**
```tsx
const { user } = useAuth()

// ERROR: Property 'some_field' does not exist on type 'AuthUser'
console.log(user?.some_field)

// ERROR: Cannot access property of possibly null object
console.log(user.org_id) // Should use user?.org_id

// ERROR: Type 'string | null' is not assignable to type 'string'
const orgId: string = user?.org_id // Missing null check
```

## Performance Testing

### Measure org_id Fetch Time

**Steps:**
1. Sign in with fresh session
2. Check Network tab in DevTools
3. Look for POST to `/rest/v1/profiles?select=org_id&id=eq.<user_id>`

**Expected Performance:**
- Query should complete in <100ms (database indexed on id)
- No N+1 query issues (fetched once per auth state change)
- Cached in React state (not refetched on every render)

### Verify Caching Works

**Steps:**
1. Sign in
2. Navigate between pages
3. Check console logs

**Expected:**
- Should only see one "Fetching org_id" log per session
- Subsequent page navigations should NOT refetch
- Only refetches on:
  - Sign in
  - Token refresh
  - Manual `refreshOrgId()` call

## Known Limitations

### Limitation 1: org_id Not in JWT

**Impact:** Extra database query required after authentication

**Why:** Supabase JWT doesn't include custom claims from profiles table

**Workaround:** Cache org_id in React state (current implementation)

**Future Improvement:** Use Supabase Functions to add org_id to JWT payload

### Limitation 2: Race Condition on First Load

**Impact:** Brief moment where user exists but org_id is null

**Why:** Async fetch for org_id happens after session is set

**Workaround:** Components should check `user?.org_id` before rendering

**Example Safe Component:**
```tsx
function SafeComponent() {
  const { user, loading } = useAuth()

  if (loading) return <div>Loading...</div>
  if (!user) return <div>Not signed in</div>
  if (!user.org_id) return <div>Loading organization...</div>

  // Safe to use user.org_id here
  return <div>Org: {user.org_id}</div>
}
```

## Debugging Tips

### Enable Dev Logs

Logs are automatically enabled in development mode:
```tsx
if (import.meta.env.DEV) {
  console.log('[useAuth] ...')
}
```

### Inspect JWT Token

Use browser console:
```javascript
// Get current session
supabase.auth.getSession().then(({ data }) => {
  console.log('JWT:', data.session?.access_token)

  // Decode JWT (without verification - for debugging only)
  const payload = JSON.parse(atob(data.session?.access_token.split('.')[1]))
  console.log('Payload:', payload)

  // Notice: org_id is NOT in payload (must fetch from database)
})
```

### Check Profile Record

Use Supabase SQL Editor:
```sql
-- Verify profile exists with org_id
SELECT id, email, org_id, created_at
FROM profiles
WHERE id = '<user_uuid>';

-- Check organization details
SELECT o.id, o.name, o.subscription_plan
FROM organizations o
JOIN profiles p ON p.org_id = o.id
WHERE p.id = '<user_uuid>';
```

## Migration from Old useAuth

### Breaking Changes

**Before (old implementation):**
```tsx
const { user } = useAuth()
// user was full Supabase User object
console.log(user.id, user.email, user.app_metadata)
```

**After (new implementation):**
```tsx
const { user } = useAuth()
// user is now AuthUser type (subset)
console.log(user.id, user.email, user.org_id)
// app_metadata no longer available
```

### Migration Guide

**Step 1:** Update imports
```tsx
// Old
import { useAuth } from './hooks/useAuth'

// New (with types)
import { useAuth, type AuthUser } from './hooks/useAuth'
```

**Step 2:** Update type annotations
```tsx
// Old
const user: User | null = useAuth().user

// New
const user: AuthUser | null = useAuth().user
```

**Step 3:** Replace user.app_metadata usage
```tsx
// Old
const provider = user.app_metadata?.provider

// New (org_id is now top-level)
const orgId = user.org_id
```

**Step 4:** Add org_id checks where needed
```tsx
// New components should check org_id
if (!user?.org_id) {
  return <div>Organization not set</div>
}
```

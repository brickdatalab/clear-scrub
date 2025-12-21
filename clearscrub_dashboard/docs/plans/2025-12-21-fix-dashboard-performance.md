# Fix Dashboard Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate redundant API calls (4x profile fetches → 1x, 2x list-companies → 1x) and reduce session waiting timeout from 5s to 500ms to achieve <500ms initial page load.

**Architecture:** Fix the auth flow to deduplicate profile fetches using a ref flag, add AbortController to prevent React StrictMode double-fetches, and simplify the waitForSession function to return immediately when session exists (no polling needed).

**Tech Stack:** React 18, Supabase JS Client, TypeScript

---

## Task 1: Fix Duplicate Profile Fetches in useAuth.tsx

**Files:**
- Modify: `src/hooks/useAuth.tsx:171-233`

**Problem:** Both `getSession()` callback AND `onAuthStateChange` listener call `fetchUserWithOrgId()`. With React StrictMode, this causes 4 profile queries instead of 1.

**Step 1: Add a ref to track if initial profile fetch is complete**

At line 77, after `const [authReady, setAuthReady] = useState(false)`, add:

```typescript
const [authReady, setAuthReady] = useState(false)
const profileFetchedRef = useRef(false)
```

Also update the import at line 1:

```typescript
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react'
```

**Step 2: Modify getSession() callback to set the ref flag**

Replace lines 171-196 with:

```typescript
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)

      if (session?.user) {
        // Only fetch profile if not already fetched (prevents StrictMode double-fetch)
        if (!profileFetchedRef.current) {
          profileFetchedRef.current = true
          const authUser = await fetchUserWithOrgId(session.user)
          setUser(authUser)
        }

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
```

**Step 3: Modify onAuthStateChange to skip initial events when profile already fetched**

Replace lines 198-230 with:

```typescript
    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (import.meta.env.DEV) {
        console.log('[useAuth] Auth state changed:', event)
      }

      // Skip INITIAL_SESSION and first SIGNED_IN if we already fetched profile via getSession
      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && profileFetchedRef.current) {
        if (import.meta.env.DEV) {
          console.log('[useAuth] Skipping duplicate profile fetch for event:', event)
        }
        return
      }

      setSession(session)

      if (session?.user) {
        // Reset authReady while fetching org_id
        setAuthReady(false)

        // Fetch fresh org_id on auth state change
        profileFetchedRef.current = true
        const authUser = await fetchUserWithOrgId(session.user)
        setUser(authUser)

        // Ready once we have a session. org_id may be null for new users.
        setAuthReady(!!session)

        if (import.meta.env.DEV) {
          console.log('[useAuth] authReady:', !!session, '(session loaded, org_id may be null)')
        }
      } else {
        // User signed out - reset the flag so next sign-in fetches profile
        profileFetchedRef.current = false
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
```

**Step 4: Verify the fix**

Run: Open browser dev tools Network tab, refresh page
Expected: Only 1 request to `/rest/v1/profiles` instead of 4

**Step 5: Commit**

```bash
git add src/hooks/useAuth.tsx
git commit -m "fix: eliminate duplicate profile fetches using ref flag"
```

---

## Task 2: Reduce waitForSession Timeout and Remove Polling

**Files:**
- Modify: `src/lib/supabaseClient.ts:24-77`

**Problem:** The `waitForSession()` function has a 5-second timeout and polls every 100ms. This is unnecessary because the session is cached in localStorage and loads instantly.

**Step 1: Simplify waitForSession to just check once**

Replace lines 24-77 with:

```typescript
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
```

**Step 2: Verify the fix**

Run: Open browser, logout, login again
Expected: Login completes within 1 second, no 5-second delays

**Step 3: Commit**

```bash
git add src/lib/supabaseClient.ts
git commit -m "perf: reduce waitForSession timeout from 5s to 500ms, remove polling"
```

---

## Task 3: Add AbortController to Companies.tsx to Prevent Double-Fetch

**Files:**
- Modify: `src/pages/Companies.tsx:32-47`

**Problem:** React StrictMode double-mounts components, causing 2 API calls to list-companies.

**Step 1: Add AbortController and cleanup**

Replace lines 32-47 with:

```typescript
  // Load companies on mount with AbortController to prevent StrictMode double-fetch
  useEffect(() => {
    const abortController = new AbortController()

    async function loadCompanies() {
      // Skip if already aborted (StrictMode unmount)
      if (abortController.signal.aborted) return

      try {
        setIsLoading(true)
        setError(null)
        const data = await api.getCompanies(1, 50)

        // Check again before setting state
        if (abortController.signal.aborted) return

        setCompanies(data.companies || [])
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') return
        if (abortController.signal.aborted) return

        setError(err instanceof Error ? err.message : 'Failed to load companies')
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadCompanies()

    return () => {
      abortController.abort()
    }
  }, [])
```

**Step 2: Remove redundant timeout wrapper**

Delete lines 13-22 (the `withTimeout` function definition). It's redundant because the API already has timeout protection via `TIMEOUT_MS.EDGE_FUNCTION`.

**Step 3: Update import**

Remove the unused import. Line 1 should just be:

```typescript
import React, { useState, useEffect, useCallback } from 'react'
```

**Step 4: Verify the fix**

Run: Open browser dev tools Network tab, refresh page
Expected: Only 1 request to `/functions/v1/list-companies` instead of 2

**Step 5: Commit**

```bash
git add src/pages/Companies.tsx
git commit -m "fix: add AbortController to prevent StrictMode double-fetch in Companies"
```

---

## Task 4: Verify All Fixes Work Together

**Files:**
- None (testing only)

**Step 1: Clear browser storage and do fresh login**

Run in browser console:
```javascript
localStorage.clear()
sessionStorage.clear()
location.reload()
```

**Step 2: Login and watch Network tab**

Expected results:
- 1x POST to `/auth/v1/token` (login)
- 1x GET to `/rest/v1/profiles` (fetch org_id) - NOT 4x
- 1x POST to `/functions/v1/list-companies` (fetch companies) - NOT 2x
- Total load time: < 1 second

**Step 3: Verify console logs**

Expected in dev console:
- `[useAuth] Skipping duplicate profile fetch for event: INITIAL_SESSION`
- `[waitForSession] Session immediately available`
- NO timeout warnings

**Step 4: Test sign out and sign back in**

Run: Click sign out, then sign in again
Expected: Same performance - 1 profile query, 1 companies query

---

## Summary of Changes

| File | Change | Impact |
|------|--------|--------|
| `src/hooks/useAuth.tsx` | Add `profileFetchedRef` to deduplicate | 4x → 1x profile queries |
| `src/lib/supabaseClient.ts` | Reduce timeout 5s → 500ms, remove polling | Faster fail-fast for unauthenticated users |
| `src/pages/Companies.tsx` | Add AbortController, remove redundant timeout | 2x → 1x list-companies calls |

**Expected Result:** Page load time reduced from 2-4 seconds to < 500ms.

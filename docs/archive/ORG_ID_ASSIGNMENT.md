# ClearScrub org_id Assignment Process

**Last Updated:** October 21, 2025
**Migration:** `20251021_create_auth_trigger.sql`
**Status:** Production-Ready

---

## Overview

This document provides a comprehensive explanation of how `org_id` is automatically assigned to new users during the signup process. Understanding this mechanism is critical because `org_id` is the foundation of ClearScrub's multi-tenant security architecture.

**Key Concept:** Every piece of data in ClearScrub belongs to an organization. Users access data through their organization membership. Without a valid `org_id`, users have ZERO data access due to Row Level Security (RLS) policies.

---

## Table of Contents

1. [Why org_id Is Critical](#why-org_id-is-critical)
2. [The handle_new_user() Trigger](#the-handle_new_user-trigger)
3. [Email Generation Pattern](#email-generation-pattern)
4. [Migration Documentation](#migration-documentation)
5. [Troubleshooting](#troubleshooting)

---

## Why org_id Is Critical

### Multi-Tenant Architecture Foundation

ClearScrub is a multi-tenant SaaS platform where:
- **One database** serves all customers
- **Data isolation** is enforced by `org_id` column
- **Row Level Security (RLS)** policies filter queries automatically

**Without org_id assignment:**
```sql
-- User queries companies table
SELECT * FROM companies;

-- RLS policy filters by org_id
WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid());

-- If profiles.org_id is NULL:
WHERE org_id IN (SELECT NULL FROM profiles WHERE id = auth.uid());
-- Returns 0 rows (NULL never equals anything)
```

**Result:** User sees empty dashboard, all API calls return no data, system appears broken.

### Security Implications

**org_id Provides:**
1. **Data Isolation:** Company A cannot see Company B's data
2. **API Access Control:** All read APIs filter by user's org_id
3. **Audit Trail:** All records tagged with owning organization
4. **Billing Boundary:** Usage tracked per organization

**If org_id Assignment Fails:**
- User can authenticate (JWT token valid)
- User cannot access any data (RLS blocks everything)
- No error message (just empty results)
- Support tickets: "Dashboard is blank after signup"

**Critical Requirement:** org_id MUST be assigned during signup, before user makes first API request.

---

## The handle_new_user() Trigger

### Trigger Overview

**Trigger Name:** `on_auth_user_created`
**Function Name:** `handle_new_user()`
**Timing:** AFTER INSERT on auth.users
**Scope:** FOR EACH ROW (executes once per new user)

**Purpose:** Automatically creates organization and profile when user signs up, ensuring org_id is always assigned.

### Trigger Definition

**Location:** `supabase/database/migrations/20251021_create_auth_trigger.sql` (lines 90-93)

```sql
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
```

**Key Attributes:**
- **AFTER INSERT:** Executes after user record is committed to auth.users
- **FOR EACH ROW:** Runs once for each new signup (not once per batch)
- **Non-blocking:** User signup completes, then trigger fires asynchronously

### Function Implementation

**Location:** `supabase/database/migrations/20251021_create_auth_trigger.sql` (lines 45-79)

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id UUID;
BEGIN
  -- Generate UUID for new organization
  new_org_id := gen_random_uuid();

  -- Insert organization with user's email in name
  -- COALESCE ensures we always have a name, even if email is NULL
  INSERT INTO public.organizations (id, name, created_at)
  VALUES (
    new_org_id,
    COALESCE('Organization ' || NEW.email, 'Organization ' || NEW.id::text),
    NOW()
  );

  -- Insert profile linked to new organization
  -- This establishes the user -> org_id relationship for RLS
  INSERT INTO public.profiles (id, email, org_id, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    new_org_id,
    NOW()
  );

  -- Return NEW to complete the trigger (AFTER trigger ignores return value)
  RETURN NEW;
END;
$function$;
```

### Step-by-Step Execution

#### Step 1: Organization ID Generation

```sql
new_org_id := gen_random_uuid();
```

**What Happens:**
- PostgreSQL generates a random UUID (e.g., `660e8400-e29b-41d4-a716-446655440001`)
- Stored in `new_org_id` variable
- Used for both organizations.id and profiles.org_id (establishing relationship)

**Why UUID:**
- Globally unique (no collisions across databases)
- Non-sequential (security: can't guess other org IDs)
- Standard format for PostgreSQL primary keys

#### Step 2: Organization Creation

```sql
INSERT INTO public.organizations (id, name, created_at)
VALUES (
  new_org_id,
  COALESCE('Organization ' || NEW.email, 'Organization ' || NEW.id::text),
  NOW()
);
```

**What Happens:**
- Creates new organization record
- Name defaults to "Organization {email}"
- Example: "Organization john@example.com"

**COALESCE Explanation:**
- Primary: Try to use user's email for organization name
- Fallback: If email is NULL (shouldn't happen), use user UUID
- Guarantees: Organization always gets a name (NOT NULL constraint)

**NEW Variable:**
- `NEW` is a special PostgreSQL trigger variable
- Contains the newly inserted row from auth.users
- Available fields: `NEW.id`, `NEW.email`, `NEW.encrypted_password`, etc.

**Why This Name Format:**
- User-friendly: clearly associates org with signup email
- Temporary: user can change organization name later (future feature)
- Debugging: easy to find orgs by email in database

#### Step 3: Profile Creation with org_id

```sql
INSERT INTO public.profiles (id, email, org_id, created_at)
VALUES (
  NEW.id,
  NEW.email,
  new_org_id,
  NOW()
);
```

**What Happens:**
- Creates profile record with same ID as auth.users record (one-to-one relationship)
- Associates profile with newly created organization via `org_id`
- This is THE critical link that enables RLS policies

**Key Relationships Established:**
```
auth.users (id: 550e8400-...)
    ↓ (one-to-one)
profiles (id: 550e8400-..., org_id: 660e8400-...)
    ↓ (many-to-one)
organizations (id: 660e8400-...)
```

**Why profile.id = auth.users.id:**
- Simplifies joins in RLS policies
- No need for separate user_id foreign key
- PostgreSQL enforces referential integrity (CASCADE on delete)

**Why org_id is NOT NULL:**
- Profile table allows NULL org_id in schema (for flexibility)
- Trigger always assigns org_id (never leaves it NULL)
- Future: Could support org-less "pending invitation" users

#### Step 4: Trigger Completion

```sql
RETURN NEW;
```

**What Happens:**
- Trigger returns the NEW record (required by PostgreSQL)
- For AFTER triggers, return value is ignored (insert already committed)
- If trigger had errors, entire transaction rolls back (signup fails)

**Transaction Boundaries:**
```
BEGIN TRANSACTION;
  INSERT INTO auth.users (...);  -- Signup request
  [TRIGGER FIRES]
    INSERT INTO organizations (...);
    INSERT INTO profiles (...);
  [TRIGGER COMPLETE]
COMMIT TRANSACTION;  -- All or nothing
```

**Atomic Guarantee:**
- If organization creation fails → profile not created → signup fails
- If profile creation fails → organization not created → signup fails
- User never exists without org_id (data integrity guaranteed)

### Security Context: SECURITY DEFINER

**Declaration:**
```sql
SECURITY DEFINER
SET search_path TO 'public'
```

**What This Means:**
- Function runs with privileges of function OWNER (postgres superuser)
- Can bypass Row Level Security policies
- Required because:
  - Newly created user doesn't have org_id yet (RLS would block inserts)
  - Need to write to organizations and profiles tables
  - User doesn't have permission to create organizations

**Security Considerations:**
- `search_path` locked to 'public' schema (prevents schema injection attacks)
- Function is simple and audited (no user input processed)
- Only called by trusted trigger (not directly by users)

**Why NOT Use Service Role Key:**
- Triggers run in database (no API layer)
- SECURITY DEFINER is PostgreSQL's native mechanism
- More efficient (no HTTP calls, no external authentication)

---

## Email Generation Pattern

### Current Implementation

**Organization Email Field:** `organizations.email_address`

**Expected Format (from CLAUDE.md):**
```
org_{uuid}@emailforwarding.clearscrub.io
```

**Example:**
```
org_660e8400-e29b-41d4-a716-446655440001@emailforwarding.clearscrub.io
```

### Status: NOT IMPLEMENTED IN TRIGGER

**Current Behavior:**
- Trigger creates organization with `name` field
- Does NOT set `email_address` field
- `email_address` remains NULL after signup

**Why This Matters:**
- Email ingestion feature (planned) uses org email for routing
- Format: Send PDF to `{org_id}@underwrite.cleardata.io`
- Email service looks up org_id from email address
- Without email_address, email ingestion won't work

### Future Enhancement Required

**Update trigger to include email generation:**

```sql
-- Insert organization with user's email in name AND email_address
INSERT INTO public.organizations (id, name, email_address, created_at)
VALUES (
  new_org_id,
  COALESCE('Organization ' || NEW.email, 'Organization ' || NEW.id::text),
  'org_' || new_org_id::text || '@underwrite.cleardata.io',  -- NEW LINE
  NOW()
);
```

**Migration Name:** `20251021_add_org_email_generation.sql` (not yet created)

**Testing Required:**
- Verify email uniqueness (should be guaranteed by UUID uniqueness)
- Verify email format parsing in future email ingestion handler
- Test with actual email service (SendGrid, Mailgun, etc.)

---

## Migration Documentation

### Migration File Details

**File:** `supabase/database/migrations/20251021_create_auth_trigger.sql`
**Created:** October 21, 2025
**Status:** Applied to production database
**Lines:** 121 total

### Migration Header (Lines 1-33)

**Metadata:**
```sql
-- Migration: 20251021_create_auth_trigger
-- Created: October 21, 2025
-- Author: ClearScrub Infrastructure Team
```

**Purpose:**
> Create authentication trigger to automatically assign org_id during user signup process

**Dependencies:**
- `auth.users` table (Supabase Auth managed)
- `public.organizations` table (must exist)
- `public.profiles` table (must exist)

**Rationale:**
> When a user signs up via Supabase Auth, they are created in auth.users but do not automatically get an organization or profile. This trigger ensures that:
> 1. A new organization is created for each new user
> 2. A profile is created linking the user to their organization
> 3. Multi-tenancy (org_id) is established from the start

**Impact:**
- Runs AFTER INSERT on auth.users (does not block signup)
- Creates 2 additional rows per signup (1 organization + 1 profile)
- Required for RLS policies to function correctly

**Security:**
- Function uses SECURITY DEFINER to bypass RLS during creation
- search_path locked to 'public' to prevent schema injection

### Verification Queries (Lines 97-108)

**After migration deployment, run these checks:**

**1. Verify function exists:**
```sql
SELECT proname, prosrc FROM pg_proc WHERE proname = 'handle_new_user';
```

**Expected Output:**
```
proname         | prosrc
----------------+--------
handle_new_user | [function code]
```

**2. Verify trigger exists:**
```sql
SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

**Expected Output:**
```
tgname                | tgrelid
----------------------+-----------
on_auth_user_created | auth.users
```

**3. Test trigger with real signup:**
```sql
-- After signup, check profile was created with org_id
SELECT * FROM profiles WHERE id = '<new_user_id>';

-- Check organization was created
SELECT * FROM organizations WHERE id = (SELECT org_id FROM profiles WHERE id = '<new_user_id>');
```

**Expected:**
- Profile record exists with matching user ID
- org_id is NOT NULL
- Organization record exists with matching org_id

### Rollback Documentation

**Location:** `supabase/database/migrations/ROLLBACK.md` (lines 51-151)

**When to Rollback:**
- During development/testing only
- If trigger causes signup failures (e.g., constraint violations)
- If you need to modify trigger logic (rollback, fix, reapply)

**NEVER Rollback in Production Unless:**
- You have replacement mechanism ready to deploy immediately
- You are prepared for ALL new signups to fail until fixed
- You have communicated downtime window to users

**Rollback SQL:**
```sql
-- Step 1: Drop the trigger (stops execution on new signups)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Step 2: Drop the function (removes the code)
DROP FUNCTION IF EXISTS public.handle_new_user();
```

**Verification After Rollback:**
```sql
-- Should return 0 rows
SELECT proname FROM pg_proc WHERE proname = 'handle_new_user';
SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

**Impact of Rollback:**
- New user signups will BREAK (no org_id assigned)
- Existing users continue to work normally
- New users authenticate successfully but see empty dashboard
- RLS policies deny access (no org_id = no data access)

**Post-Rollback Actions Required:**
1. Disable signups in Supabase settings
2. Manual user creation process (see ROLLBACK.md lines 112-123)
3. Deploy fixed trigger as soon as possible
4. Re-enable signups after verification

---

## Troubleshooting

### Issue: New User Has NULL org_id

**Symptom:**
- User signs up successfully
- User can log in
- Dashboard is completely empty
- All API calls return []

**Diagnosis:**
```sql
-- Check profile record
SELECT id, email, org_id FROM profiles WHERE email = 'user@example.com';
```

**If org_id is NULL:**

**Possible Causes:**
1. Trigger was not deployed
2. Trigger was dropped/disabled
3. Trigger threw an error during execution
4. Database constraints prevented insert

**Verification Steps:**

**1. Check if trigger exists:**
```sql
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';
```

**Expected:** `tgenabled = 'O'` (enabled)
**If missing:** Redeploy migration

**2. Check if function exists:**
```sql
SELECT proname FROM pg_proc WHERE proname = 'handle_new_user';
```

**If missing:** Redeploy migration

**3. Check PostgreSQL error logs:**
```sql
-- In Supabase Dashboard: Database → Logs → Postgres
-- Filter by: error, trigger
```

**Look for:**
- Constraint violations (unique, foreign key, not null)
- Permission errors (unlikely with SECURITY DEFINER)
- Schema errors (table not found)

**Manual Fix (Emergency):**

**1. Create organization for user:**
```sql
INSERT INTO organizations (id, name, created_at)
VALUES (
  gen_random_uuid(),
  'Organization user@example.com',
  NOW()
)
RETURNING id;
-- Save the returned UUID
```

**2. Update profile with org_id:**
```sql
UPDATE profiles
SET org_id = '<uuid_from_step_1>'
WHERE email = 'user@example.com';
```

**3. Verify fix:**
```sql
SELECT p.id, p.email, p.org_id, o.name
FROM profiles p
JOIN organizations o ON p.org_id = o.id
WHERE p.email = 'user@example.com';
```

**4. User should now see data:**
- Have user refresh dashboard
- Dashboard should no longer be empty
- Can now add companies, view statements, etc.

### Issue: Multiple Organizations Created for Same User

**Symptom:**
- User has multiple org_id values in different sessions
- Data appears/disappears randomly
- User sees different data after logout/login

**Diagnosis:**
```sql
-- Check if user has multiple profiles
SELECT * FROM profiles WHERE email = 'user@example.com';
```

**If multiple profiles exist:**

**This should be IMPOSSIBLE due to:**
1. profiles.id is foreign key to auth.users.id (unique)
2. profiles.email has UNIQUE constraint

**Possible Causes:**
1. Trigger fired multiple times (database bug)
2. Manual profile creation (admin error)
3. Email case sensitivity mismatch

**Fix:**

**1. Identify correct org_id:**
```sql
-- Find which org has actual data
SELECT o.id, o.name, COUNT(c.id) AS company_count
FROM organizations o
LEFT JOIN companies c ON o.id = c.org_id
WHERE o.id IN (SELECT org_id FROM profiles WHERE email = 'user@example.com')
GROUP BY o.id, o.name;
```

**2. Keep org with data, merge if needed:**
```sql
-- Update all companies to correct org_id
UPDATE companies SET org_id = '<correct_org_id>'
WHERE org_id IN (SELECT org_id FROM profiles WHERE email = 'user@example.com');

-- Update all other tables similarly
UPDATE accounts SET org_id = '<correct_org_id>' WHERE ...;
UPDATE statements SET org_id = '<correct_org_id>' WHERE ...;
```

**3. Delete duplicate organizations:**
```sql
-- Delete empty orgs
DELETE FROM organizations
WHERE id IN (SELECT org_id FROM profiles WHERE email = 'user@example.com')
  AND id != '<correct_org_id>';
```

**4. Update profile to correct org_id:**
```sql
UPDATE profiles
SET org_id = '<correct_org_id>'
WHERE email = 'user@example.com';
```

### Issue: Trigger Fails During Signup

**Symptom:**
- Signup fails with generic error
- User not created in auth.users
- No profile or organization created

**Diagnosis:**

**1. Check Supabase function logs:**
```bash
supabase functions logs --project-ref vnhauomvzjucxadrbywg
```

**2. Check PostgreSQL error logs** (Supabase Dashboard)

**Common Errors:**

**A. Foreign Key Constraint Violation:**
```
ERROR: insert or update on table "profiles" violates foreign key constraint
```

**Cause:** profiles.org_id references organizations.id
**Fix:** Verify organization insert happens before profile insert (should be guaranteed by trigger code)

**B. NOT NULL Constraint Violation:**
```
ERROR: null value in column "name" violates not-null constraint
```

**Cause:** Organization name generation failed (email was NULL)
**Fix:** COALESCE should prevent this, check if NEW.id is also NULL (database corruption)

**C. Unique Constraint Violation:**
```
ERROR: duplicate key value violates unique constraint "profiles_pkey"
```

**Cause:** Profile with this user ID already exists (trigger ran twice?)
**Fix:** Check for race condition, verify trigger is idempotent

**D. Schema Permission Error:**
```
ERROR: permission denied for schema public
```

**Cause:** Function lacks permission (shouldn't happen with SECURITY DEFINER)
**Fix:** Redeploy trigger with correct SECURITY DEFINER setting

### Issue: User Can't Access Data After Successful Signup

**Symptom:**
- User has org_id (verified in database)
- Dashboard still empty
- API calls return 200 but empty arrays

**Diagnosis:**

**1. Verify RLS policies exist:**
```sql
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN ('companies', 'accounts', 'statements');
```

**Expected:** Multiple policies per table (SELECT, INSERT, UPDATE, DELETE)

**2. Test RLS policy manually:**
```sql
-- Set user context
SET request.jwt.claims.sub = '<user_uuid>';

-- Test query
SELECT * FROM companies;
```

**If returns 0 rows but companies exist:**
- RLS policy is filtering correctly BUT
- User's org has no data yet (expected for new signups)

**If returns error:**
- RLS policy may be misconfigured
- Check policy uses correct org_id lookup

**3. Add test data for verification:**
```sql
-- Get user's org_id
SELECT org_id FROM profiles WHERE id = '<user_uuid>';

-- Insert test company
INSERT INTO companies (org_id, legal_name, normalized_legal_name)
VALUES ('<user_org_id>', 'Test Company', 'TEST COMPANY');

-- User should now see this company in dashboard
```

---

## Best Practices

### When Modifying the Trigger

**Always:**
1. Test in development first (use Supabase local dev environment)
2. Create new migration file (don't edit existing)
3. Document changes in migration header
4. Include rollback procedure
5. Verify trigger still runs atomically (all-or-nothing)

**Never:**
1. Remove org_id assignment (breaks RLS)
2. Make trigger synchronous/blocking (impacts signup performance)
3. Add complex business logic (triggers should be simple)
4. Remove SECURITY DEFINER (profiles insert would fail)
5. Process user input in trigger (security risk)

### When Debugging Trigger Issues

**Checklist:**
1. Verify trigger exists and is enabled
2. Check PostgreSQL logs for errors
3. Manually trace execution with test signup
4. Verify each INSERT statement independently
5. Check foreign key relationships
6. Verify constraints not blocking inserts

### Monitoring Trigger Health

**Metrics to Track:**
1. Signup success rate (should be ~100%)
2. Profiles with NULL org_id (should be 0)
3. Organizations created per day (should match signups)
4. Trigger execution time (should be <100ms)

**Alerting:**
- If NULL org_id count > 0: immediate investigation
- If trigger execution time > 1s: performance issue
- If signup errors spike: check trigger logs

---

## Future Enhancements

### Planned Improvements

**1. Organization Email Generation**
- Add email_address field population
- Format: `org_{uuid}@underwrite.cleardata.io`
- Required for email ingestion feature

**2. Custom Organization Name**
- Accept organization_name in signup metadata
- Use in trigger instead of default "Organization {email}"
- Better UX for new users

**3. Invitation-Based Signup**
- Accept org_id in signup metadata (from invitation link)
- Skip organization creation if org_id provided
- Add user to existing organization

**4. Trigger Monitoring**
- Log trigger executions to audit table
- Track execution time, success rate
- Alert on failures

**5. Idempotency**
- Handle case where trigger runs twice (network retry)
- Check if profile already exists before insert
- ON CONFLICT DO NOTHING pattern

### Migration Path for Enhancements

**Example: Adding Organization Email**

**1. Create migration:**
```bash
supabase migration new add_org_email_generation
```

**2. Update trigger function:**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id UUID;
BEGIN
  new_org_id := gen_random_uuid();

  INSERT INTO public.organizations (id, name, email_address, created_at)
  VALUES (
    new_org_id,
    COALESCE('Organization ' || NEW.email, 'Organization ' || NEW.id::text),
    'org_' || new_org_id::text || '@underwrite.cleardata.io',  -- NEW
    NOW()
  );

  INSERT INTO public.profiles (id, email, org_id, created_at)
  VALUES (NEW.id, NEW.email, new_org_id, NOW());

  RETURN NEW;
END;
$function$;
```

**3. Test in development:**
```bash
supabase db reset --local
supabase db push --local
# Test signup in local environment
```

**4. Deploy to production:**
```bash
supabase db push --project-ref vnhauomvzjucxadrbywg
```

**5. Verify:**
```sql
-- Check new signups have email_address
SELECT id, name, email_address FROM organizations
WHERE created_at > NOW() - INTERVAL '1 hour';
```

---

## Related Documentation

**Must Read:**
- `AUTHENTICATION_FLOWS.md` - Complete signup/login flow with this trigger
- `RLS_POLICY_REFERENCE.md` - How org_id is used in RLS policies
- `ROLLBACK.md` - Emergency procedures if trigger fails

**Reference:**
- `CLAUDE.md` - Quick reference for org_id and multi-tenancy
- `supabase/database/CLAUDE.md` - Database architecture overview

---

**Document Status:** Complete and Production-Ready
**Last Updated:** October 21, 2025
**Maintained By:** ClearScrub Infrastructure Team

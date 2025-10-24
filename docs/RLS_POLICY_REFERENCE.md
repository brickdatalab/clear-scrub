# ClearScrub RLS Policy Reference

**Last Updated:** October 21, 2025
**Status:** Production-Ready
**Project:** ClearScrub Database Security

---

## Overview

Row Level Security (RLS) is PostgreSQL's native multi-tenant security mechanism. This document provides a comprehensive reference for all RLS policies in ClearScrub, explains how they enforce data isolation, and provides troubleshooting guidance.

**Critical Concept:** RLS policies are enforced AT THE DATABASE LEVEL, not in application code. This means even malicious SQL injection cannot bypass tenant isolation.

---

## Table of Contents

1. [What is RLS](#what-is-rls)
2. [All 14 Tables with RLS](#all-14-tables-with-rls)
3. [Policy Patterns](#policy-patterns)
4. [Multi-Tenant Isolation Guarantees](#multi-tenant-isolation-guarantees)
5. [Service Role Bypass](#service-role-bypass)
6. [Troubleshooting Guide](#troubleshooting-guide)

---

## What is RLS

### Concept

**Row Level Security** automatically filters database queries based on user context:

**Without RLS:**
```sql
-- User queries companies table
SELECT * FROM companies;

-- Returns ALL companies from ALL organizations
-- (Major security breach!)
```

**With RLS:**
```sql
-- User queries companies table
SELECT * FROM companies;

-- PostgreSQL automatically rewrites to:
SELECT * FROM companies
WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid());

-- Returns ONLY companies from user's organization
```

### How RLS Works

**1. User authenticates and gets JWT token:**
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "role": "authenticated"
}
```

**2. JWT token included in database requests:**
```http
Authorization: Bearer {jwt_token}
```

**3. PostgreSQL extracts user ID from JWT:**
```sql
-- Built-in Supabase function
SELECT auth.uid();
-- Returns: "550e8400-e29b-41d4-a716-446655440000"
```

**4. RLS policy looks up user's org_id:**
```sql
SELECT org_id FROM profiles WHERE id = auth.uid();
-- Returns: "660e8400-e29b-41d4-a716-446655440001"
```

**5. Query automatically filtered:**
```sql
-- Original query
SELECT * FROM companies;

-- Executed query (with RLS)
SELECT * FROM companies
WHERE org_id = '660e8400-e29b-41d4-a716-446655440001';
```

### Enabling RLS

**For each table:**
```sql
-- Enable RLS on table
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Create policies for SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "Users see own org companies"
ON companies FOR SELECT
USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

**Verification:**
```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'companies';

-- Expected: rowsecurity = true
```

---

## All 14 Tables with RLS

### Tier 1: Multi-Tenant Root

#### 1. organizations

**Purpose:** Root tenant entity, one per organization

**RLS Policies:**

**SELECT Policy:**
```sql
CREATE POLICY "Users see own org"
ON organizations FOR SELECT
USING (id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

**Why:** User can only see their own organization record

**INSERT Policy:**
```sql
CREATE POLICY "Service role can insert orgs"
ON organizations FOR INSERT
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
```

**Why:** Only trigger (via service role) can create organizations, not regular users

**UPDATE Policy:**
```sql
CREATE POLICY "Users update own org"
ON organizations FOR UPDATE
USING (id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

**Why:** Users can update their own organization settings (name, subscription, etc.)

#### 2. profiles

**Purpose:** User profiles within organizations

**RLS Policies:**

**SELECT Policy:**
```sql
CREATE POLICY "Users see profiles in own org"
ON profiles FOR SELECT
USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

**Why:** Users can see all teammates in their organization

**INSERT Policy:**
```sql
CREATE POLICY "Service role can insert profiles"
ON profiles FOR INSERT
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
```

**Why:** Only trigger creates profiles during signup, not regular users

**UPDATE Policy:**
```sql
CREATE POLICY "Users update own profile"
ON profiles FOR UPDATE
USING (id = auth.uid());
```

**Why:** Users can update their own profile (name, avatar, etc.) but not others

#### 3. api_keys

**Purpose:** API authentication keys for partners

**RLS Policies:**

**SELECT Policy:**
```sql
CREATE POLICY "Users see own org API keys"
ON api_keys FOR SELECT
USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

**Why:** Organization members can see all API keys for their org

**INSERT Policy:**
```sql
CREATE POLICY "Users create API keys for own org"
ON api_keys FOR INSERT
WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

**Why:** Users can create API keys for their organization

**DELETE Policy:**
```sql
CREATE POLICY "Users delete own org API keys"
ON api_keys FOR DELETE
USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

**Why:** Users can revoke API keys for their organization

---

### Tier 2: Application Data

#### 4. companies

**Purpose:** Loan applicant businesses

**RLS Policies:**

**SELECT Policy:**
```sql
CREATE POLICY "Users see own org companies"
ON companies FOR SELECT
USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

**Why:** Users only see companies in their organization (tenant isolation)

**INSERT Policy:**
```sql
CREATE POLICY "Service role can insert companies"
ON companies FOR INSERT
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
```

**Why:** Webhooks create companies, not regular users directly

**UPDATE Policy:**
```sql
CREATE POLICY "Service role can update companies"
ON companies FOR UPDATE
USING (auth.jwt() ->> 'role' = 'service_role');
```

**Why:** Webhooks enrich company data from applications, users don't edit directly (yet)

#### 5. applications

**Purpose:** Loan requests from companies

**RLS Policies:**

**SELECT Policy:**
```sql
CREATE POLICY "Users see own org applications"
ON applications FOR SELECT
USING (
  company_id IN (
    SELECT id FROM companies
    WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  )
);
```

**Why:** Users see applications for companies in their organization (indirect via companies)

**INSERT Policy:**
```sql
CREATE POLICY "Service role can insert applications"
ON applications FOR INSERT
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
```

**Why:** Webhooks create applications from PDFs, not users

#### 6. company_aliases

**Purpose:** Manual entity resolution overrides

**RLS Policies:**

**SELECT Policy:**
```sql
CREATE POLICY "Users see own org aliases"
ON company_aliases FOR SELECT
USING (
  company_id IN (
    SELECT id FROM companies
    WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  )
);
```

**Why:** Users see aliases for companies in their organization

**INSERT Policy:**
```sql
CREATE POLICY "Users create aliases for own org companies"
ON company_aliases FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT id FROM companies
    WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  )
);
```

**Why:** Users can add aliases for their companies (manual deduplication)

---

### Tier 3: Bank Statement Data

#### 7. accounts

**Purpose:** Bank accounts belonging to companies

**RLS Policies:**

**SELECT Policy:**
```sql
CREATE POLICY "Users see own org accounts"
ON accounts FOR SELECT
USING (
  company_id IN (
    SELECT id FROM companies
    WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  )
);
```

**Why:** Users see bank accounts for companies in their organization

**INSERT Policy:**
```sql
CREATE POLICY "Service role can insert accounts"
ON accounts FOR INSERT
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
```

**Why:** Webhooks create accounts from bank statements, not users

#### 8. statements

**Purpose:** Monthly bank statement periods

**RLS Policies:**

**SELECT Policy:**
```sql
CREATE POLICY "Users see own org statements"
ON statements FOR SELECT
USING (
  company_id IN (
    SELECT id FROM companies
    WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  )
);
```

**Why:** Users see statements for companies in their organization

**INSERT Policy:**
```sql
CREATE POLICY "Service role can insert statements"
ON statements FOR INSERT
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
```

**Why:** Webhooks create statements from PDFs, not users

**Note:** Transactions are stored in statements.raw_data JSONB, not separate table

---

### Tier 4: Ingestion & Processing

#### 9. submissions

**Purpose:** Upload batch tracking

**RLS Policies:**

**SELECT Policy:**
```sql
CREATE POLICY "Users see own org submissions"
ON submissions FOR SELECT
USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

**Why:** Users see all document submissions for their organization

**INSERT Policy:**
```sql
CREATE POLICY "Service role can insert submissions"
ON submissions FOR INSERT
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
```

**Why:** Webhooks create submission records, not users

#### 10. documents

**Purpose:** Individual file processing logs

**RLS Policies:**

**SELECT Policy:**
```sql
CREATE POLICY "Users see own org documents"
ON documents FOR SELECT
USING (
  submission_id IN (
    SELECT id FROM submissions
    WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  )
);
```

**Why:** Users see documents for submissions in their organization (indirect via submissions)

**INSERT Policy:**
```sql
CREATE POLICY "Service role can insert documents"
ON documents FOR INSERT
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
```

**Why:** Webhooks create document records, not users

#### 11. email_submissions

**Purpose:** Email-based document submissions (PLANNED)

**RLS Policies:**

**SELECT Policy:**
```sql
CREATE POLICY "Users see own org email submissions"
ON email_submissions FOR SELECT
USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

**Why:** Users see emails sent to their organization's email address

**INSERT Policy:**
```sql
CREATE POLICY "Service role can insert email submissions"
ON email_submissions FOR INSERT
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
```

**Why:** Email handler creates submission records, not users

---

### Tier 5: Monitoring & Billing

#### 12. usage_logs

**Purpose:** API usage and billing tracking

**RLS Policies:**

**SELECT Policy:**
```sql
CREATE POLICY "Users see own org usage"
ON usage_logs FOR SELECT
USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

**Why:** Users can view their organization's usage metrics

**INSERT Policy:**
```sql
CREATE POLICY "Service role can insert usage logs"
ON usage_logs FOR INSERT
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
```

**Why:** System tracks usage automatically, not users

---

### Tier 6: Debug & Development

#### 13. webhook_catches

**Purpose:** Webhook payload debugging

**RLS Policies:**

**LOCKED DOWN - No User Access:**
```sql
-- RLS is ENABLED but NO policies exist
-- Result: Regular users cannot access this table at all
```

**Service Role Access:**
```sql
-- Service role can bypass RLS
-- Used for debugging in development only
```

**Why:** Contains raw webhook data, may have sensitive info, admin-only access

---

### Special Case: Materialized Views (Not Tables)

#### account_monthly_rollups

**Type:** Materialized View (pre-aggregated data)

**RLS:** NOT applicable (views don't have RLS policies)

**Security:** Accessed through Edge Functions which enforce RLS on source tables

#### company_monthly_rollups

**Type:** Materialized View (pre-aggregated data)

**RLS:** NOT applicable (views don't have RLS policies)

**Security:** Accessed through Edge Functions which enforce RLS on source tables

---

## Policy Patterns

### Pattern 1: Direct org_id Filter

**Used by:** organizations, profiles, submissions, usage_logs

**Policy:**
```sql
USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

**When to Use:**
- Table has org_id column
- Direct relationship to organization
- No intermediate joins needed

**Performance:** Fastest (single subquery, indexed)

### Pattern 2: Indirect via Companies

**Used by:** applications, accounts, statements, company_aliases

**Policy:**
```sql
USING (
  company_id IN (
    SELECT id FROM companies
    WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  )
);
```

**When to Use:**
- Table relates to companies, not directly to organizations
- company_id foreign key exists
- Need to filter through company ownership

**Performance:** Moderate (two subqueries, indexed joins)

### Pattern 3: Indirect via Submissions

**Used by:** documents

**Policy:**
```sql
USING (
  submission_id IN (
    SELECT id FROM submissions
    WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  )
);
```

**When to Use:**
- Table relates to submissions, not directly to organizations
- submission_id foreign key exists
- Document ownership determined by submission

**Performance:** Moderate (two subqueries, indexed joins)

### Pattern 4: Service Role Only

**Used by:** webhook_catches (debug table)

**Policy:**
```sql
-- RLS enabled but NO policies
-- Only service_role can access (bypasses RLS)
```

**When to Use:**
- Table contains sensitive debug data
- Only admins should access
- No user access needed

**Performance:** N/A (users can't query)

### Pattern 5: Self-Only Access

**Used by:** profiles (UPDATE only)

**Policy:**
```sql
USING (id = auth.uid());
```

**When to Use:**
- User can only modify their own record
- Not their entire organization's records
- Personal settings/profile data

**Performance:** Fastest (direct equality check)

---

## Multi-Tenant Isolation Guarantees

### What RLS Guarantees

**1. Data Visibility:**
- Users NEVER see data from other organizations
- Queries automatically filtered by org_id
- No application code required

**2. Data Modification:**
- Users can ONLY modify data in their organization
- Cannot delete/update other orgs' data
- Enforced at database level

**3. Bypass-Proof:**
- Even malicious SQL injection respects RLS
- Direct database connections (psql) respect RLS
- Only service_role key can bypass

**4. Performance:**
- Queries optimized with indexes on org_id
- PostgreSQL query planner accounts for RLS
- No significant overhead vs manual filtering

### What RLS Does NOT Guarantee

**1. Authorization (RBAC):**
- RLS enforces org_id, not user roles
- Example: Can't prevent "viewer" users from editing
- Solution: Add role-based policies or application logic

**2. Field-Level Security:**
- RLS filters rows, not columns
- All columns visible if row passes policy
- Solution: Create views with column subsets

**3. Cross-Org Relationships:**
- Can't share data between organizations
- All data strictly isolated
- Solution: Create shared "public" org if needed

**4. Audit Logging:**
- RLS doesn't log which user accessed what
- Solution: Application-level audit logs

---

## Service Role Bypass

### What is Service Role

**Service Role Key:**
- Special Supabase API key
- Bypasses ALL RLS policies
- Full database access
- Used by Edge Functions for admin operations

**Where It's Used:**
- Webhook intake (statement-schema-intake, application-schema-intake)
- Database triggers (handle_new_user)
- Batch operations (migrations, backfills)
- Admin tasks (manual data fixes)

### Service Role Policy Pattern

**Standard Pattern:**
```sql
CREATE POLICY "Service role bypass"
ON companies FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');
```

**How It Works:**
1. Service role key included in request
2. JWT contains `role: "service_role"` claim
3. Policy checks this claim
4. If match: allows access regardless of org_id

**Why This Is Safe:**
- Service role key NEVER exposed to frontend
- Only server-side code has access
- Key stored in environment variables
- Supabase rotates keys on request

### When to Use Service Role

**DO use service_role for:**
- Webhook processing (external data ingestion)
- Cross-org operations (admin features)
- Database maintenance (migrations, cleanup)
- System-level operations (refresh materialized views)

**DO NOT use service_role for:**
- User-facing API calls (use JWT tokens)
- Frontend operations (major security risk)
- Any code that processes user input (injection risk)

### Verifying Service Role Usage

**Check Edge Function:**
```typescript
// CORRECT: Service role key used
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // Service role
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// WRONG: Anon key used (RLS enforced, webhooks fail)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!, // Anon key
);
```

---

## Troubleshooting Guide

### Scenario 1: User Can't See Data

**Symptom:**
- User logged in successfully
- Dashboard shows empty state
- API calls return `[]` or `{ companies: [] }`

**Diagnosis Steps:**

**1. Verify user has org_id:**
```sql
SELECT id, email, org_id FROM profiles WHERE email = 'user@example.com';
```

**Expected:** org_id is NOT NULL

**If org_id is NULL:**
- **Cause:** Trigger failed during signup
- **Solution:** See `ORG_ID_ASSIGNMENT.md` troubleshooting section
- **Quick Fix:**
  ```sql
  -- Create organization
  INSERT INTO organizations (id, name) VALUES (gen_random_uuid(), 'Test Org') RETURNING id;

  -- Update profile
  UPDATE profiles SET org_id = '<org_id_from_above>' WHERE email = 'user@example.com';
  ```

**2. Verify organization has data:**
```sql
-- Get user's org_id
SELECT org_id FROM profiles WHERE email = 'user@example.com';

-- Check if companies exist
SELECT COUNT(*) FROM companies WHERE org_id = '<user_org_id>';
```

**Expected:** COUNT > 0

**If COUNT = 0:**
- **Cause:** New organization, no data ingested yet
- **Expected Behavior:** Dashboard shows empty state "Add your first company"
- **Solution:** Ingest test data via webhook or manual insert

**3. Test RLS policy manually:**
```sql
-- Set user context
SET request.jwt.claims.sub = '<user_uuid>';

-- Query with RLS enforced
SELECT * FROM companies;
```

**Expected:** Returns companies for user's org

**If returns 0 rows despite data existing:**
- **Cause:** RLS policy misconfigured or missing
- **Check:**
  ```sql
  SELECT schemaname, tablename, policyname, cmd
  FROM pg_policies
  WHERE tablename = 'companies';
  ```
- **Expected:** At least one SELECT policy exists

### Scenario 2: Login Works But Dashboard Empty

**Symptom:**
- Login successful, JWT token valid
- All API endpoints return empty arrays
- Console shows 200 status codes (not errors)

**Diagnosis:**

**1. Check browser console for API calls:**
```javascript
// Should see requests like:
// POST /functions/v1/list-companies
// Response: { companies: [], pagination: {...} }
```

**2. Verify JWT token contains user ID:**
```javascript
// In browser console after login:
const session = await supabase.auth.getSession();
console.log(session.data.session.access_token);

// Decode JWT at jwt.io
// Verify 'sub' claim exists and matches user UUID
```

**3. Check if RLS policies are enabled:**
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false;
```

**Expected:** All application tables have `rowsecurity = true`

**If any tables have `rowsecurity = false`:**
```sql
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
-- Repeat for all tables
```

### Scenario 3: User Sees Another Organization's Data

**CRITICAL SECURITY BREACH - Immediate Investigation Required**

**Symptom:**
- User sees companies they didn't create
- Company names don't match their business
- Financial data from unknown entities

**Diagnosis (URGENT):**

**1. Verify user's org_id:**
```sql
SELECT id, email, org_id FROM profiles WHERE email = 'user@example.com';
```

**2. Verify companies user is seeing:**
```sql
-- Get company IDs from dashboard (user reports seeing these)
SELECT id, legal_name, org_id FROM companies WHERE id IN ('<company_id_1>', '<company_id_2>');
```

**3. Compare org_ids:**
- If user's org_id MATCHES company's org_id: **Expected behavior** (user owns these companies)
- If user's org_id DOES NOT MATCH company's org_id: **SECURITY BREACH**

**If Security Breach Confirmed:**

**Immediate Actions:**

**1. Disable affected user account:**
```sql
-- In Supabase Dashboard: Authentication → Users → [user] → Disable
```

**2. Check for RLS bypass:**
```sql
-- Verify RLS is enabled on companies table
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'companies';

-- Verify policies exist
SELECT policyname FROM pg_policies WHERE tablename = 'companies';
```

**3. Check for service_role_key leak:**
- Review frontend code for `SUPABASE_SERVICE_ROLE_KEY`
- Check browser console for exposed keys
- Review Git history for accidentally committed keys

**4. Review Edge Function logs:**
```bash
supabase functions logs list-companies --project-ref vnhauomvzjucxadrbywg
```

**5. Rotate service_role_key:**
- Supabase Dashboard → Settings → API → Reset service_role key
- Update all Edge Functions with new key
- Redeploy all functions

**6. Notify security team and affected users**

### Scenario 4: API Returns 401 Unauthorized

**Symptom:**
- User logged in successfully
- API calls return 401 status
- Dashboard shows "Unauthorized" error

**Diagnosis:**

**1. Check JWT token expiry:**
```javascript
// In browser console
const session = await supabase.auth.getSession();
const token = session.data.session.access_token;

// Decode at jwt.io and check 'exp' claim
// If expired, token needs refresh
```

**2. Verify JWT token included in request:**
```javascript
// Check network tab in browser DevTools
// Look for: Authorization: Bearer {token}
```

**If token missing:**
- **Cause:** Supabase client not initialized correctly
- **Fix:** Verify `supabaseClient.ts` singleton pattern

**3. Test token with curl:**
```bash
TOKEN="<jwt_token>"
curl -X POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/list-companies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"page": 1, "limit": 10}'
```

**If curl succeeds but dashboard fails:**
- **Cause:** Frontend not including token
- **Fix:** Check useAuth hook and Supabase client integration

### Scenario 5: Webhook Fails with Permission Error

**Symptom:**
- Webhook POST returns 403 or 500
- Error message: "permission denied"
- No data appears in database

**Diagnosis:**

**1. Check webhook authentication:**
```bash
curl -X POST <webhook_url> \
  -H "X-Webhook-Secret: clearscrub_webhook_2025_xyz123" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

**2. Verify service_role_key in Edge Function:**
```typescript
// Edge Function should use service role, not anon key
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // MUST be service role
);
```

**3. Check RLS policies allow service role:**
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'companies'
  AND policyname LIKE '%service%';
```

**Expected:** Policy checks `auth.jwt() ->> 'role' = 'service_role'`

**4. Test service role bypass manually:**
```sql
-- Set service role context
SET request.jwt.claims.role = 'service_role';

-- Try insert
INSERT INTO companies (org_id, legal_name, normalized_legal_name)
VALUES (gen_random_uuid(), 'Test', 'TEST');
```

**If fails:**
- **Cause:** Service role policy missing or incorrect
- **Fix:** Redeploy RLS policies with service role bypass

### Scenario 6: Performance Issues with RLS

**Symptom:**
- Queries slow (>1s response time)
- Dashboard takes long to load
- Database CPU usage high

**Diagnosis:**

**1. Check query plan with RLS:**
```sql
EXPLAIN ANALYZE
SELECT * FROM companies
WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid());
```

**Look for:**
- Sequential scans (bad) vs index scans (good)
- High execution time in RLS subquery
- Missing indexes on org_id columns

**2. Verify indexes exist:**
```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('companies', 'profiles', 'accounts');
```

**Expected indexes:**
- `profiles_org_id_idx` on profiles(org_id)
- `companies_org_id_idx` on companies(org_id)
- `accounts_company_id_idx` on accounts(company_id)

**3. Create missing indexes:**
```sql
CREATE INDEX IF NOT EXISTS companies_org_id_idx ON companies(org_id);
CREATE INDEX IF NOT EXISTS profiles_org_id_idx ON profiles(org_id);
CREATE INDEX IF NOT EXISTS profiles_pkey ON profiles(id); -- Should exist, verify
```

**4. Optimize RLS policy pattern:**
```sql
-- BAD: Multiple subqueries
USING (
  org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  )
);

-- GOOD: Use helper function
USING (org_id = get_my_org_id());

-- Create helper function if missing:
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;
```

---

## Verification Checklist

### Post-Deployment Verification

After deploying RLS policies or modifying tables, run this checklist:

**1. RLS Enabled:**
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT LIKE '%_rollup%'; -- Exclude materialized views

-- All should return rowsecurity = true
```

**2. Policies Exist:**
```sql
SELECT tablename, COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- Each table should have 2-4 policies (SELECT, INSERT, UPDATE, DELETE)
```

**3. Service Role Bypass:**
```sql
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    policyname LIKE '%service%'
    OR qual LIKE '%service_role%'
  );

-- Most tables should have service role policy
```

**4. Test User Access:**
```sql
-- Create test user and org
INSERT INTO organizations (id, name) VALUES ('test-org-id', 'Test Org');
INSERT INTO profiles (id, email, org_id) VALUES ('test-user-id', 'test@test.com', 'test-org-id');

-- Set user context
SET request.jwt.claims.sub = 'test-user-id';

-- Test SELECT
SELECT * FROM companies; -- Should return only test org companies

-- Test INSERT (should fail for regular users, succeed for service role)
INSERT INTO companies (org_id, legal_name, normalized_legal_name)
VALUES ('test-org-id', 'Test Company', 'TEST COMPANY');
```

**5. Test Cross-Org Isolation:**
```sql
-- Create second test org
INSERT INTO organizations (id, name) VALUES ('test-org-2-id', 'Test Org 2');
INSERT INTO profiles (id, email, org_id) VALUES ('test-user-2-id', 'test2@test.com', 'test-org-2-id');

-- Add company to first org
INSERT INTO companies (org_id, legal_name, normalized_legal_name)
VALUES ('test-org-id', 'Org 1 Company', 'ORG 1 COMPANY');

-- Set second user context
SET request.jwt.claims.sub = 'test-user-2-id';

-- Query companies (should NOT see first org's company)
SELECT * FROM companies;
-- Expected: 0 rows (cross-org isolation working)
```

---

## Related Documentation

**Must Read:**
- `AUTHENTICATION_FLOWS.md` - How JWT tokens enable RLS
- `ORG_ID_ASSIGNMENT.md` - How org_id is set during signup
- `CLAUDE.md` - Quick reference for multi-tenancy architecture

**Reference:**
- `supabase/database/CLAUDE.md` - Complete database schema with RLS details
- PostgreSQL RLS Documentation: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

---

**Document Status:** Complete and Production-Ready
**Last Updated:** October 21, 2025
**Maintained By:** ClearScrub Infrastructure Team

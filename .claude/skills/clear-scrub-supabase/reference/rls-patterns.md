# ClearScrub RLS Policy Patterns

## Overview

ClearScrub uses a multi-tenant architecture where all data is isolated by organization. The primary RLS pattern is **organization-based access control** through the `org_id` column.

**Project ID:** vnhauomvzjucxadrbywg

---

## Core Pattern: Organization-Based Access

All tables with RLS enabled follow this pattern:

```sql
-- User can only see their organization's data
CREATE POLICY "Users can view own org data"
ON public.table_name
FOR SELECT
USING (
  org_id = (
    SELECT org_id FROM public.profiles
    WHERE id = auth.uid()
  )
);
```

### Helper Function (Recommended)

Create a helper function to simplify policies:

```sql
-- Get current user's organization ID
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Usage in policies:
CREATE POLICY "org_isolation" ON public.table_name
FOR ALL USING (org_id = public.get_user_org_id());
```

---

## Tables by RLS Status

### RLS Enabled

| Table | Reason |
|-------|--------|
| organizations | Tenant data |
| profiles | User data |
| api_keys | Authentication secrets |
| accounts | Financial data |
| bank_statements | Financial data |
| transactions | Financial data |
| categories | Reference data |
| applications | PII data |
| submission_metrics | Aggregated data |
| webhooks | Integration secrets |
| audit_log | Compliance data |

### RLS Disabled

| Table | Reason |
|-------|--------|
| submissions | Handled by Edge Functions with service role |
| files | Handled by Edge Functions with service role |

---

## Policy Patterns by Table

### organizations

```sql
-- Users can only view their own organization
CREATE POLICY "Users can view own organization"
ON public.organizations
FOR SELECT
USING (
  id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Only admins can update organization (future: RBAC)
CREATE POLICY "Admins can update own organization"
ON public.organizations
FOR UPDATE
USING (
  id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);
```

### profiles

```sql
-- Users can view profiles in their organization
CREATE POLICY "View org profiles"
ON public.profiles
FOR SELECT
USING (
  org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Users can update their own profile
CREATE POLICY "Update own profile"
ON public.profiles
FOR UPDATE
USING (id = auth.uid());

-- Allow auth trigger to create profiles
CREATE POLICY "Allow profile creation on signup"
ON public.profiles
FOR INSERT
WITH CHECK (id = auth.uid());
```

### api_keys

```sql
-- View org API keys
CREATE POLICY "View org api keys"
ON public.api_keys
FOR SELECT
USING (
  org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  AND deleted_at IS NULL
);

-- Create API keys for own org
CREATE POLICY "Create org api keys"
ON public.api_keys
FOR INSERT
WITH CHECK (
  org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Revoke (soft delete) org API keys
CREATE POLICY "Revoke org api keys"
ON public.api_keys
FOR UPDATE
USING (
  org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);
```

### accounts

```sql
-- Standard org isolation
CREATE POLICY "Org isolation for accounts"
ON public.accounts
FOR ALL
USING (
  org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Allow insert from service (Edge Functions)
CREATE POLICY "Service role insert"
ON public.accounts
FOR INSERT
WITH CHECK (true);  -- Only service role can bypass RLS
```

### bank_statements

```sql
-- View org statements
CREATE POLICY "View org statements"
ON public.bank_statements
FOR SELECT
USING (
  org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Allow insert from service
CREATE POLICY "Service role insert"
ON public.bank_statements
FOR INSERT
WITH CHECK (true);
```

### transactions

```sql
-- View org transactions
CREATE POLICY "View org transactions"
ON public.transactions
FOR SELECT
USING (
  org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Allow category override by org users
CREATE POLICY "Update transaction category"
ON public.transactions
FOR UPDATE
USING (
  org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
)
WITH CHECK (
  org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Allow insert from service
CREATE POLICY "Service role insert"
ON public.transactions
FOR INSERT
WITH CHECK (true);
```

### categories

```sql
-- Everyone can view categories (reference data)
CREATE POLICY "View all categories"
ON public.categories
FOR SELECT
USING (true);

-- Only system can manage system categories
-- Custom categories would need org_id column (future feature)
```

### applications

```sql
-- View org applications
CREATE POLICY "View org applications"
ON public.applications
FOR SELECT
USING (
  org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Allow insert from service
CREATE POLICY "Service role insert"
ON public.applications
FOR INSERT
WITH CHECK (true);
```

### submission_metrics

```sql
-- View org metrics
CREATE POLICY "View org metrics"
ON public.submission_metrics
FOR SELECT
USING (
  submission_id IN (
    SELECT id FROM public.submissions
    WHERE org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  )
);
```

### webhooks

```sql
-- Full CRUD for org webhooks
CREATE POLICY "Manage org webhooks"
ON public.webhooks
FOR ALL
USING (
  org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);
```

### audit_log

```sql
-- View only for org audit log
CREATE POLICY "View org audit log"
ON public.audit_log
FOR SELECT
USING (
  org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Insert via trigger only (no direct insert policy)
```

---

## Service Role Bypass

Edge Functions that need to bypass RLS use the service role key:

```typescript
import { createClient } from '@supabase/supabase-js';

// Service role client bypasses RLS
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);
```

**Use Cases:**
- Document processing pipeline (classify, extract)
- Webhook delivery
- Background jobs
- Cross-org analytics

---

## Testing RLS Policies

See `/scripts/test-rls.sql` for comprehensive RLS tests.

Quick test pattern:

```sql
-- Set session to test user
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'user-uuid-here';

-- Try to access data
SELECT * FROM public.accounts;

-- Should only return data for user's org
```

---

## Security Considerations

1. **Never expose service role key** to clients
2. **Always use anon key** in frontend applications
3. **Validate org_id on insert** to prevent cross-tenant writes
4. **Use SECURITY DEFINER functions** carefully - they run with creator's permissions
5. **Audit log bypasses** should be minimal and logged

---

## Future Enhancements

1. **Role-Based Access Control (RBAC):**
   - Add roles table (admin, underwriter, viewer)
   - Modify policies to check role permissions

2. **Custom Categories:**
   - Add org_id to categories table
   - Allow orgs to define custom categories

3. **Sharing:**
   - Add sharing table for cross-org document sharing
   - Modify policies to include shared items

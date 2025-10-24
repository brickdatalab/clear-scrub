-- Purpose: Add missing tables/columns required by signup trigger
-- Dependencies: None (creates foundational tables)
-- Rationale: The handle_new_user() trigger references api_keys, audit_log tables
--            and organizations.email_address column which may not exist in fresh database
-- Impact: Enables successful user signup with automatic API key generation
-- Rollback: See ROLLBACK section at bottom of file

-- =============================================================================
-- SECTION 1: Create api_keys table
-- =============================================================================
-- Stores API keys for programmatic access to ClearScrub APIs
-- Each organization can have multiple API keys for different integrations

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_prefix TEXT NOT NULL,                    -- Format: "cs_live_" for display
  key_hash TEXT NOT NULL UNIQUE,               -- SHA-256 hash of full key
  name TEXT,                                   -- Optional human-readable name
  last_used_at TIMESTAMP,                      -- Track when key was last used
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP                         -- NULL = active, NOT NULL = revoked
);

-- Create index for org_id lookups (used by RLS policies)
CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON public.api_keys(org_id);

-- Enable Row Level Security
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own organization's API keys
CREATE POLICY IF NOT EXISTS "Users see own org api keys"
ON public.api_keys FOR SELECT
USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- RLS Policy: Users can insert API keys for their own organization
CREATE POLICY IF NOT EXISTS "Users insert own org api keys"
ON public.api_keys FOR INSERT
WITH CHECK (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- RLS Policy: Users can update their own organization's API keys
CREATE POLICY IF NOT EXISTS "Users update own org api keys"
ON public.api_keys FOR UPDATE
USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- RLS Policy: Users can delete their own organization's API keys
CREATE POLICY IF NOT EXISTS "Users delete own org api keys"
ON public.api_keys FOR DELETE
USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- =============================================================================
-- SECTION 2: Create audit_log table
-- =============================================================================
-- Compliance/audit tracking for all mutations (create, update, delete)
-- Required for enterprise security and regulatory compliance

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,  -- NULL if system action
  action TEXT NOT NULL,                                             -- e.g., "create_api_key", "revoke_api_key"
  table_name TEXT,                                                  -- Table affected (if applicable)
  record_id UUID,                                                   -- Record affected (if applicable)
  changes JSONB,                                                    -- Old/new values or metadata
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for org_id lookups (used by RLS policies)
CREATE INDEX IF NOT EXISTS idx_audit_log_org_id ON public.audit_log(org_id);

-- Create index for created_at (common query filter)
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own organization's audit logs
CREATE POLICY IF NOT EXISTS "Users see own org audit logs"
ON public.audit_log FOR SELECT
USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- RLS Policy: Users can insert audit logs for their own organization
CREATE POLICY IF NOT EXISTS "Users insert own org audit logs"
ON public.audit_log FOR INSERT
WITH CHECK (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- =============================================================================
-- SECTION 3: Add email_address column to organizations
-- =============================================================================
-- Stores organization's email address for ingestion routing
-- Format: org_{uuid}@underwrite.cleardata.io
-- Required by handle_new_user() trigger for automatic email assignment

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS email_address TEXT;

-- Create unique index to prevent duplicate email addresses
CREATE UNIQUE INDEX IF NOT EXISTS ux_organizations_email_address
ON public.organizations(email_address)
WHERE email_address IS NOT NULL;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Run these after migration to verify successful deployment:
--
-- 1. Verify api_keys table exists:
--    SELECT tablename FROM pg_tables WHERE tablename = 'api_keys';
--
-- 2. Verify audit_log table exists:
--    SELECT tablename FROM pg_tables WHERE tablename = 'audit_log';
--
-- 3. Verify email_address column exists:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'organizations' AND column_name = 'email_address';
--
-- 4. Verify RLS enabled:
--    SELECT tablename, rowsecurity FROM pg_tables
--    WHERE tablename IN ('api_keys', 'audit_log');
--
-- 5. Test signup flow:
--    -- Attempt signup via dashboard at https://dashboard.clearscrub.io/signup
--    -- Should complete without "relation does not exist" errors

-- =============================================================================
-- ROLLBACK PROCEDURE (DO NOT EXECUTE IN PRODUCTION)
-- =============================================================================
-- To reverse this migration, execute the following in order:
--
-- DROP POLICY IF EXISTS "Users delete own org api keys" ON public.api_keys;
-- DROP POLICY IF EXISTS "Users update own org api keys" ON public.api_keys;
-- DROP POLICY IF EXISTS "Users insert own org api keys" ON public.api_keys;
-- DROP POLICY IF EXISTS "Users see own org api keys" ON public.api_keys;
-- DROP INDEX IF EXISTS idx_api_keys_org_id;
-- DROP TABLE IF EXISTS public.api_keys CASCADE;
--
-- DROP POLICY IF EXISTS "Users insert own org audit logs" ON public.audit_log;
-- DROP POLICY IF EXISTS "Users see own org audit logs" ON public.audit_log;
-- DROP INDEX IF EXISTS idx_audit_log_created_at;
-- DROP INDEX IF EXISTS idx_audit_log_org_id;
-- DROP TABLE IF EXISTS public.audit_log CASCADE;
--
-- DROP INDEX IF EXISTS ux_organizations_email_address;
-- ALTER TABLE public.organizations DROP COLUMN IF EXISTS email_address;
--
-- WARNING: This will delete all API keys and audit log entries permanently.

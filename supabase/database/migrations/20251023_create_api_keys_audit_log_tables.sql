-- =============================================================================
-- Migration: Create api_keys and audit_log tables
-- Purpose: Fix missing schema causing signup failures
-- Date: 2025-10-23
-- =============================================================================

-- =============================================================================
-- SECTION 1: Create api_keys table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON public.api_keys(org_id);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users see own org api keys"
ON public.api_keys FOR SELECT
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY IF NOT EXISTS "Users insert own org api keys"
ON public.api_keys FOR INSERT
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY IF NOT EXISTS "Users update own org api keys"
ON public.api_keys FOR UPDATE
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY IF NOT EXISTS "Users delete own org api keys"
ON public.api_keys FOR DELETE
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- =============================================================================
-- SECTION 2: Create audit_log table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  changes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_id ON public.audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users see own org audit logs"
ON public.audit_log FOR SELECT
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY IF NOT EXISTS "Users insert own org audit logs"
ON public.audit_log FOR INSERT
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- =============================================================================
-- SECTION 3: Add email_address column to organizations
-- =============================================================================
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS email_address TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_organizations_email_address
ON public.organizations(email_address)
WHERE email_address IS NOT NULL;

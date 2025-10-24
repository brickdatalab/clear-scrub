-- Migration: Update Signup Trigger to Create Default API Key
-- Date: 2025-10-22
-- Purpose: Automatically generate a default API key when a user signs up
-- Dependencies:
--   - Requires api_keys table
--   - Requires audit_log table
--   - Requires pgcrypto extension
--   - Requires organizations.email_address column
-- Rationale:
--   - Users need immediate API access after signup
--   - Default API key streamlines onboarding
--   - Audit log provides compliance tracking
-- Impact:
--   - All future signups will get a default API key
--   - Existing users NOT affected (no retroactive key generation)
--   - API key hash stored securely, raw key NOT retrievable from database
--   - User must access key via separate API endpoint (future Phase 2B)

-- UP: Deploy
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  api_key_raw TEXT;
  api_key_hash TEXT;
  api_key_prefix TEXT;
BEGIN
  -- Generate organization ID and name
  new_org_id := gen_random_uuid();
  org_name := 'Organization ' || NEW.email;

  -- Create organization with email address
  INSERT INTO public.organizations (id, name, email_address, created_at)
  VALUES (new_org_id, org_name, NEW.email, NOW());

  -- Create profile with org_id
  INSERT INTO public.profiles (id, email, org_id, created_at)
  VALUES (NEW.id, NEW.email, new_org_id, NOW());

  -- Generate default API key
  -- Format: cs_live_{48 random hex chars}
  api_key_raw := 'cs_live_' || encode(gen_random_bytes(24), 'hex');
  api_key_prefix := substring(api_key_raw from 1 for 12) || '...';

  -- Hash the API key (using SHA-256 for secure storage)
  api_key_hash := encode(digest(api_key_raw, 'sha256'), 'hex');

  -- Insert default API key
  INSERT INTO public.api_keys (
    id,
    org_id,
    created_by_user_id,
    key_name,
    key_hash,
    prefix,
    is_default,
    is_active,
    created_at
  ) VALUES (
    gen_random_uuid(),
    new_org_id,
    NEW.id,
    'Default API Key',
    api_key_hash,
    api_key_prefix,
    true,
    true,
    NOW()
  );

  -- Log to audit_log (signup event)
  INSERT INTO public.audit_log (
    id,
    org_id,
    user_id,
    action,
    resource_type,
    resource_id,
    new_values,
    metadata,
    timestamp
  ) VALUES (
    gen_random_uuid(),
    new_org_id,
    NEW.id,
    'created',
    'organization',
    new_org_id,
    jsonb_build_object(
      'org_name', org_name,
      'user_email', NEW.email
    ),
    jsonb_build_object(
      'signup_method', 'email',
      'default_api_key_created', true
    ),
    NOW()
  );

  RETURN NEW;
END;
$function$;

-- Verification Queries
-- Run these after deployment to confirm success:

-- 1. Verify trigger function was updated
SELECT
  proname as function_name,
  CASE
    WHEN pg_get_functiondef(oid) LIKE '%api_key_raw%' THEN 'Updated with API key generation'
    ELSE 'Old version without API key'
  END as status
FROM pg_proc
WHERE proname = 'handle_new_user';

-- 2. Test API key generation format (sample)
SELECT 'cs_live_' || encode(gen_random_bytes(24), 'hex') as sample_api_key;

-- 3. After a new signup, verify default API key was created
-- Replace <user_email> with test user email
SELECT
  ak.id,
  ak.key_name,
  ak.prefix,
  ak.is_default,
  ak.is_active,
  ak.created_at,
  o.email_address as org_email
FROM api_keys ak
JOIN organizations o ON ak.org_id = o.id
WHERE o.email_address = '<user_email>'
  AND ak.is_default = true;

-- 4. Verify audit log entry was created
-- Replace <user_email> with test user email
SELECT
  al.action,
  al.resource_type,
  al.new_values,
  al.metadata,
  al.timestamp
FROM audit_log al
JOIN organizations o ON al.org_id = o.id
WHERE o.email_address = '<user_email>'
  AND al.action = 'created'
  AND al.resource_type = 'organization'
ORDER BY al.timestamp DESC
LIMIT 1;

-- DOWN: Rollback
-- Revert to previous version without API key generation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id UUID;
  org_name TEXT;
BEGIN
  -- Generate organization ID and name
  new_org_id := gen_random_uuid();
  org_name := 'Organization ' || NEW.email;

  -- Create organization with email address
  INSERT INTO public.organizations (id, name, email_address, created_at)
  VALUES (new_org_id, org_name, NEW.email, NOW());

  -- Create profile with org_id
  INSERT INTO public.profiles (id, email, org_id, created_at)
  VALUES (NEW.id, NEW.email, new_org_id, NOW());

  RETURN NEW;
END;
$function$;

-- IMPORTANT NOTES FOR ROLLBACK:
-- 1. Rollback does NOT delete API keys created during updated trigger period
-- 2. Existing default API keys remain in database and continue to function
-- 3. To clean up API keys created during this period (if needed):
--    DELETE FROM api_keys
--    WHERE is_default = true
--      AND key_name = 'Default API Key'
--      AND created_at >= '2025-10-22 [deployment_timestamp]';
-- 4. Audit log entries remain for compliance (DO NOT delete unless required)

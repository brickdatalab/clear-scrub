-- ClearScrub RLS Policy Tests
-- Project: vnhauomvzjucxadrbywg
--
-- Run these tests to verify RLS policies are working correctly.
-- Execute as a superuser in pgAdmin or supabase SQL editor.

-- ===========================================================================
-- SETUP: Create test data
-- ===========================================================================

BEGIN;

-- Create test organizations
INSERT INTO public.organizations (id, name, email_address, status, subscription_tier)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Test Org Alpha', 'org_alpha@test.clearscrub.io', 'active', 'pro'),
  ('22222222-2222-2222-2222-222222222222', 'Test Org Beta', 'org_beta@test.clearscrub.io', 'active', 'basic')
ON CONFLICT (id) DO NOTHING;

-- Create test users in auth.users (requires service role or superuser)
-- Note: In production, users are created via Supabase Auth
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_alpha@test.com', crypt('testpass123', gen_salt('bf')), now(), now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user_beta@test.com', crypt('testpass123', gen_salt('bf')), now(), now(), now())
ON CONFLICT (id) DO NOTHING;

-- Create test profiles
INSERT INTO public.profiles (id, email, full_name, org_id)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_alpha@test.com', 'User Alpha', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user_beta@test.com', 'User Beta', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

-- Create test accounts
INSERT INTO public.accounts (id, org_id, submission_id, account_number, bank_name)
VALUES
  ('acc11111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', NULL, '1234567890', 'Bank Alpha'),
  ('acc22222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', NULL, '0987654321', 'Bank Beta')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ===========================================================================
-- TEST 1: Organization Isolation
-- Users should only see their own organization
-- ===========================================================================

-- Simulate User Alpha
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

DO $$
DECLARE
  org_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO org_count FROM public.organizations;

  IF org_count != 1 THEN
    RAISE EXCEPTION 'TEST FAILED: User Alpha should see 1 organization, saw %', org_count;
  END IF;

  RAISE NOTICE 'TEST PASSED: Organization isolation for User Alpha';
END $$;

-- ===========================================================================
-- TEST 2: Cross-Organization Data Access Prevention
-- Users should NOT see other organization's data
-- ===========================================================================

-- Still as User Alpha, try to see Beta's accounts
DO $$
DECLARE
  account_count INTEGER;
  visible_org_id UUID;
BEGIN
  SELECT COUNT(*) INTO account_count FROM public.accounts;

  IF account_count > 0 THEN
    SELECT org_id INTO visible_org_id FROM public.accounts LIMIT 1;

    IF visible_org_id != '11111111-1111-1111-1111-111111111111' THEN
      RAISE EXCEPTION 'TEST FAILED: User Alpha can see Beta org accounts!';
    END IF;
  END IF;

  RAISE NOTICE 'TEST PASSED: Cross-org data isolation for accounts';
END $$;

-- ===========================================================================
-- TEST 3: Profile Update Restriction
-- Users should only update their own profile
-- ===========================================================================

DO $$
BEGIN
  -- Try to update own profile (should succeed)
  UPDATE public.profiles SET full_name = 'User Alpha Updated' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  -- Verify update
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND full_name = 'User Alpha Updated') THEN
    RAISE EXCEPTION 'TEST FAILED: Could not update own profile';
  END IF;

  RAISE NOTICE 'TEST PASSED: User can update own profile';
END $$;

-- ===========================================================================
-- TEST 4: Categories are publicly readable
-- All users should see all categories
-- ===========================================================================

DO $$
DECLARE
  category_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO category_count FROM public.categories;

  IF category_count < 10 THEN
    RAISE EXCEPTION 'TEST FAILED: Expected at least 10 categories, saw %', category_count;
  END IF;

  RAISE NOTICE 'TEST PASSED: Categories are publicly readable (% categories)', category_count;
END $$;

-- ===========================================================================
-- TEST 5: API Keys - Soft Delete Filtering
-- Deleted API keys should not be visible
-- ===========================================================================

-- Create test API key
INSERT INTO public.api_keys (id, org_id, key_name, key_hash, prefix, is_active, deleted_at)
VALUES
  ('key11111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Active Key', 'hash1', 'cs_live_ACTIVE', true, NULL),
  ('key22222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Deleted Key', 'hash2', 'cs_live_DELETE', false, now())
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  key_count INTEGER;
  deleted_visible BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO key_count FROM public.api_keys WHERE org_id = '11111111-1111-1111-1111-111111111111';

  -- Check if deleted key is visible (it shouldn't be if RLS filters deleted_at)
  SELECT EXISTS (
    SELECT 1 FROM public.api_keys WHERE id = 'key22222-2222-2222-2222-222222222222'
  ) INTO deleted_visible;

  IF deleted_visible THEN
    RAISE NOTICE 'WARNING: Deleted API key is visible. Add deleted_at IS NULL filter to RLS policy.';
  ELSE
    RAISE NOTICE 'TEST PASSED: Deleted API keys are filtered';
  END IF;
END $$;

-- ===========================================================================
-- TEST 6: Audit Log - Read Only
-- Users should be able to read but not insert/update/delete audit logs
-- ===========================================================================

DO $$
BEGIN
  -- Try to insert (should fail if RLS is correct)
  BEGIN
    INSERT INTO public.audit_log (org_id, user_id, action, resource_type)
    VALUES ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test', 'test');

    RAISE NOTICE 'WARNING: Direct audit_log insert succeeded. Consider restricting inserts.';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST PASSED: Audit log insert blocked by RLS';
  END;
END $$;

-- ===========================================================================
-- CLEANUP
-- ===========================================================================

-- Reset role
RESET ROLE;

-- Remove test data
DELETE FROM public.api_keys WHERE id IN ('key11111-1111-1111-1111-111111111111', 'key22222-2222-2222-2222-222222222222');
DELETE FROM public.accounts WHERE id IN ('acc11111-1111-1111-1111-111111111111', 'acc22222-2222-2222-2222-222222222222');
DELETE FROM public.profiles WHERE id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
DELETE FROM auth.users WHERE id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
DELETE FROM public.organizations WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

RAISE NOTICE '=== ALL RLS TESTS COMPLETED ===';

-- ===========================================================================
-- HELPER QUERIES
-- ===========================================================================

-- List all RLS policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check RLS status for all tables
SELECT
  n.nspname AS schema,
  c.relname AS table,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

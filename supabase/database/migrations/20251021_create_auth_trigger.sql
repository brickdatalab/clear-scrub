-- =====================================================
-- Migration: 20251021_create_auth_trigger
-- Created: October 21, 2025
-- Author: ClearScrub Infrastructure Team
-- =====================================================
-- Purpose: Create authentication trigger to automatically assign org_id
--          during user signup process
--
-- Dependencies:
--   - auth.users table (Supabase Auth)
--   - public.organizations table
--   - public.profiles table
--
-- Rationale:
--   When a user signs up via Supabase Auth, they are created in auth.users
--   but do not automatically get an organization or profile. This trigger
--   ensures that:
--   1. A new organization is created for each new user
--   2. A profile is created linking the user to their organization
--   3. Multi-tenancy (org_id) is established from the start
--
-- Impact:
--   - Runs AFTER INSERT on auth.users (does not block signup)
--   - Creates 2 additional rows per signup (1 organization + 1 profile)
--   - Required for RLS policies to function correctly
--
-- Security:
--   - Function uses SECURITY DEFINER to bypass RLS during creation
--   - search_path locked to 'public' to prevent schema injection
--
-- WARNING: Do not drop this trigger without a replacement mechanism,
--          or new signups will fail to get org_id assignment.
-- =====================================================

-- =====================================================
-- FUNCTION: handle_new_user()
-- =====================================================
-- Trigger function that creates organization and profile for new users
--
-- Execution Context: AFTER INSERT on auth.users
-- Returns: trigger (modified NEW record)
-- Security: DEFINER (runs with function owner's privileges)
-- =====================================================

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

-- =====================================================
-- TRIGGER: on_auth_user_created
-- =====================================================
-- Executes handle_new_user() after each user signup
--
-- Timing: AFTER INSERT (non-blocking)
-- Scope: FOR EACH ROW (runs once per new user)
-- =====================================================

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- VERIFICATION QUERIES (Run after deployment)
-- =====================================================
-- Verify function exists:
-- SELECT proname, prosrc FROM pg_proc WHERE proname = 'handle_new_user';

-- Verify trigger exists:
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- Test trigger (requires test user creation):
-- Sign up a new user via Supabase Auth, then verify:
-- SELECT * FROM profiles WHERE id = '<new_user_id>';
-- SELECT * FROM organizations WHERE id = (SELECT org_id FROM profiles WHERE id = '<new_user_id>');
-- =====================================================

-- =====================================================
-- ROLLBACK PROCEDURE (See ROLLBACK.md)
-- =====================================================
-- To reverse this migration:
-- 1. DROP TRIGGER on_auth_user_created ON auth.users;
-- 2. DROP FUNCTION public.handle_new_user();
--
-- WARNING: Rolling back will break new user signups. Existing users
--          will continue to work, but new signups will not get org_id
--          assigned, causing RLS policy failures.
-- =====================================================

/*
 * Migration: Refactor api_keys schema for organization-level API keys
 * Created: 2025-10-22
 * Author: Claude Code
 *
 * PURPOSE:
 * - Add metadata JSONB column to organizations for flexible attributes
 * - Refactor api_keys from user-level (user_id) to organization-level (org_id)
 * - Add new columns: org_id, created_by_user_id, is_default, deleted_at
 * - Update RLS policies to use org_id instead of user_id
 *
 * DEPENDENCIES:
 * - organizations table must exist
 * - profiles table must exist with org_id column
 * - auth.users table must exist
 *
 * RATIONALE:
 * - API keys should be shared at organization level, not per user
 * - Allows multiple users in same org to use same API keys
 * - Tracks which user created the key (audit trail)
 * - Supports soft delete (deleted_at) and default key marking
 *
 * IMPACT:
 * - BREAKING CHANGE: Drops user_id column from api_keys
 * - No data loss: Currently 0 api_keys in database
 * - RLS policies updated to match new schema
 * - Future api_keys will be org-scoped, not user-scoped
 *
 * ROLLBACK:
 * - Can restore schema but CANNOT restore user_id column after drop
 * - See ROLLBACK.md for detailed procedure
 * - Backup recommended before applying
 */

-- ============================================================================
-- STEP 1: Add metadata to organizations
-- ============================================================================

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organizations.metadata IS
'Flexible storage for org attributes (industry, size, region, custom fields, etc). Example: {"industry": "construction", "size": "50-200", "region": "northeast"}';

-- ============================================================================
-- STEP 2: Add new columns to api_keys (before dropping user_id)
-- ============================================================================

ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS org_id uuid,
ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN api_keys.org_id IS
'Organization this API key belongs to (replaces user_id for org-level sharing)';

COMMENT ON COLUMN api_keys.created_by_user_id IS
'User who created this API key (audit trail, nullable if user deleted)';

COMMENT ON COLUMN api_keys.is_default IS
'Whether this is the default API key for the organization';

COMMENT ON COLUMN api_keys.deleted_at IS
'Soft delete timestamp (NULL = active, NOT NULL = deleted)';

-- ============================================================================
-- STEP 3: Migrate existing api_keys data (user_id → org_id)
-- ============================================================================
-- NOTE: Currently 0 api_keys exist, so this UPDATE will affect 0 rows
-- Kept for idempotency in case migration is re-run after keys created

UPDATE api_keys
SET
  org_id = (SELECT org_id FROM profiles WHERE profiles.id = api_keys.user_id),
  created_by_user_id = user_id
WHERE org_id IS NULL AND user_id IS NOT NULL;

-- Verification: Check if any api_keys failed to migrate
DO $$
DECLARE
  unmigrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmigrated_count
  FROM api_keys
  WHERE org_id IS NULL AND user_id IS NOT NULL;

  IF unmigrated_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % api_keys have user_id but no matching profile', unmigrated_count;
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Make org_id NOT NULL and add foreign key constraints
-- ============================================================================

ALTER TABLE api_keys
ALTER COLUMN org_id SET NOT NULL;

-- Add foreign key constraints
ALTER TABLE api_keys
ADD CONSTRAINT fk_api_keys_org
  FOREIGN KEY (org_id)
  REFERENCES organizations(id)
  ON DELETE CASCADE;

ALTER TABLE api_keys
ADD CONSTRAINT fk_api_keys_creator
  FOREIGN KEY (created_by_user_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

COMMENT ON CONSTRAINT fk_api_keys_org ON api_keys IS
'Cascade delete: When org deleted, all its API keys are deleted';

COMMENT ON CONSTRAINT fk_api_keys_creator ON api_keys IS
'Set NULL on delete: When creator user deleted, key remains but creator info lost';

-- ============================================================================
-- STEP 5: Drop old RLS policies BEFORE dropping user_id column
-- ============================================================================
-- CRITICAL: Policies must be dropped before column to avoid dependency errors

DROP POLICY IF EXISTS "Users view own api_keys" ON api_keys;
DROP POLICY IF EXISTS "Users insert own api_keys" ON api_keys;
DROP POLICY IF EXISTS "Users update own api_keys" ON api_keys;
DROP POLICY IF EXISTS "Users delete own api_keys" ON api_keys;

-- ============================================================================
-- STEP 6: Drop old user_id column (BREAKING CHANGE - IRREVERSIBLE)
-- ============================================================================

ALTER TABLE api_keys DROP COLUMN IF EXISTS user_id;

-- ============================================================================
-- STEP 7: Create new org-based RLS policies
-- ============================================================================

-- Create new org-based policies
CREATE POLICY "Users view own org api_keys"
  ON api_keys FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users insert own org api_keys"
  ON api_keys FOR INSERT
  WITH CHECK (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users update own org api_keys"
  ON api_keys FOR UPDATE
  USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users delete own org api_keys"
  ON api_keys FOR DELETE
  USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

COMMENT ON POLICY "Users view own org api_keys" ON api_keys IS
'Users can view all API keys for their organization (org-level sharing)';

COMMENT ON POLICY "Users insert own org api_keys" ON api_keys IS
'Users can create new API keys for their organization';

COMMENT ON POLICY "Users update own org api_keys" ON api_keys IS
'Users can update API keys for their organization (e.g., mark as default, soft delete)';

COMMENT ON POLICY "Users delete own org api_keys" ON api_keys IS
'Users can delete API keys for their organization';

-- ============================================================================
-- VERIFICATION QUERIES (Run after migration completes)
-- ============================================================================

-- 1. Check metadata column exists on organizations
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'organizations' AND column_name = 'metadata';

-- 2. Check api_keys new schema
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
-- WHERE table_name = 'api_keys'
-- ORDER BY ordinal_position;

-- 3. Verify user_id is GONE (should return 0 rows)
-- SELECT COUNT(*) as should_be_zero FROM information_schema.columns
-- WHERE table_name = 'api_keys' AND column_name = 'user_id';

-- 4. Check all existing api_keys have org_id populated
-- SELECT COUNT(*) as total_keys, COUNT(org_id) as keys_with_org
-- FROM api_keys;

-- 5. Verify RLS policies exist
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'api_keys';

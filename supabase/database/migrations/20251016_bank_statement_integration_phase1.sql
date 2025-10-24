-- =====================================================
-- Migration: Bank Statement Integration Phase 1 - Core Schema Enhancements
-- Created: 2025-10-16
-- Project: ClearScrub (vnhauomvzjucxadrbywg)
-- Phase: 1 - Part 1 (Banks Only, No Applications)
-- =====================================================
--
-- This migration incorporates all critical fixes identified through external AI validation:
-- - FIX #1: MV refresh via RPC functions (NO triggers using CONCURRENTLY)
-- - FIX #8: Add deposit_count column to statements
-- - FIX #10: Entity normalization support for companies and accounts
-- - FIX #11: Composite indexes for performance optimization
--
-- IMPORTANT: Execute this migration in a single transaction for atomic changes.
-- =====================================================

BEGIN;

-- =====================================================
-- SECTION 1: SCHEMA CHANGES - STATEMENTS TABLE
-- =====================================================

-- FIX #8: Add deposit_count column to statements table
-- Purpose: Track number of deposits per statement for dashboard metrics
ALTER TABLE statements
ADD COLUMN IF NOT EXISTS deposit_count INTEGER DEFAULT 0;

COMMENT ON COLUMN statements.deposit_count IS 'Count of deposit transactions (amount > 0) in this statement period. Used for revenue analysis.';

-- Add unique constraint to prevent duplicate statements for same account/period
-- This ensures idempotency when processing statements multiple times
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ux_statements_account_period'
    ) THEN
        ALTER TABLE statements
        ADD CONSTRAINT ux_statements_account_period
        UNIQUE (account_id, statement_period_start, statement_period_end);
    END IF;
END $$;

COMMENT ON CONSTRAINT ux_statements_account_period ON statements IS 'Ensures one statement per account per period. Prevents duplicate statement creation during reprocessing.';

-- =====================================================
-- SECTION 2: SCHEMA CHANGES - COMPANIES TABLE
-- =====================================================

-- FIX #10: Add normalized_legal_name for entity resolution
-- Purpose: Enable fuzzy matching of company names despite variations in punctuation, case, legal suffixes
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS normalized_legal_name TEXT;

COMMENT ON COLUMN companies.normalized_legal_name IS 'Normalized version of legal_name (uppercase, no punctuation, legal suffixes removed). Used for entity resolution to prevent duplicate companies.';

-- Create unique index on org_id + normalized_legal_name
-- This prevents duplicate companies within an organization
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'ux_companies_org_normalized'
    ) THEN
        CREATE UNIQUE INDEX ux_companies_org_normalized
        ON companies(org_id, normalized_legal_name)
        WHERE normalized_legal_name IS NOT NULL;
    END IF;
END $$;

COMMENT ON INDEX ux_companies_org_normalized IS 'Ensures one company per normalized name per organization. Enables entity resolution for name variations.';

-- =====================================================
-- SECTION 3: SCHEMA CHANGES - ACCOUNTS TABLE
-- =====================================================

-- FIX #10: Add account_number_hash for secure account matching
-- Purpose: Enable account deduplication without storing full account numbers (PCI compliance)
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS account_number_hash TEXT;

COMMENT ON COLUMN accounts.account_number_hash IS 'SHA-256 hash of normalized account number (digits only). Used for entity resolution to prevent duplicate accounts while protecting PII.';

-- Create unique index on account_number_hash
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'ux_accounts_number_hash'
    ) THEN
        CREATE UNIQUE INDEX ux_accounts_number_hash
        ON accounts(account_number_hash)
        WHERE account_number_hash IS NOT NULL;
    END IF;
END $$;

COMMENT ON INDEX ux_accounts_number_hash IS 'Ensures one account per hashed account number globally. Enables secure entity resolution.';

-- =====================================================
-- SECTION 4: ENTITY RESOLUTION - COMPANY ALIASES TABLE
-- =====================================================

-- Create company_aliases table for manual alias management
-- Purpose: Allow users to manually link company name variations
CREATE TABLE IF NOT EXISTS company_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    normalized_alias_name TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE company_aliases IS 'Manual aliases for company names. Allows users to map known variations (e.g., DBA names, abbreviations) to canonical companies.';

-- Create unique index on normalized alias to prevent duplicate aliases
CREATE UNIQUE INDEX IF NOT EXISTS ux_company_aliases_normalized
ON company_aliases(normalized_alias_name);

COMMENT ON INDEX ux_company_aliases_normalized IS 'Ensures one alias per normalized name globally. Prevents conflicting aliases.';

-- Create index on company_id for fast alias lookups
CREATE INDEX IF NOT EXISTS idx_company_aliases_company_id
ON company_aliases(company_id);

-- Enable RLS on company_aliases
ALTER TABLE company_aliases ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view aliases for companies in their org
CREATE POLICY IF NOT EXISTS "Users view own org company aliases"
ON company_aliases
FOR SELECT
USING (
    company_id IN (
        SELECT id FROM companies
        WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    )
);

-- RLS Policy: Users can insert aliases for companies in their org
CREATE POLICY IF NOT EXISTS "Users insert own org company aliases"
ON company_aliases
FOR INSERT
WITH CHECK (
    company_id IN (
        SELECT id FROM companies
        WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    )
);

-- RLS Policy: Users can delete aliases for companies in their org
CREATE POLICY IF NOT EXISTS "Users delete own org company aliases"
ON company_aliases
FOR DELETE
USING (
    company_id IN (
        SELECT id FROM companies
        WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    )
);

-- Add updated_at trigger for company_aliases
DROP TRIGGER IF EXISTS update_company_aliases_updated_at ON company_aliases;
CREATE TRIGGER update_company_aliases_updated_at
    BEFORE UPDATE ON company_aliases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- SECTION 5: PERFORMANCE OPTIMIZATION - COMPOSITE INDEXES
-- =====================================================

-- FIX #11: Create composite index on statements for common query pattern
-- Pattern: SELECT * FROM statements WHERE company_id = ? ORDER BY statement_period_start DESC
CREATE INDEX IF NOT EXISTS idx_statements_company_period
ON statements(company_id, statement_period_start DESC);

COMMENT ON INDEX idx_statements_company_period IS 'Optimizes dashboard queries fetching statements for a company ordered by period. Enables index-only scans for temporal queries.';

-- FIX #11: Create unique composite index on accounts for deduplication
-- Pattern: Check if account exists for company + bank + last4 digits
CREATE UNIQUE INDEX IF NOT EXISTS ux_accounts_company_bank_last4
ON accounts(company_id, bank_name, account_number_masked)
WHERE account_number_masked IS NOT NULL;

COMMENT ON INDEX ux_accounts_company_bank_last4 IS 'Ensures one account per company/bank/last4 combination. Enables fast account lookups during statement ingestion.';

-- =====================================================
-- SECTION 6: MATERIALIZED VIEWS - ACCOUNT MONTHLY ROLLUPS
-- =====================================================

-- Drop existing materialized view if it exists (idempotent)
DROP MATERIALIZED VIEW IF EXISTS account_monthly_rollups CASCADE;

-- Create account_monthly_rollups with deposit_count aggregation (FIX #8)
CREATE MATERIALIZED VIEW account_monthly_rollups AS
SELECT
    account_id,
    company_id,
    date_trunc('month', statement_period_start::timestamptz)::date AS month_start,
    MAX(statement_period_end) AS month_end,
    SUM(total_deposits) AS total_deposits,
    SUM(total_withdrawals) AS total_withdrawals,
    AVG(average_daily_balance) AS average_daily_balance,
    MAX(closing_balance) AS ending_balance,
    SUM(true_revenue) AS true_revenue,
    SUM(true_revenue_count) AS true_revenue_count,
    SUM(deposit_count) AS deposit_count, -- FIX #8: Include deposit_count aggregation
    SUM(negative_balance_days) AS negative_balance_days,
    SUM(nsf_count) AS nsf_count,
    SUM(nsf_total_amount) AS nsf_total_amount,
    SUM(transaction_count) AS transaction_count,
    MAX(largest_deposit) AS largest_deposit,
    MAX(largest_withdrawal) AS largest_withdrawal,
    MAX(created_at) AS last_updated
FROM statements
GROUP BY account_id, company_id, date_trunc('month', statement_period_start::timestamptz);

COMMENT ON MATERIALIZED VIEW account_monthly_rollups IS 'Pre-aggregated monthly metrics per account. Refreshed via RPC function after statement changes. Includes deposit_count for revenue analysis.';

-- Create UNIQUE index required for CONCURRENTLY refresh (FIX #1)
CREATE UNIQUE INDEX idx_account_monthly_rollups_lookup
ON account_monthly_rollups (account_id, month_start);

COMMENT ON INDEX idx_account_monthly_rollups_lookup IS 'Required for REFRESH MATERIALIZED VIEW CONCURRENTLY. Ensures one row per account per month.';

-- =====================================================
-- SECTION 7: MATERIALIZED VIEWS - COMPANY MONTHLY ROLLUPS
-- =====================================================

-- Create company_monthly_rollups (aggregates from account_monthly_rollups)
DROP MATERIALIZED VIEW IF EXISTS company_monthly_rollups CASCADE;

CREATE MATERIALIZED VIEW company_monthly_rollups AS
SELECT
    company_id,
    month_start,
    MAX(month_end) AS month_end,
    COUNT(DISTINCT account_id) AS account_count,
    SUM(total_deposits) AS total_deposits,
    SUM(total_withdrawals) AS total_withdrawals,
    AVG(average_daily_balance) AS average_daily_balance,
    SUM(ending_balance) AS total_ending_balance,
    SUM(true_revenue) AS true_revenue,
    SUM(true_revenue_count) AS true_revenue_count,
    SUM(deposit_count) AS deposit_count, -- FIX #8: Include deposit_count aggregation
    SUM(negative_balance_days) AS negative_balance_days,
    SUM(nsf_count) AS nsf_count,
    SUM(nsf_total_amount) AS nsf_total_amount,
    SUM(transaction_count) AS transaction_count,
    MAX(largest_deposit) AS largest_deposit,
    MAX(largest_withdrawal) AS largest_withdrawal,
    MAX(last_updated) AS last_updated
FROM account_monthly_rollups
GROUP BY company_id, month_start;

COMMENT ON MATERIALIZED VIEW company_monthly_rollups IS 'Pre-aggregated monthly metrics per company (rolls up from account_monthly_rollups). Refreshed via RPC function.';

-- Create UNIQUE index required for CONCURRENTLY refresh (FIX #1)
CREATE UNIQUE INDEX idx_company_monthly_rollups_lookup
ON company_monthly_rollups (company_id, month_start);

COMMENT ON INDEX idx_company_monthly_rollups_lookup IS 'Required for REFRESH MATERIALIZED VIEW CONCURRENTLY. Ensures one row per company per month.';

-- =====================================================
-- SECTION 8: MATERIALIZED VIEW REFRESH - RPC FUNCTIONS
-- =====================================================

-- FIX #1: DO NOT create database triggers for MV refresh
-- PostgreSQL cannot use CONCURRENTLY in trigger context
-- Instead, create RPC functions that Edge Functions will call

-- Drop existing trigger if it exists (cleanup from old approach)
DROP TRIGGER IF EXISTS trigger_refresh_monthly_rollups ON statements;
DROP FUNCTION IF EXISTS trigger_refresh_monthly_rollups();

-- Create RPC function to refresh account_monthly_rollups
CREATE OR REPLACE FUNCTION refresh_account_rollups_concurrent()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Refresh account_monthly_rollups without table locks
    REFRESH MATERIALIZED VIEW CONCURRENTLY account_monthly_rollups;

    RAISE NOTICE 'account_monthly_rollups refreshed at %', NOW();
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to refresh account_monthly_rollups: %', SQLERRM;
        -- Don't raise error - allow ingestion to continue even if MV refresh fails
END;
$$;

COMMENT ON FUNCTION refresh_account_rollups_concurrent() IS 'Refreshes account_monthly_rollups materialized view using CONCURRENTLY (no table locks). Called by Edge Functions after statement insert/update.';

-- Create RPC function to refresh company_monthly_rollups
CREATE OR REPLACE FUNCTION refresh_company_rollups_concurrent()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Refresh company_monthly_rollups without table locks
    REFRESH MATERIALIZED VIEW CONCURRENTLY company_monthly_rollups;

    RAISE NOTICE 'company_monthly_rollups refreshed at %', NOW();
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to refresh company_monthly_rollups: %', SQLERRM;
        -- Don't raise error - allow ingestion to continue even if MV refresh fails
END;
$$;

COMMENT ON FUNCTION refresh_company_rollups_concurrent() IS 'Refreshes company_monthly_rollups materialized view using CONCURRENTLY (no table locks). Called by Edge Functions after statement insert/update. Must be called AFTER refresh_account_rollups_concurrent().';

-- Create convenience function to refresh both MVs in sequence
CREATE OR REPLACE FUNCTION refresh_all_rollups_concurrent()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Refresh account rollups first (company rollups depend on it)
    PERFORM refresh_account_rollups_concurrent();

    -- Then refresh company rollups
    PERFORM refresh_company_rollups_concurrent();

    RAISE NOTICE 'All materialized views refreshed at %', NOW();
END;
$$;

COMMENT ON FUNCTION refresh_all_rollups_concurrent() IS 'Convenience function to refresh both account_monthly_rollups and company_monthly_rollups in correct order. Use this from Edge Functions.';

-- =====================================================
-- SECTION 9: MIGRATION VALIDATION
-- =====================================================

-- Validate that all new columns exist
DO $$
BEGIN
    -- Check statements.deposit_count
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'statements' AND column_name = 'deposit_count'
    ) THEN
        RAISE EXCEPTION 'Migration failed: statements.deposit_count column not created';
    END IF;

    -- Check companies.normalized_legal_name
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'companies' AND column_name = 'normalized_legal_name'
    ) THEN
        RAISE EXCEPTION 'Migration failed: companies.normalized_legal_name column not created';
    END IF;

    -- Check accounts.account_number_hash
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'account_number_hash'
    ) THEN
        RAISE EXCEPTION 'Migration failed: accounts.account_number_hash column not created';
    END IF;

    -- Check company_aliases table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'company_aliases'
    ) THEN
        RAISE EXCEPTION 'Migration failed: company_aliases table not created';
    END IF;

    -- Check materialized views exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE matviewname = 'account_monthly_rollups'
    ) THEN
        RAISE EXCEPTION 'Migration failed: account_monthly_rollups materialized view not created';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE matviewname = 'company_monthly_rollups'
    ) THEN
        RAISE EXCEPTION 'Migration failed: company_monthly_rollups materialized view not created';
    END IF;

    -- Check RPC functions exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'refresh_account_rollups_concurrent'
    ) THEN
        RAISE EXCEPTION 'Migration failed: refresh_account_rollups_concurrent function not created';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'refresh_company_rollups_concurrent'
    ) THEN
        RAISE EXCEPTION 'Migration failed: refresh_company_rollups_concurrent function not created';
    END IF;

    RAISE NOTICE '✓ Migration validation passed - all schema changes applied successfully';
END $$;

COMMIT;

-- =====================================================
-- POST-MIGRATION NOTES
-- =====================================================
--
-- REQUIRED ACTIONS AFTER MIGRATION:
--
-- 1. Verify NO database triggers exist for MV refresh:
--    SELECT * FROM pg_trigger WHERE tgname LIKE '%refresh%';
--    Expected: No results (all MV refresh triggers removed)
--
-- 2. Verify RPC functions exist and are callable:
--    SELECT proname, proowner::regrole FROM pg_proc WHERE proname LIKE '%rollups%';
--    Expected: 3 functions (refresh_account_rollups_concurrent, refresh_company_rollups_concurrent, refresh_all_rollups_concurrent)
--
-- 3. Test RPC function execution:
--    SELECT refresh_all_rollups_concurrent();
--    Expected: Success message
--
-- 4. Verify unique indexes on materialized views:
--    \d+ account_monthly_rollups
--    \d+ company_monthly_rollups
--    Expected: Each has a UNIQUE index (required for CONCURRENTLY)
--
-- 5. Update Edge Functions to call RPC after statement insert:
--    await supabaseAdmin.rpc('refresh_all_rollups_concurrent')
--
-- 6. Test entity resolution:
--    - Insert company with name "H2 Build, INC."
--    - Insert company with name "H2 BUILD LLC"
--    - Verify both resolve to same company via normalized_legal_name
--
-- 7. Test account deduplication:
--    - Insert account with number "3618-057-067"
--    - Insert account with number "3618057067"
--    - Verify both resolve to same account via account_number_hash
--
-- =====================================================
-- ROLLBACK SCRIPT (if needed)
-- =====================================================
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS refresh_all_rollups_concurrent();
-- DROP FUNCTION IF EXISTS refresh_company_rollups_concurrent();
-- DROP FUNCTION IF EXISTS refresh_account_rollups_concurrent();
-- DROP MATERIALIZED VIEW IF EXISTS company_monthly_rollups CASCADE;
-- DROP MATERIALIZED VIEW IF EXISTS account_monthly_rollups CASCADE;
-- DROP INDEX IF EXISTS ux_accounts_company_bank_last4;
-- DROP INDEX IF EXISTS idx_statements_company_period;
-- DROP TABLE IF EXISTS company_aliases CASCADE;
-- ALTER TABLE accounts DROP COLUMN IF EXISTS account_number_hash;
-- ALTER TABLE companies DROP COLUMN IF EXISTS normalized_legal_name;
-- ALTER TABLE statements DROP CONSTRAINT IF EXISTS ux_statements_account_period;
-- ALTER TABLE statements DROP COLUMN IF EXISTS deposit_count;
-- COMMIT;
--
-- =====================================================

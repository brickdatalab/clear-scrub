-- Migration: 20251020_fresh_test_db_cleanup.sql
-- Purpose: Fresh database for comprehensive E2E testing
-- Scope: Truncate all user-data tables (NOT system tables like auth.users)
-- Reason: Validate complete pipeline initialization paths after operation5 bug fix
-- Safety: Uses CASCADE to handle all foreign key dependencies atomically

-- Step 1: Truncate all user-data tables with CASCADE
-- CASCADE automatically clears dependent rows, no manual ordering needed
TRUNCATE TABLE
  documents,
  transactions,
  bank_transactions,
  statement_transactions,
  debts,
  debt_monthly_summaries,
  debt_payments,
  jobs,
  files,
  bank_statements,
  statements,
  accounts,
  submissions,
  company_aliases,
  companies,
  applications,
  owners,
  api_keys,
  organizations,
  users
CASCADE;

-- Step 2: Reset all sequences to 1 for clean IDs
ALTER SEQUENCE documents_id_seq RESTART WITH 1;
ALTER SEQUENCE transactions_id_seq RESTART WITH 1;
ALTER SEQUENCE bank_transactions_id_seq RESTART WITH 1;
ALTER SEQUENCE statement_transactions_id_seq RESTART WITH 1;
ALTER SEQUENCE debts_id_seq RESTART WITH 1;
ALTER SEQUENCE debt_monthly_summaries_id_seq RESTART WITH 1;
ALTER SEQUENCE debt_payments_id_seq RESTART WITH 1;
ALTER SEQUENCE jobs_id_seq RESTART WITH 1;
ALTER SEQUENCE files_id_seq RESTART WITH 1;
ALTER SEQUENCE bank_statements_id_seq RESTART WITH 1;
ALTER SEQUENCE statements_id_seq RESTART WITH 1;
ALTER SEQUENCE accounts_id_seq RESTART WITH 1;
ALTER SEQUENCE submissions_id_seq RESTART WITH 1;
ALTER SEQUENCE company_aliases_id_seq RESTART WITH 1;
ALTER SEQUENCE companies_id_seq RESTART WITH 1;
ALTER SEQUENCE applications_id_seq RESTART WITH 1;
ALTER SEQUENCE owners_id_seq RESTART WITH 1;
ALTER SEQUENCE api_keys_id_seq RESTART WITH 1;
ALTER SEQUENCE organizations_id_seq RESTART WITH 1;
ALTER SEQUENCE users_id_seq RESTART WITH 1;

-- Step 3: Verify edge functions still exist (query pg_proc for function count)
-- This is informational only - edge functions are code in supabase/functions/, not affected by data deletion
SELECT count(*) as edge_function_count FROM pg_proc WHERE proname LIKE '%statement_schema_intake%' OR proname LIKE '%get_company%' OR proname LIKE '%list_companies%';

-- Step 4: Status message
-- All user data cleared. Edge functions preserved. System ready for fresh E2E testing.

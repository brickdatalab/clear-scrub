-- Migration: 20251020_truncate_test_data_only.sql
-- Purpose: DELETE ROWS ONLY - Fresh database for E2E testing
-- IMPORTANT: This migration ONLY truncates user data tables
-- PRESERVED: All edge functions, triggers, RLS policies, views, storage buckets, stored procedures

-- Truncate all user-data tables (CASCADE handles FK dependencies automatically)
-- DO NOT modify schema, functions, triggers, or policies
TRUNCATE TABLE
  profiles,
  organizations,
  companies,
  documents,
  submissions,
  applications,
  accounts,
  statements,
  api_keys,
  company_aliases,
  email_submissions,
  webhook_catches,
  usage_logs
CASCADE;

-- Reset sequences to 1 for clean IDs on fresh data
ALTER SEQUENCE profiles_id_seq RESTART WITH 1;
ALTER SEQUENCE organizations_id_seq RESTART WITH 1;
ALTER SEQUENCE companies_id_seq RESTART WITH 1;
ALTER SEQUENCE documents_id_seq RESTART WITH 1;
ALTER SEQUENCE submissions_id_seq RESTART WITH 1;
ALTER SEQUENCE applications_id_seq RESTART WITH 1;
ALTER SEQUENCE accounts_id_seq RESTART WITH 1;
ALTER SEQUENCE statements_id_seq RESTART WITH 1;
ALTER SEQUENCE api_keys_id_seq RESTART WITH 1;
ALTER SEQUENCE company_aliases_id_seq RESTART WITH 1;
ALTER SEQUENCE email_submissions_id_seq RESTART WITH 1;
ALTER SEQUENCE webhook_catches_id_seq RESTART WITH 1;
ALTER SEQUENCE usage_logs_id_seq RESTART WITH 1;

-- Verification query (not executed, just for documentation)
-- SELECT 'Data cleared. Edge functions, triggers, and RLS policies UNCHANGED.' as status;

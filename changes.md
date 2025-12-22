# ClearScrub Changes Log

## 2025-12-22

### Repository Migration
- Migrated from `brickdatalab/clearscrubdash2` to `brickdatalab/clear-scrub`
- Pushed all code and history to new repo
- Updated local `origin` remote to point to new repo

### Documentation
- Created `db_schema.md` - Complete Supabase database schema reference

### Database Migration (Supabase project: vnhauomvzjucxadrbywg)
Executed 7-phase migration to rebuild schema for document extraction workflow:

**Dropped (Phase 1):**
- 11 deprecated tables (statement_transactions, statement_summaries, statements, company_aliases, companies, triggers, email_notifications, email_submissions, usage_logs, webhook_catches, old accounts, documents, applications)
- 2 materialized views (company_monthly_rollups, account_monthly_rollups)

**Modified (Phase 2):**
- `submissions` table: added company_name, external_id, files_total, files_processed, policy_passed, company_id

**Created (Phase 3):**
- `files` - Document tracking with classification & extraction workflow fields
- `accounts` - Bank accounts derived from statement extraction
- `bank_statements` - Monthly statement summaries (matches bank_schema_final.json)
- `transactions` - Individual transactions with categorization enrichment
- `applications` - Extracted loan application data (matches application_schema_final.json)
- `categories` - 40 transaction categories (Heron Data taxonomy)
- `submission_metrics` - Precomputed aggregations for dashboard

**Functions/Triggers (Phase 4):**
- `update_submission_file_counts()` - Auto-increment files_total
- `update_submission_processed_count()` - Auto-increment files_processed
- `mask_account_number()` - Returns ****1234 format

**Categories (Phase 5):** 40 categories seeded across 8 analytics groups

**RLS (Phase 6):** 14 policies - service role bypass + org-scoped user access

**Storage (Phase 7):** `documents` bucket set to PUBLIC, 50MB limit, PDF/image support

### Pending
- Reconnect Vercel to `brickdatalab/clear-scrub`
  - Set Root Directory: `clearscrub_dashboard`
  - Verify environment variables are intact
- Build edge functions for webhook callbacks (see migration/callback_processing.md)
- Update dashboard API endpoints to use new table structure

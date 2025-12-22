-- Migration: Add statements composite key idempotency
-- Purpose: Prevent duplicate statements for same account/period
-- Date: 2025-10-29

ALTER TABLE statements
ADD CONSTRAINT ux_statements_account_period
UNIQUE(account_id, statement_period_start, statement_period_end);

-- Migration: Add accounts composite key idempotency
-- Purpose: Prevent duplicate accounts within same company
-- Date: 2025-10-29

ALTER TABLE accounts
ADD CONSTRAINT ux_accounts_company_hash
UNIQUE(company_id, account_number_hash);

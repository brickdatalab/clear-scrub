-- ============================================================================
-- CLEARSCRUB DATABASE MIGRATION
-- ============================================================================
-- Purpose: Rebuild database schema to support document extraction workflow
-- Date: 2024-12-22
-- 
-- EXECUTION ORDER:
-- 1. Run PHASE 1 (Drop deprecated tables)
-- 2. Run PHASE 2 (Modify existing tables)
-- 3. Run PHASE 3 (Create new tables)
-- 4. Run PHASE 4 (Create indexes)
-- 5. Run PHASE 5 (Seed categories)
-- 6. Run PHASE 6 (RLS policies)
-- 7. Run PHASE 7 (Storage bucket changes)
-- ============================================================================


-- ############################################################################
-- PHASE 1: DROP DEPRECATED TABLES
-- ############################################################################
-- These tables are either unused, replaced, or were for abandoned integrations

-- Drop foreign key constraints first (order matters)
ALTER TABLE IF EXISTS statements DROP CONSTRAINT IF EXISTS statements_document_id_fkey;
ALTER TABLE IF EXISTS statements DROP CONSTRAINT IF EXISTS statements_account_id_fkey;
ALTER TABLE IF EXISTS statements DROP CONSTRAINT IF EXISTS statements_company_id_fkey;
ALTER TABLE IF EXISTS statements DROP CONSTRAINT IF EXISTS statements_submission_id_fkey;
ALTER TABLE IF EXISTS accounts DROP CONSTRAINT IF EXISTS accounts_company_id_fkey;
ALTER TABLE IF EXISTS documents DROP CONSTRAINT IF EXISTS documents_company_id_fkey;
ALTER TABLE IF EXISTS documents DROP CONSTRAINT IF EXISTS documents_submission_id_fkey;
ALTER TABLE IF EXISTS company_aliases DROP CONSTRAINT IF EXISTS company_aliases_company_id_fkey;
ALTER TABLE IF EXISTS statement_transactions DROP CONSTRAINT IF EXISTS statement_transactions_summary_id_fkey;

-- Drop materialized views that depend on old tables
DROP MATERIALIZED VIEW IF EXISTS company_monthly_rollups CASCADE;
DROP MATERIALIZED VIEW IF EXISTS account_monthly_rollups CASCADE;

-- Drop deprecated tables
DROP TABLE IF EXISTS statement_transactions CASCADE;  -- Fidelity integration (abandoned)
DROP TABLE IF EXISTS statement_summaries CASCADE;     -- Fidelity integration (abandoned)
DROP TABLE IF EXISTS statements CASCADE;              -- Replaced by bank_statements
DROP TABLE IF EXISTS company_aliases CASCADE;         -- Entity resolution (not implemented)
DROP TABLE IF EXISTS companies CASCADE;               -- Replaced by submission-centric model
DROP TABLE IF EXISTS triggers CASCADE;                -- Rebuild later
DROP TABLE IF EXISTS email_notifications CASCADE;     -- Rebuild later
DROP TABLE IF EXISTS email_submissions CASCADE;       -- Merge into submissions.metadata
DROP TABLE IF EXISTS usage_logs CASCADE;              -- Rebuild later
DROP TABLE IF EXISTS webhook_catches CASCADE;         -- Debug table, not needed
DROP TABLE IF EXISTS accounts CASCADE;                -- Will recreate with new FKs

-- Drop old documents table (will recreate as 'files')
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS applications CASCADE;            -- Will recreate with correct schema


-- ############################################################################
-- PHASE 2: MODIFY EXISTING TABLES
-- ############################################################################

-- -----------------------------------------------------------------------------
-- 2.1 SUBMISSIONS TABLE MODIFICATIONS
-- -----------------------------------------------------------------------------
-- Add columns needed for dashboard and future company linking

-- Add company_name (from application extraction or manual entry)
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS company_name text;

-- Add external_id (customer's reference ID for API integrations)
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS external_id text;

-- Add file counters for dashboard display
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS files_total integer DEFAULT 0;

ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS files_processed integer DEFAULT 0;

-- Add policy evaluation result
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS policy_passed boolean;

-- Add optional company_id for FUTURE cross-submission linking
-- This stays NULL for now, enables future enhancement without schema changes
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS company_id uuid;

-- Update status enum to match new flow
-- Old: 'received', 'processing', 'completed', 'failed'
-- New: 'pending', 'processing', 'processed', 'review_required', 'reviewed', 'failed'
COMMENT ON COLUMN submissions.status IS 'Status: pending, processing, processed, review_required, reviewed, failed';

-- Add index for external_id lookups (API customers query by their reference)
CREATE INDEX IF NOT EXISTS idx_submissions_external_id 
ON submissions(org_id, external_id) 
WHERE external_id IS NOT NULL;

-- Add index for company_name search
CREATE INDEX IF NOT EXISTS idx_submissions_company_name 
ON submissions(org_id, company_name);


-- ############################################################################
-- PHASE 3: CREATE NEW TABLES
-- ############################################################################

-- -----------------------------------------------------------------------------
-- 3.1 FILES TABLE (replaces documents)
-- -----------------------------------------------------------------------------
-- Tracks uploaded PDFs with processing status and extraction workflow IDs

CREATE TABLE files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- File metadata
    filename text NOT NULL,
    file_path text NOT NULL,                          -- Storage path: {org_id}/{submission_id}/{file_id}.pdf
    file_size_bytes bigint,
    mime_type text DEFAULT 'application/pdf',
    source text NOT NULL,                             -- 'dashboard', 'email', 'api'
    
    -- Classification (from classifier webhook)
    classification_type text,                         -- 'bank_statement', 'application', 'month_to_date', 'other', NULL
    classification_confidence numeric(3,2),           -- 0.00 to 1.00
    
    -- Processing status
    status text DEFAULT 'uploaded',                   -- 'uploaded', 'classifying', 'classified', 'processing', 'processed', 'failed'
    error_message text,
    
    -- Extraction workflow tracking (REQUIRED for your workflow)
    llama_file_id text,                               -- LlamaIndex/extraction service file ID
    schema_job_id text,                               -- Extraction job ID for status polling
    
    -- Processing timestamps
    processing_started_at timestamptz,
    processing_completed_at timestamptz,
    
    -- Audit
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Constraints
    CONSTRAINT files_classification_type_check CHECK (
        classification_type IS NULL OR 
        classification_type IN ('bank_statement', 'application', 'month_to_date', 'other')
    ),
    CONSTRAINT files_status_check CHECK (
        status IN ('uploaded', 'classifying', 'classified', 'processing', 'processed', 'failed')
    ),
    CONSTRAINT files_source_check CHECK (
        source IN ('dashboard', 'email', 'api')
    )
);

-- Unique constraint: one file path per org
CREATE UNIQUE INDEX ux_files_org_file_path ON files(org_id, file_path);

-- Performance indexes
CREATE INDEX idx_files_submission_id ON files(submission_id);
CREATE INDEX idx_files_org_status ON files(org_id, status);
CREATE INDEX idx_files_classification ON files(classification_type) WHERE classification_type IS NOT NULL;
CREATE INDEX idx_files_schema_job_id ON files(schema_job_id) WHERE schema_job_id IS NOT NULL;
CREATE INDEX idx_files_created_at ON files(created_at DESC);


-- -----------------------------------------------------------------------------
-- 3.2 ACCOUNTS TABLE (recreated with submission FK)
-- -----------------------------------------------------------------------------
-- Bank accounts derived from statement extraction, scoped to submission

CREATE TABLE accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Account identification (from extraction)
    account_number text NOT NULL,                     -- Full account number from statement
    account_number_masked text,                       -- Last 4 digits for display (****1234)
    bank_name text NOT NULL,
    account_name text,                                -- Account holder name from statement
    
    -- Account details
    account_type text DEFAULT 'unknown',              -- 'checking', 'savings', 'money_market', 'unknown'
    currency text DEFAULT 'USD',
    
    -- Current state (updated as statements processed)
    latest_balance numeric,
    last_transaction_date date,
    
    -- Audit
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Constraints
    CONSTRAINT accounts_type_check CHECK (
        account_type IN ('checking', 'savings', 'money_market', 'unknown')
    )
);

-- Unique: one account per submission + account number
CREATE UNIQUE INDEX ux_accounts_submission_account 
ON accounts(submission_id, account_number);

-- Performance indexes
CREATE INDEX idx_accounts_submission_id ON accounts(submission_id);
CREATE INDEX idx_accounts_org_id ON accounts(org_id);


-- -----------------------------------------------------------------------------
-- 3.3 BANK_STATEMENTS TABLE
-- -----------------------------------------------------------------------------
-- Monthly statement summaries extracted from PDFs
-- Column names match bank_schema_final.json

CREATE TABLE bank_statements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- From bank_schema_final.json: statement.summary
    account_number text NOT NULL,                     -- Denormalized for queries
    bank_name text NOT NULL,                          -- Denormalized for queries
    company_name text,                                -- Maps to schema "company" field
    start_balance numeric NOT NULL,
    end_balance numeric NOT NULL,
    statement_start_date date NOT NULL,
    statement_end_date date NOT NULL,
    total_credits numeric NOT NULL,
    total_debits numeric NOT NULL,
    num_credits integer NOT NULL,
    num_debits integer NOT NULL,
    num_transactions integer NOT NULL,
    
    -- Reconciliation & quality
    is_reconciled boolean DEFAULT false,              -- start_balance + txn_sum = end_balance
    reconciliation_difference numeric,                -- Discrepancy amount if not reconciled
    anomaly_score integer DEFAULT 0,                  -- 0-1000, higher = more suspicious
    
    -- Audit
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Unique: one statement per file (1 PDF = 1 statement)
CREATE UNIQUE INDEX ux_bank_statements_file ON bank_statements(file_id);

-- Unique: one statement per account + period
CREATE UNIQUE INDEX ux_bank_statements_account_period 
ON bank_statements(account_id, statement_start_date, statement_end_date);

-- Performance indexes
CREATE INDEX idx_bank_statements_submission ON bank_statements(submission_id);
CREATE INDEX idx_bank_statements_account ON bank_statements(account_id);
CREATE INDEX idx_bank_statements_period ON bank_statements(statement_start_date, statement_end_date);
CREATE INDEX idx_bank_statements_org ON bank_statements(org_id);


-- -----------------------------------------------------------------------------
-- 3.4 CATEGORIES TABLE
-- -----------------------------------------------------------------------------
-- Reference table for transaction categorization (powers P&L reconstruction)

CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Category definition
    label text NOT NULL UNIQUE,                       -- e.g., 'Debt Repayment - MCA'
    description text,                                 -- Explanation of what belongs here
    
    -- Analytics grouping (for P&L sections)
    analytics_group text NOT NULL,                    -- 'revenue', 'cogs', 'opex', 'debt', 'equity', 'intra_company', 'tax', 'special_items'
    
    -- Flags
    is_system boolean DEFAULT true,                   -- System categories can't be deleted
    is_revenue boolean DEFAULT false,                 -- Quick flag for revenue categories
    
    -- Audit
    created_at timestamptz DEFAULT now(),
    
    -- Constraints
    CONSTRAINT categories_group_check CHECK (
        analytics_group IN ('revenue', 'cogs', 'opex', 'debt', 'equity', 'intra_company', 'tax', 'special_items')
    )
);


-- -----------------------------------------------------------------------------
-- 3.5 TRANSACTIONS TABLE
-- -----------------------------------------------------------------------------
-- Individual transactions from bank statements
-- Column names match bank_schema_final.json transactions array

CREATE TABLE transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_statement_id uuid NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- From bank_schema_final.json: statement.transactions[]
    amount numeric NOT NULL,                          -- Positive = credit, Negative = debit
    description text NOT NULL,                        -- Raw description from statement
    transaction_date date NOT NULL,                   -- Maps to schema "date" field
    running_balance numeric,                          -- Maps to schema "balance" field
    
    -- Enrichment (added post-extraction)
    category_id uuid REFERENCES categories(id),       -- Assigned category
    merchant_name text,                               -- Identified merchant/counterparty
    confidence numeric(3,2),                          -- Categorization confidence 0.00-1.00
    is_recurring boolean DEFAULT false,               -- Detected recurring pattern
    is_revenue boolean,                               -- Derived from category.is_revenue
    
    -- Matching & analysis
    matching_transaction_id uuid,                     -- For internal transfer matching
    analysis_metadata jsonb,                          -- Additional analysis data
    
    -- Manual overrides
    category_override_by uuid,                        -- User who overrode category
    category_override_at timestamptz,
    
    -- Sequence for ordering
    sequence_number integer,                          -- Order within statement (1, 2, 3...)
    
    -- Audit
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Performance indexes (transactions is the largest table)
CREATE INDEX idx_transactions_bank_statement ON transactions(bank_statement_id);
CREATE INDEX idx_transactions_submission ON transactions(submission_id);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_category ON transactions(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_transactions_org ON transactions(org_id);
CREATE INDEX idx_transactions_recurring ON transactions(submission_id) WHERE is_recurring = true;
CREATE INDEX idx_transactions_amount ON transactions(amount);

-- Full-text search on description
CREATE INDEX idx_transactions_description_search 
ON transactions USING gin(to_tsvector('english', description));


-- -----------------------------------------------------------------------------
-- 3.6 APPLICATIONS TABLE
-- -----------------------------------------------------------------------------
-- Extracted data from business loan application PDFs
-- Column names match application_schema_final.json

CREATE TABLE applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Metadata (from schema root, mostly redundant but kept for extraction mapping)
    source text NOT NULL,                             -- 'dashboard', 'email', 'api'
    file_name text NOT NULL,
    
    -- From extraction.company
    company_legal_name text NOT NULL,
    company_dba_name text,
    company_ein text,                                 -- Format: XX-XXXXXXX
    company_industry text,
    company_address_line1 text NOT NULL,
    company_address_line2 text,
    company_city text NOT NULL,
    company_state char(2) NOT NULL,
    company_zip text NOT NULL,
    company_phone text,
    company_email text,
    company_website text,
    
    -- From extraction.application (business details)
    app_business_structure text,                      -- 'LLC', 'Corporation', 'Sole Proprietorship', etc.
    app_start_date date,
    app_years_in_business numeric,
    app_number_of_employees integer,
    app_annual_revenue numeric,
    app_amount_requested numeric,
    app_loan_purpose text,
    
    -- Owner 1 (required)
    owner_1_first_name text NOT NULL,
    owner_1_middle_name text,
    owner_1_last_name text NOT NULL,
    owner_1_ssn text,                                 -- Format: XXX-XX-XXXX (stored encrypted ideally)
    owner_1_dob date,
    owner_1_ownership_pct numeric,
    owner_1_address jsonb,                            -- {address_line1, address_line2, city, state, zip}
    owner_1_cell_phone text,
    owner_1_home_phone text,
    owner_1_email text,
    
    -- Owner 2 (optional)
    owner_2_first_name text,
    owner_2_middle_name text,
    owner_2_last_name text,
    owner_2_ssn text,
    owner_2_dob date,
    owner_2_ownership_pct numeric,
    owner_2_address jsonb,
    owner_2_cell_phone text,
    owner_2_home_phone text,
    owner_2_email text,
    
    -- Extraction quality
    confidence_score numeric(3,2) NOT NULL,           -- 0.00-1.00
    uncertain_fields jsonb DEFAULT '[]',              -- Fields with low confidence
    raw_extraction jsonb,                             -- Full extraction response for debugging
    
    -- Audit
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Constraints
    CONSTRAINT applications_source_check CHECK (
        source IN ('dashboard', 'email', 'api')
    ),
    CONSTRAINT applications_business_structure_check CHECK (
        app_business_structure IS NULL OR
        app_business_structure IN ('Sole Proprietorship', 'Partnership', 'LLC', 'Corporation', 'S-Corp', 'C-Corp', 'Non-Profit', 'Other')
    )
);

-- Unique: one application per file
CREATE UNIQUE INDEX ux_applications_file ON applications(file_id);

-- Performance indexes
CREATE INDEX idx_applications_submission ON applications(submission_id);
CREATE INDEX idx_applications_org ON applications(org_id);
CREATE INDEX idx_applications_company_name ON applications(company_legal_name);
CREATE INDEX idx_applications_ein ON applications(company_ein) WHERE company_ein IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 3.7 SUBMISSION_METRICS TABLE
-- -----------------------------------------------------------------------------
-- Precomputed aggregations for fast dashboard loading

CREATE TABLE submission_metrics (
    submission_id uuid PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
    
    -- Date range coverage
    date_range_start date,                            -- Earliest transaction
    date_range_end date,                              -- Latest transaction
    
    -- Deposit metrics
    total_deposits numeric DEFAULT 0,
    deposit_count integer DEFAULT 0,
    largest_deposit numeric,
    
    -- Withdrawal metrics
    total_withdrawals numeric DEFAULT 0,
    withdrawal_count integer DEFAULT 0,
    largest_withdrawal numeric,
    
    -- Balance metrics
    avg_daily_balance numeric,
    min_balance numeric,
    max_balance numeric,
    
    -- Revenue metrics
    true_revenue numeric DEFAULT 0,
    true_revenue_count integer DEFAULT 0,
    
    -- Risk indicators
    negative_balance_days integer DEFAULT 0,
    nsf_count integer DEFAULT 0,
    nsf_total_amount numeric DEFAULT 0,
    low_balance_days integer DEFAULT 0,
    
    -- MCA/Debt metrics
    total_mca_debits numeric DEFAULT 0,
    mca_debit_count integer DEFAULT 0,
    estimated_mca_holdback_pct numeric,
    
    -- Transaction stats
    total_transactions integer DEFAULT 0,
    categorized_count integer DEFAULT 0,
    uncategorized_count integer DEFAULT 0,
    avg_categorization_confidence numeric,
    
    -- Account coverage
    account_count integer DEFAULT 0,
    statement_count integer DEFAULT 0,
    
    -- Timestamps
    calculated_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);


-- ############################################################################
-- PHASE 4: CREATE HELPER FUNCTIONS
-- ############################################################################

-- Function to update submission file counters
CREATE OR REPLACE FUNCTION update_submission_file_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE submissions 
        SET files_total = files_total + 1,
            updated_at = now()
        WHERE id = NEW.submission_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE submissions 
        SET files_total = files_total - 1,
            updated_at = now()
        WHERE id = OLD.submission_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for file count updates
DROP TRIGGER IF EXISTS trg_update_submission_file_counts ON files;
CREATE TRIGGER trg_update_submission_file_counts
    AFTER INSERT OR DELETE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_submission_file_counts();

-- Function to update processed count when file status changes to 'processed'
CREATE OR REPLACE FUNCTION update_submission_processed_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'processed' AND (OLD.status IS NULL OR OLD.status != 'processed') THEN
        UPDATE submissions 
        SET files_processed = files_processed + 1,
            updated_at = now()
        WHERE id = NEW.submission_id;
    ELSIF OLD.status = 'processed' AND NEW.status != 'processed' THEN
        UPDATE submissions 
        SET files_processed = GREATEST(0, files_processed - 1),
            updated_at = now()
        WHERE id = NEW.submission_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for processed count updates
DROP TRIGGER IF EXISTS trg_update_submission_processed_count ON files;
CREATE TRIGGER trg_update_submission_processed_count
    AFTER UPDATE OF status ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_submission_processed_count();

-- Function to mask account number
CREATE OR REPLACE FUNCTION mask_account_number(account_num text)
RETURNS text AS $$
BEGIN
    IF account_num IS NULL OR length(account_num) < 4 THEN
        RETURN '****';
    END IF;
    RETURN '****' || right(regexp_replace(account_num, '[^0-9]', '', 'g'), 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ############################################################################
-- PHASE 5: SEED CATEGORIES
-- ############################################################################
-- 40+ categories matching Heron Data taxonomy

INSERT INTO categories (label, description, analytics_group, is_revenue) VALUES
-- REVENUE
('Revenue', 'Payments for goods/services from customers', 'revenue', true),
('ATM Cash Inflows', 'Cash deposits at ATM or branch', 'revenue', true),
('Check Deposits', 'Check deposits from any source', 'revenue', true),
('P2P Transfers Inflows', 'Incoming peer-to-peer transfers (Venmo, Zelle, etc.)', 'revenue', true),
('Revenue - Invoice Factoring', 'Payments from invoice factoring companies', 'revenue', true),

-- COST OF GOODS SOLD
('Advertising', 'Performance marketing, PR agencies, influencer payments', 'cogs', false),
('Postage', 'Logistics, freight forwarding, shipping costs', 'cogs', false),
('Inventory', 'Direct inputs for products/services sold', 'cogs', false),

-- OPERATIONAL EXPENSES
('Payroll and Consultants', 'Staff salaries, contractors, consultants, benefits', 'opex', false),
('Rent', 'Office space, workspaces, storage facilities', 'opex', false),
('Utilities', 'Power, telecommunications, internet', 'opex', false),
('Insurance', 'Business insurance premiums', 'opex', false),
('Software', 'Software subscriptions, cloud services, infrastructure', 'opex', false),
('Credit Card', 'Credit card payments to unconnected accounts', 'opex', false),
('General Payment', 'Payments with unassessable purpose (PayPal, Wise)', 'opex', false),
('Travel', 'Hotels, flights, car rentals, transportation', 'opex', false),
('Other Expenses', 'Sundry expenses (restaurants, professional services)', 'opex', false),
('Refunds', 'Refunds issued to customers', 'opex', false),
('Charges/Fees', 'Bank charges, finance charges, service fees', 'opex', false),
('Overdraft/NSF Fees', 'Overdraft charges and NSF fees', 'opex', false),
('Check Outflows', 'Check payments with no identifiable counterparty', 'opex', false),
('P2P Transfers Outflows', 'Outgoing peer-to-peer transfers', 'opex', false),

-- DEBT
('Debt Investment', 'Incoming loan principals from lenders', 'debt', false),
('Debt Investment - MCA', 'MCA funding received', 'debt', false),
('Debt Repayment', 'Outgoing debt repayments (non-MCA)', 'debt', false),
('Debt Repayment - MCA', 'MCA repayments (daily/weekly debits)', 'debt', false),

-- EQUITY
('Equity Investment', 'VC/PE investments, owner capital injections', 'equity', false),

-- INTRA-COMPANY
('Company Investments', 'Transfers to brokerages, daily cash sweeps', 'intra_company', false),
('Reconciled Intra-Company Transfers', 'Matched transfers between own accounts', 'intra_company', false),
('Reconciled Intra-Company Transfers Inflows', 'Incoming matched internal transfers', 'intra_company', false),
('Reconciled Intra-Company Transfers Outflows', 'Outgoing matched internal transfers', 'intra_company', false),
('Unreconciled Intra-Company Transfers', 'Unmatched transfers between accounts', 'intra_company', false),
('Unreconciled Intra-Company Transfers Inflows', 'Incoming unmatched internal transfers', 'intra_company', false),
('Unreconciled Intra-Company Transfers Outflows', 'Outgoing unmatched internal transfers', 'intra_company', false),

-- TAX
('Taxes', 'Tax payments and tax refunds', 'tax', false),

-- SPECIAL ITEMS
('ATM Cash Outflows', 'Cash withdrawals at ATM', 'special_items', false),
('P2P Transfers', 'Peer-to-peer transfers (direction unclear)', 'special_items', false),
('Special Inflows', 'Deposits requiring customer clarification', 'special_items', false),
('Special Outflows', 'Withdrawals requiring customer clarification', 'special_items', false),
('Other Income', 'Miscellaneous income not fitting other categories', 'special_items', false)

ON CONFLICT (label) DO NOTHING;


-- ############################################################################
-- PHASE 6: ROW LEVEL SECURITY POLICIES
-- ############################################################################

-- Enable RLS on all new tables
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for edge functions)
CREATE POLICY "Service role has full access to files"
ON files FOR ALL
USING ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Service role has full access to accounts"
ON accounts FOR ALL
USING ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Service role has full access to bank_statements"
ON bank_statements FOR ALL
USING ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Service role has full access to transactions"
ON transactions FOR ALL
USING ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Service role has full access to applications"
ON applications FOR ALL
USING ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Service role has full access to submission_metrics"
ON submission_metrics FOR ALL
USING ((auth.jwt() ->> 'role') = 'service_role');

-- User access: org-scoped via profiles.org_id
CREATE POLICY "Users can access own org files"
ON files FOR ALL
USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can access own org accounts"
ON accounts FOR ALL
USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can access own org bank_statements"
ON bank_statements FOR ALL
USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can access own org transactions"
ON transactions FOR ALL
USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can access own org applications"
ON applications FOR ALL
USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can access own org submission_metrics"
ON submission_metrics FOR ALL
USING (
    submission_id IN (
        SELECT id FROM submissions 
        WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    )
);

-- Categories are public read (system reference data)
CREATE POLICY "Anyone can read categories"
ON categories FOR SELECT
USING (true);

CREATE POLICY "Only service role can modify categories"
ON categories FOR ALL
USING ((auth.jwt() ->> 'role') = 'service_role');


-- ############################################################################
-- PHASE 7: STORAGE BUCKET CONFIGURATION
-- ############################################################################
-- Run these in Supabase Dashboard > Storage or via SQL

-- Note: Storage bucket operations may require dashboard or different SQL context
-- Below are the conceptual operations needed:

/*
-- 1. Create/ensure public documents bucket exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents',
    'documents', 
    true,  -- PUBLIC for webhook access
    52428800,  -- 50MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 52428800;

-- 2. Delete deprecated buckets (after migrating any needed files)
-- DELETE FROM storage.buckets WHERE id = 'incoming-documents';
-- DELETE FROM storage.buckets WHERE id = 'extracted';
-- DELETE FROM storage.buckets WHERE id = 'fidelity-clear';

-- 3. Storage policies for documents bucket
CREATE POLICY "Authenticated users can upload to documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Users can access own org documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1]::uuid IN (
        SELECT org_id FROM profiles WHERE id = auth.uid()
    )
);

CREATE POLICY "Service role full access to documents"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'documents');
*/


-- ############################################################################
-- PHASE 8: MIGRATION VERIFICATION
-- ############################################################################

-- Verify table structure
DO $$
DECLARE
    table_count integer;
BEGIN
    SELECT count(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('files', 'accounts', 'bank_statements', 'transactions', 'applications', 'categories', 'submission_metrics');
    
    IF table_count != 7 THEN
        RAISE EXCEPTION 'Expected 7 new tables, found %', table_count;
    END IF;
    
    RAISE NOTICE 'Migration verification: % new tables created successfully', table_count;
END $$;

-- Verify categories seeded
DO $$
DECLARE
    cat_count integer;
BEGIN
    SELECT count(*) INTO cat_count FROM categories;
    
    IF cat_count < 40 THEN
        RAISE WARNING 'Expected 40+ categories, found %. Some may not have been seeded.', cat_count;
    ELSE
        RAISE NOTICE 'Categories verification: % categories seeded', cat_count;
    END IF;
END $$;


-- ############################################################################
-- SUMMARY
-- ############################################################################
/*
TABLES DROPPED (11):
- statement_transactions, statement_summaries (Fidelity)
- statements, documents (replaced)
- companies, company_aliases (deferred feature)
- triggers, email_notifications, email_submissions, usage_logs, webhook_catches (rebuild later)

TABLES MODIFIED (1):
- submissions (added: company_name, external_id, files_total, files_processed, policy_passed, company_id)

TABLES CREATED (7):
- files (was documents, simplified + extraction workflow fields)
- accounts (now links to submission, not company)
- bank_statements (matches bank_schema_final.json)
- transactions (matches bank_schema_final.json + enrichment)
- applications (matches application_schema_final.json)
- categories (40+ predefined for P&L)
- submission_metrics (precomputed aggregations)

TABLES KEPT UNCHANGED (6):
- organizations
- profiles
- api_keys
- webhooks
- audit_log

STORAGE:
- Single PUBLIC bucket: documents
- Path structure: {org_id}/{submission_id}/{file_id}.pdf

NEXT STEPS:
1. Run this migration
2. Update storage bucket settings in Supabase Dashboard
3. Build edge functions for classification + extraction routing
4. Test webhook callbacks with sample data
*/

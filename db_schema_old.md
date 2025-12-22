# ClearScrub Supabase Database Schema

**Project ID:** `vnhauomvzjucxadrbywg`
**Generated:** 2025-12-22
**Purpose:** Complete reference for database structure, relationships, and configurations

---

## Table of Contents

1. [Storage Buckets](#storage-buckets)
2. [Tables](#tables)
3. [Foreign Key Relationships](#foreign-key-relationships)
4. [Indexes](#indexes)
5. [Materialized Views](#materialized-views)
6. [Row Level Security (RLS) Policies](#rls-policies)
7. [Edge Functions](#edge-functions)

---

## Storage Buckets

| Bucket Name | Public | File Size Limit | Allowed MIME Types |
|-------------|--------|-----------------|-------------------|
| `documents` | No | 50 MB | `application/pdf` only |
| `extracted` | Yes | Unlimited | Any |
| `fidelity-clear` | Yes | 50 MB | Any |
| `incoming-documents` | Yes | 10 MB | Any |
| `public-assets` | Yes | 5 MB | Images only (`jpeg`, `jpg`, `png`, `gif`, `webp`, `svg+xml`) |

**Primary Upload Bucket:** `incoming-documents` - Used for dashboard document uploads.

---

## Tables

### 1. organizations
**Purpose:** Lender organizations using the ClearScrub platform. Top-level tenant for multi-tenant RLS isolation.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `name` | text | NO | - | Organization name |
| `email_address` | text | NO | - | Auto-generated intake email (UNIQUE) |
| `email_domain` | text | YES | - | Email forwarding domain |
| `status` | text | YES | `'active'` | `active`, `suspended`, `cancelled` |
| `subscription_tier` | text | YES | `'free'` | `free`, `basic`, `pro`, `enterprise` |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |
| `metadata` | jsonb | YES | `'{}'` | Flexible attributes |

---

### 2. profiles
**Purpose:** User accounts belonging to organizations. Extends Supabase auth.users.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | - | Primary key (matches auth.users.id) |
| `email` | text | NO | - | User email (UNIQUE) |
| `full_name` | text | YES | - | Display name |
| `avatar_url` | text | YES | - | Profile image URL |
| `phone` | text | YES | - | Contact phone |
| `company_role` | text | YES | - | Role within organization (display only) |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |
| `org_id` | uuid | YES | - | FK to organizations (CRITICAL for RLS) |

---

### 3. companies
**Purpose:** Applicant businesses being analyzed by lenders.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `org_id` | uuid | NO | - | FK to organizations |
| `legal_name` | text | NO | - | Official business name |
| `dba_name` | text | YES | - | Doing Business As name |
| `ein` | text | YES | - | Employer ID Number |
| `industry` | text | YES | - | Business industry |
| `address_line1` | text | YES | - | Street address |
| `address_line2` | text | YES | - | Suite/unit |
| `city` | text | YES | - | City |
| `state` | text | YES | - | State code |
| `zip` | text | YES | - | Postal code |
| `phone` | text | YES | - | Contact phone |
| `email` | text | YES | - | Contact email |
| `website` | text | YES | - | Company website |
| `notes` | text | YES | - | Internal notes |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |
| `normalized_legal_name` | text | YES | - | For entity resolution |

---

### 4. company_aliases
**Purpose:** Manual aliases for company name variations (DBA names, abbreviations).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `company_id` | uuid | NO | - | FK to companies |
| `alias_name` | text | NO | - | Alias name |
| `normalized_alias_name` | text | NO | - | Normalized for matching |
| `created_by` | uuid | YES | - | FK to auth.users |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |

---

### 5. accounts
**Purpose:** Bank accounts belonging to applicant companies.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `uuid_generate_v4()` | Primary key |
| `company_id` | uuid | NO | - | FK to companies |
| `bank_name` | text | NO | - | Financial institution name |
| `account_type` | text | YES | - | `checking`, `savings`, `money_market`, `other` |
| `account_number_masked` | text | YES | - | Last 4 digits (PCI compliance) |
| `routing_number_masked` | text | YES | - | Last 4 digits |
| `is_primary` | boolean | YES | `false` | Primary operating account |
| `status` | text | YES | `'active'` | `active`, `inactive`, `closed` |
| `notes` | text | YES | - | Internal notes |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |
| `account_number_hash` | text | YES | - | SHA-256 hash for deduplication |

---

### 6. submissions
**Purpose:** Central hub tracking each document ingestion event.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `org_id` | uuid | NO | - | FK to organizations |
| `user_id` | uuid | NO | - | FK to auth.users |
| `ingestion_method` | text | NO | - | `api`, `dashboard`, `email` |
| `status` | text | YES | `'received'` | `received`, `processing`, `completed`, `failed` |
| `error_message` | text | YES | - | Error details if failed |
| `metadata` | jsonb | YES | - | Method-specific data |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |
| `api_key_id` | uuid | YES | - | FK to api_keys (for API submissions) |

---

### 7. documents
**Purpose:** Tracks PDF files in Storage with processing status and extracted content.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `uuid_generate_v4()` | Primary key |
| `company_id` | uuid | YES | - | FK to companies (populated after entity resolution) |
| `filename` | text | NO | - | Original filename |
| `file_path` | text | NO | - | Storage path (UNIQUE) |
| `file_size_bytes` | bigint | YES | - | File size |
| `mime_type` | text | YES | `'application/pdf'` | MIME type |
| `status` | text | YES | `'uploaded'` | `uploaded`, `queued`, `processing`, `completed`, `failed` |
| `processing_started_at` | timestamptz | YES | - | Processing start time |
| `processing_completed_at` | timestamptz | YES | - | Processing end time |
| `processing_duration_seconds` | integer | YES | - | Total processing time |
| `error_message` | text | YES | - | Error details if failed |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |
| `extracted_markdown` | text | YES | - | OCR text in markdown |
| `structured_json` | jsonb | YES | - | Extracted structured data |
| `structured_at` | timestamptz | YES | - | Structuring completion time |
| `processing_pipeline_version` | text | YES | - | Pipeline version |
| `page_count` | integer | YES | - | Number of pages |
| `processing_method` | text | YES | - | `mistral_ocr`, `tesseract`, `manual_entry` |
| `ocr_confidence_score` | float8 | YES | - | OCR quality (0.0-1.0) |
| `has_errors` | boolean | YES | `false` | Non-fatal processing errors |
| `submission_id` | uuid | YES | - | FK to submissions |
| `classification_type` | text | YES | - | `bank_statement`, `application`, etc. |
| `classification_confidence` | numeric | YES | - | Classification confidence (0.0-1.0) |
| `llama_file_id` | text | YES | - | LlamaIndex file ID |
| `schema_job_id` | text | YES | - | LlamaCloud extraction job ID |
| `org_id` | uuid | YES | - | FK to organizations |

---

### 8. statements
**Purpose:** Monthly bank statement summaries with calculated financial metrics.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `uuid_generate_v4()` | Primary key |
| `document_id` | uuid | NO | - | FK to documents |
| `account_id` | uuid | NO | - | FK to accounts |
| `company_id` | uuid | YES | - | FK to companies (denormalized) |
| `statement_period_start` | date | NO | - | Period start date |
| `statement_period_end` | date | NO | - | Period end date |
| `statement_date` | date | YES | - | Statement issue date |
| `opening_balance` | numeric | YES | - | Starting balance |
| `closing_balance` | numeric | YES | - | Ending balance |
| `total_deposits` | numeric | YES | - | Sum of deposits |
| `total_withdrawals` | numeric | YES | - | Sum of withdrawals |
| `average_daily_balance` | numeric | YES | - | Average balance |
| `true_revenue` | numeric | YES | - | Genuine business revenue |
| `true_revenue_count` | integer | YES | - | Revenue transaction count |
| `total_non_revenue` | numeric | YES | - | Non-revenue deposits |
| `non_revenue_count` | integer | YES | - | Non-revenue transaction count |
| `negative_balance_days` | integer | YES | `0` | Days in overdraft |
| `nsf_count` | integer | YES | `0` | NSF fee count |
| `nsf_total_amount` | numeric | YES | - | Total NSF fees |
| `transaction_count` | integer | YES | `0` | Total transactions |
| `largest_deposit` | numeric | YES | - | Max deposit amount |
| `largest_withdrawal` | numeric | YES | - | Max withdrawal amount |
| `reconciliation_difference` | numeric | YES | - | Balance discrepancy |
| `anomaly_score` | numeric | YES | - | Unusual activity score |
| `data_quality_score` | numeric | YES | - | Extraction quality score |
| `raw_transactions` | jsonb | YES | - | Full transaction array |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |
| `submission_id` | uuid | YES | - | FK to submissions |
| `deposit_count` | integer | YES | `0` | Deposit transaction count |

---

### 9. applications
**Purpose:** Extracted data from business loan application PDFs.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `created_at` | timestamptz | NO | `now()` | Creation timestamp |
| `updated_at` | timestamptz | NO | `now()` | Last update timestamp |
| `documents_id` | uuid | NO | - | FK to documents (UNIQUE) |
| `submissions_id` | uuid | NO | - | FK to submissions |
| `source` | text | NO | - | `dashboard`, `email`, `api` |
| `file_name` | text | NO | - | Original filename |
| `company_legal_name` | text | NO | - | Business legal name |
| `company_dba_name` | text | YES | - | DBA name |
| `company_ein` | text | YES | - | EIN (XX-XXXXXXX format) |
| `company_industry` | text | YES | - | Industry |
| `company_address_line1` | text | NO | - | Address |
| `company_address_line2` | text | YES | - | Suite/unit |
| `company_city` | text | NO | - | City |
| `company_state` | char(2) | NO | - | State code |
| `company_zip` | text | NO | - | ZIP code |
| `company_phone` | text | YES | - | Phone |
| `company_email` | text | YES | - | Email |
| `company_website` | text | YES | - | Website |
| `app_business_structure` | text | YES | - | Business type |
| `app_start_date` | date | YES | - | Business start date |
| `app_years_in_business` | numeric | YES | - | Years operating |
| `app_number_of_employees` | integer | YES | - | Employee count |
| `app_annual_revenue` | numeric | YES | - | Annual revenue |
| `app_amount_requested` | numeric | YES | - | Loan amount requested |
| `app_loan_purpose` | text | YES | - | Loan purpose |
| `owner_1_*` | various | various | - | Primary owner fields (13 columns) |
| `owner_2_*` | various | YES | - | Secondary owner fields (13 columns) |
| `confidence_score` | numeric | NO | - | Extraction confidence (0.0-1.0) |
| `extraction_path` | text | NO | `'primary'` | `primary` or `fallback` |
| `uncertain_fields` | jsonb | YES | `'[]'` | Fields with low confidence |
| `raw_extraction` | jsonb | YES | - | Full model output |

---

### 10. api_keys
**Purpose:** Partner API authentication tokens.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `key_name` | text | NO | - | Human-readable label |
| `key_hash` | text | NO | - | Bcrypt hash (UNIQUE) |
| `prefix` | text | NO | - | `cs_live_XXXX` or `cs_test_XXXX` |
| `last_used_at` | timestamptz | YES | - | Last API call timestamp |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `expires_at` | timestamptz | YES | - | Optional expiration |
| `is_active` | boolean | YES | `true` | Active status |
| `org_id` | uuid | NO | - | FK to organizations |
| `created_by_user_id` | uuid | YES | - | FK to auth.users |
| `is_default` | boolean | YES | `false` | Default key flag |
| `deleted_at` | timestamptz | YES | - | Soft delete timestamp |

---

### 11. email_submissions
**Purpose:** Tracks documents received via email forwarding.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `uuid_generate_v4()` | Primary key |
| `message_id` | text | NO | - | Email Message-ID (UNIQUE) |
| `sender_email` | text | NO | - | Sender address |
| `received_at` | timestamptz | YES | `now()` | Receipt timestamp |
| `subject` | text | YES | - | Email subject |
| `body_text` | text | YES | - | Plain text body |
| `attachment_count` | integer | YES | `0` | Number of attachments |
| `processed` | boolean | YES | `false` | Processing complete flag |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `org_id` | uuid | YES | - | FK to organizations |
| `submission_id` | uuid | YES | - | FK to submissions |

---

### 12. statement_summaries
**Purpose:** Fidelity integration - statement summaries from external processing.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `fid_doc_id` | uuid | NO | - | External document ID (UNIQUE) |
| `fid_submission_id` | uuid | NO | - | External submission ID |
| `bank_name` | text | NO | - | Bank name |
| `account_number` | text | NO | - | Account number |
| `company` | text | NO | - | Company name |
| `statement_start_date` | date | NO | - | Period start |
| `statement_end_date` | date | NO | - | Period end |
| `start_balance` | numeric | NO | - | Opening balance |
| `end_balance` | numeric | NO | - | Closing balance |
| `total_credits` | numeric | NO | - | Total credits |
| `total_debits` | numeric | NO | - | Total debits |
| `num_transactions` | integer | NO | - | Transaction count |
| `num_credits` | integer | NO | - | Credit count |
| `num_debits` | integer | NO | - | Debit count |
| `created_at` | timestamptz | NO | `now()` | Creation timestamp |

---

### 13. statement_transactions
**Purpose:** Individual transactions from Fidelity integration.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `summary_id` | uuid | NO | - | FK to statement_summaries |
| `fid_doc_id` | uuid | NO | - | External document ID |
| `fid_submission_id` | uuid | NO | - | External submission ID |
| `transaction_date` | date | NO | - | Transaction date |
| `description` | text | NO | - | Transaction description |
| `amount` | numeric | NO | - | Transaction amount |
| `running_balance` | numeric | NO | - | Balance after transaction |
| `is_analyzed` | boolean | NO | `false` | Analysis complete flag |
| `classification` | text | YES | - | Transaction category |
| `is_revenue` | boolean | YES | - | Revenue classification |
| `analysis_metadata` | jsonb | YES | - | Analysis details |
| `created_at` | timestamptz | NO | `now()` | Creation timestamp |
| `transaction_sequence` | integer | YES | - | Order in statement |

---

### 14. audit_log
**Purpose:** Complete audit trail of all user actions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `org_id` | uuid | NO | - | FK to organizations |
| `user_id` | uuid | YES | - | FK to auth.users |
| `action` | text | NO | - | Action performed |
| `resource_type` | text | NO | - | Resource type |
| `resource_id` | uuid | YES | - | Resource ID |
| `old_values` | jsonb | YES | - | Previous values |
| `new_values` | jsonb | YES | - | New values |
| `metadata` | jsonb | YES | - | Additional context |
| `timestamp` | timestamptz | NO | `now()` | Action timestamp |

---

### 15. usage_logs
**Purpose:** API usage tracking for billing and quota enforcement.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | FK to auth.users |
| `document_id` | uuid | YES | - | Related document |
| `action` | text | NO | - | `upload`, `process`, `export`, `api_call` |
| `cost` | numeric | NO | `0.00` | Action cost in USD |
| `metadata` | jsonb | YES | - | Action details |
| `created_at` | timestamptz | YES | `now()` | Action timestamp |

---

### 16. webhooks
**Purpose:** Outbound webhook integrations for event notifications.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `org_id` | uuid | NO | - | FK to organizations |
| `name` | text | YES | - | Webhook name |
| `url` | text | NO | - | Webhook URL |
| `events` | text[] | NO | `ARRAY[]` | Subscribed events |
| `status` | text | NO | `'active'` | `active`, `inactive`, `failed` |
| `secret` | text | YES | - | Signing secret |
| `last_triggered_at` | timestamptz | YES | - | Last trigger time |
| `failure_count` | integer | NO | `0` | Consecutive failures |
| `created_at` | timestamptz | NO | `now()` | Creation timestamp |
| `updated_at` | timestamptz | NO | `now()` | Last update timestamp |

---

### 17. triggers
**Purpose:** User-defined automation rules (IF condition THEN action).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `org_id` | uuid | NO | - | FK to organizations |
| `name` | text | NO | - | Trigger name |
| `description` | text | YES | - | Description |
| `condition_type` | text | NO | - | Condition type |
| `condition_value` | jsonb | YES | - | Condition parameters |
| `action_type` | text | NO | - | Action type |
| `action_target` | jsonb | NO | - | Action parameters |
| `status` | text | NO | `'active'` | `active`, `inactive` |
| `last_triggered_at` | timestamptz | YES | - | Last trigger time |
| `trigger_count` | integer | NO | `0` | Total trigger count |
| `created_at` | timestamptz | NO | `now()` | Creation timestamp |
| `updated_at` | timestamptz | NO | `now()` | Last update timestamp |

---

### 18. email_notifications
**Purpose:** Email notification preferences for organizations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `org_id` | uuid | NO | - | FK to organizations |
| `email` | text | NO | - | Notification email |
| `events` | text[] | NO | `ARRAY[]` | Subscribed events |
| `status` | text | NO | `'active'` | `active`, `inactive` |
| `created_at` | timestamptz | NO | `now()` | Creation timestamp |
| `updated_at` | timestamptz | NO | `now()` | Last update timestamp |

---

### 19. webhook_catches
**Purpose:** Debug table for capturing incoming webhook requests.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `uuid_generate_v4()` | Primary key |
| `payload` | jsonb | YES | - | Request body |
| `headers` | jsonb | YES | - | Request headers |
| `query_params` | jsonb | YES | - | URL query parameters |
| `metadata` | jsonb | YES | - | Additional context |
| `created_at` | timestamptz | YES | `now()` | Receipt timestamp |

---

## Foreign Key Relationships

```
organizations (id)
    ├── profiles.org_id
    ├── companies.org_id
    ├── submissions.org_id
    ├── documents.org_id
    ├── api_keys.org_id
    ├── email_submissions.org_id
    ├── audit_log.org_id
    ├── webhooks.org_id
    ├── triggers.org_id
    └── email_notifications.org_id

companies (id)
    ├── accounts.company_id
    ├── documents.company_id
    ├── statements.company_id
    └── company_aliases.company_id

accounts (id)
    └── statements.account_id

submissions (id)
    ├── documents.submission_id
    ├── statements.submission_id
    ├── applications.submissions_id
    └── email_submissions.submission_id

documents (id)
    ├── statements.document_id
    └── applications.documents_id

api_keys (id)
    └── submissions.api_key_id

statement_summaries (id)
    └── statement_transactions.summary_id

auth.users (id)
    ├── profiles.id
    ├── submissions.user_id
    ├── api_keys.created_by_user_id
    ├── audit_log.user_id
    ├── usage_logs.user_id
    └── company_aliases.created_by
```

---

## Indexes

### Primary Keys (19 tables)
All tables have a primary key index on `id`.

### Performance Indexes

**accounts**
- `idx_accounts_company_id` - Company lookup
- `ux_accounts_company_bank_last4` - Unique per company/bank/last4
- `ux_accounts_company_hash` - Unique per company/hash
- `ux_accounts_number_hash` - Unique account hash

**api_keys**
- `idx_api_keys_active` - Active keys only
- `idx_api_keys_hash` - Key hash lookup
- `idx_api_keys_org_id` - Org lookup

**applications**
- `idx_applications_company_name` - Company name search
- `idx_applications_confidence` - Confidence filtering
- `idx_applications_created_at` - Chronological
- `idx_applications_extraction_path` - Path filtering
- `idx_applications_source` - Source filtering
- `idx_applications_submissions_id` - Submission lookup

**companies**
- `idx_companies_ein` - EIN lookup
- `idx_companies_legal_name` - Name search
- `idx_companies_org_id` - Org lookup
- `ux_companies_org_normalized` - Unique normalized name per org

**documents**
- `idx_documents_classification_type` - Type filtering
- `idx_documents_company_id` - Company lookup
- `idx_documents_created_at` - Chronological
- `idx_documents_schema_job_id` - Job lookup
- `idx_documents_status` - Status filtering
- `idx_documents_status_org` - Status per org
- `idx_documents_submission_id` - Submission lookup
- `idx_documents_submission_org` - Composite lookup
- `ux_documents_org_file_path` - Unique file path per org

**statements**
- `idx_statements_account_id` - Account lookup
- `idx_statements_company_id` - Company lookup
- `idx_statements_company_period` - Company + period
- `idx_statements_document_id` - Document lookup
- `idx_statements_period` - Period range
- `idx_statements_submission_id` - Submission lookup
- `ux_statements_account_period` - Unique account + period

**submissions**
- `idx_submissions_api_key_id` - API key lookup
- `idx_submissions_created_at` - Chronological
- `idx_submissions_org_id` - Org lookup
- `idx_submissions_status` - Non-completed status
- `idx_submissions_user_id` - User lookup

---

## Materialized Views

### account_monthly_rollups
Aggregates statement data by account and month.

```sql
SELECT
    account_id,
    company_id,
    date_trunc('month', statement_period_start)::date AS month_start,
    max(statement_period_end) AS month_end,
    sum(total_deposits) AS total_deposits,
    sum(total_withdrawals) AS total_withdrawals,
    avg(average_daily_balance) AS average_daily_balance,
    max(closing_balance) AS ending_balance,
    sum(true_revenue) AS true_revenue,
    sum(true_revenue_count) AS true_revenue_count,
    sum(deposit_count) AS deposit_count,
    sum(negative_balance_days) AS negative_balance_days,
    sum(nsf_count) AS nsf_count,
    sum(nsf_total_amount) AS nsf_total_amount,
    sum(transaction_count) AS transaction_count,
    max(largest_deposit) AS largest_deposit,
    max(largest_withdrawal) AS largest_withdrawal,
    max(created_at) AS last_updated
FROM statements
GROUP BY account_id, company_id, date_trunc('month', statement_period_start);
```

**Index:** `idx_account_monthly_rollups_lookup` UNIQUE on `(account_id, month_start)`

### company_monthly_rollups
Aggregates account rollups by company and month.

```sql
SELECT
    company_id,
    month_start,
    max(month_end) AS month_end,
    count(DISTINCT account_id) AS account_count,
    sum(total_deposits) AS total_deposits,
    sum(total_withdrawals) AS total_withdrawals,
    avg(average_daily_balance) AS average_daily_balance,
    sum(ending_balance) AS total_ending_balance,
    sum(true_revenue) AS true_revenue,
    sum(true_revenue_count) AS true_revenue_count,
    sum(deposit_count) AS deposit_count,
    sum(negative_balance_days) AS negative_balance_days,
    sum(nsf_count) AS nsf_count,
    sum(nsf_total_amount) AS nsf_total_amount,
    sum(transaction_count) AS transaction_count,
    max(largest_deposit) AS largest_deposit,
    max(largest_withdrawal) AS largest_withdrawal,
    max(last_updated) AS last_updated
FROM account_monthly_rollups
GROUP BY company_id, month_start;
```

**Index:** `idx_company_monthly_rollups_lookup` UNIQUE on `(company_id, month_start)`

---

## RLS Policies

All tables have RLS enabled. Common patterns:

### Service Role Bypass
```sql
(auth.jwt() ->> 'role') = 'service_role'
```
Applied to: accounts, companies, documents, organizations, profiles, statements, submissions, etc.

### Org-Scoped Access (User)
```sql
org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid()
)
```
Applied to: api_keys, audit_log, companies, email_notifications, submissions, triggers, webhooks

### Profile Access
```sql
auth.uid() = id  -- Own profile only
```
Applied to: profiles (SELECT, UPDATE, INSERT)

### Company-Scoped Access
```sql
company_id IN (
    SELECT id FROM companies
    WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
)
```
Applied to: accounts, company_aliases, statements

### Document Access (via Submission)
```sql
submission_id IN (
    SELECT id FROM submissions
    WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
)
```
Applied to: documents

---

## Edge Functions

### Active Dashboard API Functions (4)

| Function | Version | JWT Required | Purpose |
|----------|---------|--------------|---------|
| `list-companies` | v8 | Yes | Dashboard company list |
| `get-company-detail` | v5 | Yes | Company detail page |
| `get-statement-transactions` | v5 | Yes | Transaction view |
| `get-company-debts` | v5 | Yes | Debt view |

### Disabled/Deleted Document Processing Functions
All document processing functions have been disabled for rebuild:
- upload-documents
- document-metadata
- statement-schema-intake
- application-schema-intake
- enqueue-document-processing
- webhook-catch
- process-document-operation12
- catch-operation12-response
- catch-markdown-extract
- check-trigger-status
- ingest-fid-doc
- fid-results-webhook
- fidelity-storage-webhook

---

## Database Triggers Status

All document processing triggers are currently disabled:

| Trigger | Table | Status |
|---------|-------|--------|
| `on_storage_upload` | storage.objects | Replaced with no-op function |
| `fidelity-storage-webhook` | storage.objects | Dropped |
| `on_document_created` | documents | Disabled |

---

*Last updated: 2025-12-22*

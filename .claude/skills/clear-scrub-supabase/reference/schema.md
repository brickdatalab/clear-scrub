# ClearScrub Database Schema

## Project Overview

**Project ID:** vnhauomvzjucxadrbywg
**Project URL:** https://vnhauomvzjucxadrbywg.supabase.co

ClearScrub is a document processing platform for lender organizations. It handles:
- Multi-tenant organization management
- Document ingestion (API, email, dashboard)
- Bank statement parsing and transaction categorization
- Loan application extraction
- Audit logging and compliance

---

## Table Hierarchy

```
organizations (tenant root)
├── profiles (users)
├── api_keys (authentication)
├── webhooks (integrations)
├── audit_log (compliance)
└── submissions (document intake)
    ├── files (uploaded documents)
    ├── accounts (bank accounts)
    │   └── bank_statements
    │       └── transactions
    ├── applications (loan applications)
    └── submission_metrics (analytics)

categories (system-wide reference data)
```

---

## Core Tables

### organizations

**Purpose:** Top-level tenant for multi-tenant isolation. Every user and data record belongs to an organization.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (gen_random_uuid) |
| name | text | Legal/business name |
| email_address | text | Auto-generated intake email (org_{uuid}@emailforwarding.clearscrub.io) |
| email_domain | text | Email forwarding domain (nullable) |
| status | text | active, suspended, cancelled |
| subscription_tier | text | free, basic, pro, enterprise |
| metadata | jsonb | Flexible attributes |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last modification |

**RLS:** Enabled
**Constraints:**
- CHECK on status: must be one of active, suspended, cancelled
- CHECK on subscription_tier: must be one of free, basic, pro, enterprise

---

### profiles

**Purpose:** User accounts extending auth.users with organization membership.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK matching auth.users.id |
| email | text | User email (unique) |
| full_name | text | Display name |
| avatar_url | text | Profile image URL |
| phone | text | Contact phone |
| company_role | text | Display role (Underwriter, Loan Officer, etc.) |
| org_id | uuid | FK to organizations |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last modification |

**RLS:** Enabled
**FK:** profiles.id -> auth.users.id, profiles.org_id -> organizations.id

---

### api_keys

**Purpose:** API authentication tokens for programmatic document submission.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| key_name | text | Human-readable label |
| key_hash | text | Bcrypt hash (unique) |
| prefix | text | Visible prefix (cs_live_XXXX or cs_test_XXXX) |
| last_used_at | timestamptz | Last successful auth |
| expires_at | timestamptz | Optional expiration |
| is_active | boolean | Active/revoked flag |
| is_default | boolean | Default key for org |
| org_id | uuid | FK to organizations |
| created_by_user_id | uuid | FK to auth.users |
| deleted_at | timestamptz | Soft delete timestamp |
| created_at | timestamptz | Creation timestamp |

**RLS:** Enabled
**Constraints:**
- CHECK on prefix: must match 'cs_live_%' or 'cs_test_%'
- CHECK on key_name: length between 1-100

---

### submissions

**Purpose:** Central hub for document ingestion events. One submission can contain multiple files.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| org_id | uuid | FK to organizations |
| user_id | uuid | FK to auth.users (NULL for API/email) |
| ingestion_method | text | api, dashboard, email |
| status | text | received, processing, completed, failed |
| error_message | text | Error details if failed |
| metadata | jsonb | Method-specific data |
| api_key_id | uuid | FK to api_keys (for API submissions) |
| company_name | text | Company name from documents |
| external_id | text | External reference ID |
| company_id | uuid | Company reference |
| files_total | integer | Total files in submission |
| files_processed | integer | Files processed count |
| policy_passed | boolean | Policy check result |
| created_at | timestamptz | Submission received time |
| updated_at | timestamptz | Last status change |

**RLS:** Disabled (handled by Edge Functions)
**Constraints:**
- CHECK on ingestion_method: api, dashboard, email
- CHECK on status: received, processing, completed, failed

---

### files

**Purpose:** Individual uploaded documents linked to submissions.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| submission_id | uuid | FK to submissions |
| org_id | uuid | FK to organizations |
| filename | text | Original filename |
| file_path | text | Storage path |
| file_size_bytes | bigint | File size |
| mime_type | text | MIME type (default: application/pdf) |
| source | text | dashboard, email, api |
| classification_type | text | bank_statement, application, loan_application, month_to_date, other |
| classification_confidence | numeric | Classification confidence score |
| status | text | uploaded, classifying, classified, processing, processed, failed |
| error_message | text | Error details |
| llama_file_id | text | LlamaCloud file ID |
| schema_job_id | text | Schema extraction job ID |
| processing_started_at | timestamptz | Processing start time |
| processing_completed_at | timestamptz | Processing end time |
| created_at | timestamptz | Upload time |
| updated_at | timestamptz | Last update |

**RLS:** Disabled (handled by Edge Functions)

---

### accounts

**Purpose:** Bank accounts extracted from statements.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| submission_id | uuid | FK to submissions |
| org_id | uuid | FK to organizations |
| account_number | text | Full account number |
| account_number_masked | text | Masked display version |
| bank_name | text | Bank institution name |
| account_name | text | Account holder name |
| account_type | text | checking, savings, money_market, unknown |
| currency | text | Currency code (default: USD) |
| latest_balance | numeric | Most recent balance |
| last_transaction_date | date | Latest transaction date |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last update |

**RLS:** Enabled

---

### bank_statements

**Purpose:** Individual bank statement periods with summary data.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| file_id | uuid | FK to files |
| account_id | uuid | FK to accounts |
| submission_id | uuid | FK to submissions |
| org_id | uuid | FK to organizations |
| account_number | text | Account number |
| bank_name | text | Bank name |
| company_name | text | Company name on statement |
| start_balance | numeric | Opening balance |
| end_balance | numeric | Closing balance |
| statement_start_date | date | Period start |
| statement_end_date | date | Period end |
| total_credits | numeric | Sum of deposits |
| total_debits | numeric | Sum of withdrawals |
| num_credits | integer | Deposit count |
| num_debits | integer | Withdrawal count |
| num_transactions | integer | Total transaction count |
| is_reconciled | boolean | Reconciliation status |
| reconciliation_difference | numeric | Difference if not reconciled |
| anomaly_score | integer | Anomaly detection score |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last update |

**RLS:** Enabled

---

### transactions

**Purpose:** Individual transactions extracted from bank statements.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| bank_statement_id | uuid | FK to bank_statements |
| account_id | uuid | FK to accounts |
| submission_id | uuid | FK to submissions |
| org_id | uuid | FK to organizations |
| amount | numeric | Transaction amount |
| description | text | Transaction description |
| transaction_date | date | Transaction date |
| running_balance | numeric | Running balance after transaction |
| category_id | uuid | FK to categories |
| merchant_name | text | Extracted merchant name |
| confidence | numeric | Categorization confidence |
| is_recurring | boolean | Recurring flag |
| is_revenue | boolean | Revenue flag |
| matching_transaction_id | uuid | Self-reference for matching |
| analysis_metadata | jsonb | Analysis details |
| category_override_by | uuid | User who overrode category |
| category_override_at | timestamptz | Override timestamp |
| sequence_number | integer | Order in statement |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last update |

**RLS:** Enabled

---

### categories

**Purpose:** Transaction categorization reference data.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| label | text | Category label (unique) |
| description | text | Category description |
| analytics_group | text | revenue, cogs, opex, debt, equity, intra_company, tax, special_items |
| is_system | boolean | System-defined category |
| is_revenue | boolean | Revenue indicator |
| created_at | timestamptz | Creation time |

**RLS:** Enabled

---

### applications

**Purpose:** Loan application data extracted from forms.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| file_id | uuid | FK to files |
| submission_id | uuid | FK to submissions |
| org_id | uuid | FK to organizations |
| source | text | dashboard, email, api |
| file_name | text | Original filename |
| company_legal_name | text | Business legal name |
| company_dba_name | text | DBA name |
| company_ein | text | EIN |
| company_industry | text | Industry |
| company_address_* | various | Company address fields |
| company_phone/email/website | text | Contact info |
| app_business_structure | text | LLC, Corporation, etc. |
| app_start_date | date | Business start date |
| app_years_in_business | numeric | Years in operation |
| app_number_of_employees | integer | Employee count |
| app_annual_revenue | numeric | Annual revenue |
| app_amount_requested | numeric | Loan amount requested |
| app_loan_purpose | text | Loan purpose |
| owner_1_* | various | Primary owner details |
| owner_2_* | various | Secondary owner details |
| confidence_score | numeric | Extraction confidence |
| uncertain_fields | jsonb | Fields with low confidence |
| raw_extraction | jsonb | Raw extraction data |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last update |

**RLS:** Enabled

---

### submission_metrics

**Purpose:** Aggregated analytics for submissions.

| Column | Type | Description |
|--------|------|-------------|
| submission_id | uuid | PK, FK to submissions |
| date_range_start/end | date | Analysis period |
| total_deposits | numeric | Sum of deposits |
| deposit_count | integer | Number of deposits |
| largest_deposit | numeric | Max deposit |
| total_withdrawals | numeric | Sum of withdrawals |
| withdrawal_count | integer | Number of withdrawals |
| largest_withdrawal | numeric | Max withdrawal |
| avg_daily_balance | numeric | Average balance |
| min/max_balance | numeric | Balance range |
| true_revenue | numeric | Calculated revenue |
| true_revenue_count | integer | Revenue transaction count |
| negative_balance_days | integer | Days with negative balance |
| nsf_count | integer | NSF occurrences |
| nsf_total_amount | numeric | NSF total |
| low_balance_days | integer | Low balance days |
| total_mca_debits | numeric | MCA payment total |
| mca_debit_count | integer | MCA payment count |
| estimated_mca_holdback_pct | numeric | Estimated holdback percentage |
| total_transactions | integer | Transaction count |
| categorized/uncategorized_count | integer | Categorization stats |
| avg_categorization_confidence | numeric | Average confidence |
| account_count | integer | Number of accounts |
| statement_count | integer | Number of statements |
| calculated_at | timestamptz | Calculation timestamp |
| updated_at | timestamptz | Last update |

**RLS:** Enabled

---

### webhooks

**Purpose:** Outbound webhook configurations for event notifications.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| org_id | uuid | FK to organizations |
| name | text | Webhook name |
| url | text | Endpoint URL |
| events | text[] | Subscribed event types |
| status | text | active, inactive, failed |
| secret | text | Signing secret |
| last_triggered_at | timestamptz | Last trigger time |
| failure_count | integer | Consecutive failures |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last update |

**RLS:** Enabled

---

### audit_log

**Purpose:** Compliance audit trail of all user actions.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| org_id | uuid | FK to organizations |
| user_id | uuid | FK to auth.users |
| action | text | Action type |
| resource_type | text | Resource affected |
| resource_id | uuid | Resource ID |
| old_values | jsonb | Previous state |
| new_values | jsonb | New state |
| metadata | jsonb | Additional context |
| timestamp | timestamptz | Action timestamp |

**RLS:** Enabled

---

## Indexes

Key indexes to be aware of:
- Primary keys on all tables (uuid)
- Unique constraint on api_keys.key_hash
- Unique constraint on api_keys.prefix
- Unique constraint on profiles.email
- Unique constraint on categories.label
- Unique constraint on organizations.email_address
- Index on documents.schema_job_id

---

## Key Relationships

1. **Organization Scoping:** All data tables have org_id FK to organizations for multi-tenant isolation
2. **Submission Chain:** submissions -> files -> bank_statements -> transactions
3. **Account Aggregation:** accounts aggregate data across multiple bank_statements
4. **Application Extraction:** applications linked to files for loan form extraction
5. **API Tracking:** api_keys linked to submissions for API usage tracking

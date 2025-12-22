# ClearScrub Database Schema Reference

## Overview

This document maps the extraction webhook response schemas to database tables and shows the complete data flow.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              UPLOAD PHASE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Dashboard ──┐                                                             │
│   Email    ───┼──► Storage Bucket ──► files table (status: 'uploaded')     │
│   API      ───┘    (PUBLIC)                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLASSIFICATION PHASE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Edge Function ──► POST file_url to Classifier Webhook                    │
│                              │                                              │
│                              ▼                                              │
│                     { classification_type: '...' }                          │
│                              │                                              │
│                              ▼                                              │
│   UPDATE files SET classification_type = '...', status = 'classified'      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │bank_state-│   │application│   │month_to_  │
            │   ment    │   │           │   │   date    │
            └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
                  │               │               │
                  ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTRACTION PHASE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Edge Function ──► POST file_url to Extraction Webhook                    │
│                     (bank/application/mtd based on classification)         │
│                              │                                              │
│   UPDATE files SET llama_file_id, schema_job_id, status = 'processing'     │
│                              │                                              │
│                              ▼                                              │
│              Extraction Service processes PDF...                            │
│                              │                                              │
│                              ▼                                              │
│              Webhook CALLBACK with structured JSON                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│   bank_schema_final.json    │   │  application_schema_final   │
│                             │   │          .json              │
├─────────────────────────────┤   ├─────────────────────────────┤
│                             │   │                             │
│  statement.summary ────────►│   │  extraction.company ───────►│
│       │                     │   │       │                     │
│       ▼                     │   │       ▼                     │
│  ┌──────────────┐           │   │  ┌──────────────┐           │
│  │bank_statements│           │   │  │ applications │           │
│  └──────────────┘           │   │  └──────────────┘           │
│                             │   │                             │
│  statement.transactions ───►│   │  extraction.application ───►│
│       │                     │   │  (merged into applications) │
│       ▼                     │   │                             │
│  ┌──────────────┐           │   └─────────────────────────────┘
│  │ transactions │           │
│  └──────────────┘           │
│                             │
│  (derived) ────────────────►│
│       │                     │
│       ▼                     │
│  ┌──────────────┐           │
│  │   accounts   │           │
│  └──────────────┘           │
│                             │
└─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            POST-PROCESSING                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. UPDATE files SET status = 'processed'                                  │
│   2. Trigger: submissions.files_processed++                                 │
│   3. Categorize transactions (assign category_id, merchant_name)            │
│   4. Detect recurring transactions (set is_recurring)                       │
│   5. Compute submission_metrics aggregations                                │
│   6. Evaluate policy rules → UPDATE submissions.policy_passed               │
│   7. Fire outbound webhooks if configured                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Schema Mapping: bank_schema_final.json → Database

### statement.summary → bank_statements table

| JSON Field | DB Column | Type | Notes |
|------------|-----------|------|-------|
| `account_number` | `account_number` | text | Also used to upsert `accounts` |
| `bank_name` | `bank_name` | text | Also used to upsert `accounts` |
| `company` | `company_name` | text | Account holder name |
| `start_balance` | `start_balance` | numeric | Opening balance |
| `end_balance` | `end_balance` | numeric | Closing balance |
| `statement_start_date` | `statement_start_date` | date | Period start |
| `statement_end_date` | `statement_end_date` | date | Period end |
| `total_credits` | `total_credits` | numeric | Sum of deposits |
| `total_debits` | `total_debits` | numeric | Sum of withdrawals |
| `num_credits` | `num_credits` | integer | Deposit count |
| `num_debits` | `num_debits` | integer | Withdrawal count |
| `num_transactions` | `num_transactions` | integer | Total count |

**Additional bank_statements columns (not from JSON):**
- `id` - Primary key
- `file_id` - FK to files table
- `account_id` - FK to accounts table (upserted during processing)
- `submission_id` - FK (denormalized)
- `org_id` - FK (denormalized for RLS)
- `is_reconciled` - Computed: start + txns = end
- `reconciliation_difference` - Discrepancy if not reconciled
- `anomaly_score` - 0-1000 (from external analysis)

### statement.transactions[] → transactions table

| JSON Field | DB Column | Type | Notes |
|------------|-----------|------|-------|
| `amount` | `amount` | numeric | +credits, -debits |
| `description` | `description` | text | Raw from statement |
| `date` | `transaction_date` | date | Renamed to avoid SQL keyword |
| `balance` | `running_balance` | numeric | Balance after transaction |

**Additional transactions columns (enrichment):**
- `id` - Primary key
- `bank_statement_id` - FK to bank_statements
- `account_id` - FK to accounts
- `submission_id` - FK (denormalized)
- `org_id` - FK (denormalized for RLS)
- `category_id` - FK to categories (assigned by categorization)
- `merchant_name` - Identified counterparty
- `confidence` - Categorization confidence 0.00-1.00
- `is_recurring` - Detected recurring pattern
- `is_revenue` - Derived from category.is_revenue
- `sequence_number` - Order within statement

### Derived: accounts table

Created/updated during bank statement processing:

```sql
INSERT INTO accounts (submission_id, org_id, account_number, account_number_masked, bank_name, account_name)
VALUES (
    :submission_id,
    :org_id,
    :json_account_number,
    mask_account_number(:json_account_number),  -- ****1234
    :json_bank_name,
    :json_company  -- company name from statement
)
ON CONFLICT (submission_id, account_number)
DO UPDATE SET
    latest_balance = :json_end_balance,
    last_transaction_date = :json_statement_end_date,
    updated_at = now();
```

---

## Schema Mapping: application_schema_final.json → Database

### extraction.company → applications table

| JSON Field | DB Column | Type | Notes |
|------------|-----------|------|-------|
| `legal_name` | `company_legal_name` | text | NOT NULL |
| `dba_name` | `company_dba_name` | text | |
| `ein` | `company_ein` | text | XX-XXXXXXX |
| `industry` | `company_industry` | text | |
| `address_line1` | `company_address_line1` | text | NOT NULL |
| `address_line2` | `company_address_line2` | text | |
| `city` | `company_city` | text | NOT NULL |
| `state` | `company_state` | char(2) | NOT NULL |
| `zip` | `company_zip` | text | NOT NULL |
| `phone` | `company_phone` | text | |
| `email` | `company_email` | text | |
| `website` | `company_website` | text | |

### extraction.application → applications table

| JSON Field | DB Column | Type | Notes |
|------------|-----------|------|-------|
| `business_structure` | `app_business_structure` | text | Enum |
| `start_date` | `app_start_date` | date | |
| `years_in_business` | `app_years_in_business` | numeric | |
| `number_of_employees` | `app_number_of_employees` | integer | |
| `annual_revenue` | `app_annual_revenue` | numeric | |
| `amount_requested` | `app_amount_requested` | numeric | |
| `loan_purpose` | `app_loan_purpose` | text | |
| `owner_1_first_name` | `owner_1_first_name` | text | NOT NULL |
| `owner_1_middle_name` | `owner_1_middle_name` | text | |
| `owner_1_last_name` | `owner_1_last_name` | text | NOT NULL |
| `owner_1_ssn` | `owner_1_ssn` | text | XXX-XX-XXXX |
| `owner_1_dob` | `owner_1_dob` | date | |
| `owner_1_ownership_pct` | `owner_1_ownership_pct` | numeric | |
| `owner_1_address` | `owner_1_address` | jsonb | Nested object |
| `owner_1_cell_phone` | `owner_1_cell_phone` | text | |
| `owner_1_home_phone` | `owner_1_home_phone` | text | |
| `owner_1_email` | `owner_1_email` | text | |
| `owner_2_*` | `owner_2_*` | various | Same as owner_1 |

### extraction.confidence_score → applications.confidence_score

---

## Entity Relationship Diagram

```
┌─────────────────┐
│  organizations  │
│─────────────────│
│ id (PK)         │
│ name            │
│ ...             │
└────────┬────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐      ┌─────────────────┐
│    profiles     │      │   submissions   │
│─────────────────│      │─────────────────│
│ id (PK)         │      │ id (PK)         │
│ org_id (FK) ◄───┼──────│ org_id (FK)     │
│ email           │      │ company_name    │
│ ...             │      │ status          │
└─────────────────┘      │ files_total     │
                         │ files_processed │
                         │ policy_passed   │
                         │ company_id (FK) │◄── Future: link to companies table
                         └────────┬────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │ 1:N                    │ 1:N                    │ 1:1
         ▼                        ▼                        ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│     files       │      │    accounts     │      │submission_metrics│
│─────────────────│      │─────────────────│      │─────────────────│
│ id (PK)         │      │ id (PK)         │      │ submission_id(PK)│
│ submission_id(FK)│     │ submission_id(FK)│     │ total_deposits   │
│ filename        │      │ account_number  │      │ true_revenue     │
│ classification  │      │ bank_name       │      │ ...              │
│ llama_file_id   │      │ latest_balance  │      └─────────────────┘
│ schema_job_id   │      └────────┬────────┘
│ status          │               │
└────────┬────────┘               │ 1:N
         │                        ▼
         │               ┌─────────────────┐
         │               │ bank_statements │
         │ 1:1           │─────────────────│
         │               │ id (PK)         │
         ├──────────────►│ file_id (FK)    │
         │               │ account_id (FK) │
         │               │ start_balance   │
         │               │ end_balance     │
         │               │ ...             │
         │               └────────┬────────┘
         │                        │
         │                        │ 1:N
         │                        ▼
         │               ┌─────────────────┐      ┌─────────────────┐
         │               │  transactions   │      │   categories    │
         │               │─────────────────│      │─────────────────│
         │               │ id (PK)         │      │ id (PK)         │
         │               │ bank_statement_id│     │ label           │
         │               │ amount          │◄────►│ analytics_group │
         │               │ description     │FK    │ is_revenue      │
         │               │ transaction_date│      └─────────────────┘
         │               │ category_id(FK) │
         │               │ merchant_name   │
         │               │ is_recurring    │
         │               └─────────────────┘
         │
         │ 1:1
         ▼
┌─────────────────┐
│  applications   │
│─────────────────│
│ id (PK)         │
│ file_id (FK)    │
│ submission_id   │
│ company_*       │
│ app_*           │
│ owner_1_*       │
│ owner_2_*       │
│ confidence_score│
└─────────────────┘
```

---

## Dashboard Views → Table Mappings

| Dashboard View | Primary Query |
|----------------|---------------|
| **Companies Table** | `SELECT * FROM submissions WHERE org_id = :org ORDER BY created_at DESC` |
| **Company Details** | `SELECT * FROM applications WHERE submission_id = :id` |
| **Data Sources: Files** | `SELECT * FROM files WHERE submission_id = :id` |
| **Data Sources: Accounts** | `SELECT * FROM accounts WHERE submission_id = :id` |
| **Bank Statement Summary** | `SELECT * FROM bank_statements WHERE submission_id = :id ORDER BY statement_start_date` |
| **Transactions** | `SELECT t.*, c.label FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.submission_id = :id` |
| **Balance Insights** | `SELECT * FROM transactions WHERE submission_id = :id ORDER BY transaction_date` + aggregations |
| **P&L Reconstruction** | `SELECT c.analytics_group, SUM(t.amount) FROM transactions t JOIN categories c ... GROUP BY c.analytics_group` |
| **Debt Summary** | `SELECT * FROM transactions WHERE category_id IN (SELECT id FROM categories WHERE label LIKE 'Debt%') AND submission_id = :id` |
| **Recurring Transactions** | `SELECT * FROM transactions WHERE is_recurring = true AND submission_id = :id` |

---

## Processing Callback Examples

### Bank Statement Extraction Callback

```javascript
// Webhook receives this payload from extraction service
const webhookPayload = {
  file_id: "abc-123",
  submission_id: "def-456", 
  org_id: "ghi-789",
  schema_job_id: "job-999",
  result: {
    statement: {
      summary: {
        account_number: "1234567890",
        bank_name: "Chase",
        company: "ABC Trucking LLC",
        start_balance: 15000.00,
        end_balance: 18500.00,
        statement_start_date: "2024-11-01",
        statement_end_date: "2024-11-30",
        total_credits: 25000.00,
        total_debits: 21500.00,
        num_credits: 15,
        num_debits: 42,
        num_transactions: 57
      },
      transactions: [
        { amount: 5000.00, description: "DEPOSIT - ACH CUSTOMER PAYMENT", date: "2024-11-01", balance: 20000.00 },
        { amount: -150.00, description: "DEBIT CARD SHELL OIL", date: "2024-11-02", balance: 19850.00 },
        // ... more transactions
      ]
    }
  }
};

// Edge function processing:
// 1. Upsert account
// 2. Insert bank_statement
// 3. Insert all transactions
// 4. Update file status
// 5. Increment submission.files_processed
```

### Application Extraction Callback

```javascript
const webhookPayload = {
  file_id: "xyz-123",
  submission_id: "def-456",
  org_id: "ghi-789",
  result: {
    submission_id: "def-456",
    document_id: "xyz-123",
    source: "dashboard",
    file_name: "loan_application.pdf",
    extraction: {
      company: {
        legal_name: "ABC Trucking LLC",
        dba_name: "ABC Transport",
        ein: "12-3456789",
        // ...
      },
      application: {
        business_structure: "LLC",
        amount_requested: 150000,
        owner_1_first_name: "John",
        owner_1_last_name: "Smith",
        // ...
      },
      confidence_score: 0.92
    }
  }
};

// Edge function processing:
// 1. Insert application
// 2. Update file status
// 3. Update submission.company_name from application
// 4. Increment submission.files_processed
```

---

## Status Flows

### File Status Flow
```
uploaded → classifying → classified → processing → processed
                ↓              ↓            ↓
              failed        failed       failed
```

### Submission Status Flow
```
pending → processing → processed → review_required → reviewed
              ↓            ↓              ↓
           failed       failed         failed
```

---

*Generated: 2024-12-22*

# Webhook Callback Processing Logic

## Overview

When extraction webhooks return, edge functions must process the JSON and populate the database. This document shows the exact SQL operations needed.

---

## 1. Bank Statement Callback Processing

### Input: `bank_schema_final.json` response

### Step 1: Upsert Account

```sql
INSERT INTO accounts (
    id,
    submission_id,
    org_id,
    account_number,
    account_number_masked,
    bank_name,
    account_name,
    latest_balance,
    last_transaction_date
)
VALUES (
    gen_random_uuid(),
    :submission_id,
    :org_id,
    :json_statement_summary_account_number,
    mask_account_number(:json_statement_summary_account_number),
    :json_statement_summary_bank_name,
    :json_statement_summary_company,
    :json_statement_summary_end_balance,
    :json_statement_summary_statement_end_date
)
ON CONFLICT (submission_id, account_number)
DO UPDATE SET
    latest_balance = EXCLUDED.latest_balance,
    last_transaction_date = GREATEST(accounts.last_transaction_date, EXCLUDED.last_transaction_date),
    updated_at = now()
RETURNING id AS account_id;
```

### Step 2: Insert Bank Statement

```sql
INSERT INTO bank_statements (
    id,
    file_id,
    account_id,
    submission_id,
    org_id,
    account_number,
    bank_name,
    company_name,
    start_balance,
    end_balance,
    statement_start_date,
    statement_end_date,
    total_credits,
    total_debits,
    num_credits,
    num_debits,
    num_transactions,
    is_reconciled,
    reconciliation_difference
)
VALUES (
    gen_random_uuid(),
    :file_id,
    :account_id,  -- from step 1
    :submission_id,
    :org_id,
    :json_statement_summary_account_number,
    :json_statement_summary_bank_name,
    :json_statement_summary_company,
    :json_statement_summary_start_balance,
    :json_statement_summary_end_balance,
    :json_statement_summary_statement_start_date,
    :json_statement_summary_statement_end_date,
    :json_statement_summary_total_credits,
    :json_statement_summary_total_debits,
    :json_statement_summary_num_credits,
    :json_statement_summary_num_debits,
    :json_statement_summary_num_transactions,
    -- Calculate reconciliation
    (ABS(:start_balance + :calculated_txn_sum - :end_balance) < 0.01),
    (:start_balance + :calculated_txn_sum - :end_balance)
)
RETURNING id AS bank_statement_id;
```

### Step 3: Batch Insert Transactions

```sql
INSERT INTO transactions (
    id,
    bank_statement_id,
    account_id,
    submission_id,
    org_id,
    amount,
    description,
    transaction_date,
    running_balance,
    sequence_number
)
SELECT
    gen_random_uuid(),
    :bank_statement_id,
    :account_id,
    :submission_id,
    :org_id,
    (t->>'amount')::numeric,
    t->>'description',
    (t->>'date')::date,
    (t->>'balance')::numeric,
    row_number() OVER ()
FROM jsonb_array_elements(:json_statement_transactions) AS t;
```

### Step 4: Update File Status

```sql
UPDATE files
SET 
    status = 'processed',
    processing_completed_at = now(),
    updated_at = now()
WHERE id = :file_id;
```

*Note: This triggers `trg_update_submission_processed_count` which increments `submissions.files_processed`*

---

## 2. Application Callback Processing

### Input: `application_schema_final.json` response

### Step 1: Insert Application

```sql
INSERT INTO applications (
    id,
    file_id,
    submission_id,
    org_id,
    source,
    file_name,
    -- Company fields
    company_legal_name,
    company_dba_name,
    company_ein,
    company_industry,
    company_address_line1,
    company_address_line2,
    company_city,
    company_state,
    company_zip,
    company_phone,
    company_email,
    company_website,
    -- Application fields
    app_business_structure,
    app_start_date,
    app_years_in_business,
    app_number_of_employees,
    app_annual_revenue,
    app_amount_requested,
    app_loan_purpose,
    -- Owner 1
    owner_1_first_name,
    owner_1_middle_name,
    owner_1_last_name,
    owner_1_ssn,
    owner_1_dob,
    owner_1_ownership_pct,
    owner_1_address,
    owner_1_cell_phone,
    owner_1_home_phone,
    owner_1_email,
    -- Owner 2
    owner_2_first_name,
    owner_2_middle_name,
    owner_2_last_name,
    owner_2_ssn,
    owner_2_dob,
    owner_2_ownership_pct,
    owner_2_address,
    owner_2_cell_phone,
    owner_2_home_phone,
    owner_2_email,
    -- Quality
    confidence_score,
    raw_extraction
)
VALUES (
    gen_random_uuid(),
    :file_id,
    :submission_id,
    :org_id,
    :json_source,
    :json_file_name,
    -- extraction.company
    :json_extraction_company_legal_name,
    :json_extraction_company_dba_name,
    :json_extraction_company_ein,
    :json_extraction_company_industry,
    :json_extraction_company_address_line1,
    :json_extraction_company_address_line2,
    :json_extraction_company_city,
    :json_extraction_company_state,
    :json_extraction_company_zip,
    :json_extraction_company_phone,
    :json_extraction_company_email,
    :json_extraction_company_website,
    -- extraction.application
    :json_extraction_application_business_structure,
    :json_extraction_application_start_date,
    :json_extraction_application_years_in_business,
    :json_extraction_application_number_of_employees,
    :json_extraction_application_annual_revenue,
    :json_extraction_application_amount_requested,
    :json_extraction_application_loan_purpose,
    -- Owner 1
    :json_extraction_application_owner_1_first_name,
    :json_extraction_application_owner_1_middle_name,
    :json_extraction_application_owner_1_last_name,
    :json_extraction_application_owner_1_ssn,
    :json_extraction_application_owner_1_dob,
    :json_extraction_application_owner_1_ownership_pct,
    :json_extraction_application_owner_1_address::jsonb,
    :json_extraction_application_owner_1_cell_phone,
    :json_extraction_application_owner_1_home_phone,
    :json_extraction_application_owner_1_email,
    -- Owner 2
    :json_extraction_application_owner_2_first_name,
    :json_extraction_application_owner_2_middle_name,
    :json_extraction_application_owner_2_last_name,
    :json_extraction_application_owner_2_ssn,
    :json_extraction_application_owner_2_dob,
    :json_extraction_application_owner_2_ownership_pct,
    :json_extraction_application_owner_2_address::jsonb,
    :json_extraction_application_owner_2_cell_phone,
    :json_extraction_application_owner_2_home_phone,
    :json_extraction_application_owner_2_email,
    -- Quality
    :json_extraction_confidence_score,
    :full_json_payload::jsonb
);
```

### Step 2: Update Submission Company Name

```sql
UPDATE submissions
SET 
    company_name = :json_extraction_company_legal_name,
    updated_at = now()
WHERE id = :submission_id
AND company_name IS NULL;  -- Only set if not already set
```

### Step 3: Update File Status

```sql
UPDATE files
SET 
    status = 'processed',
    processing_completed_at = now(),
    updated_at = now()
WHERE id = :file_id;
```

---

## 3. Classification Callback Processing

### Input: Classifier response

```json
{
  "file_id": "abc-123",
  "classification_type": "bank_statement",
  "confidence": 0.95
}
```

### Update File Classification

```sql
UPDATE files
SET 
    classification_type = :classification_type,
    classification_confidence = :confidence,
    status = 'classified',
    updated_at = now()
WHERE id = :file_id;
```

---

## 4. Submission Metrics Refresh

After all files processed, recompute metrics:

```sql
INSERT INTO submission_metrics (
    submission_id,
    date_range_start,
    date_range_end,
    total_deposits,
    deposit_count,
    largest_deposit,
    total_withdrawals,
    withdrawal_count,
    largest_withdrawal,
    total_transactions,
    account_count,
    statement_count,
    calculated_at
)
SELECT
    :submission_id,
    MIN(t.transaction_date),
    MAX(t.transaction_date),
    SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END),
    COUNT(CASE WHEN t.amount > 0 THEN 1 END),
    MAX(CASE WHEN t.amount > 0 THEN t.amount END),
    SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END),
    COUNT(CASE WHEN t.amount < 0 THEN 1 END),
    MAX(CASE WHEN t.amount < 0 THEN ABS(t.amount) END),
    COUNT(*),
    (SELECT COUNT(DISTINCT id) FROM accounts WHERE submission_id = :submission_id),
    (SELECT COUNT(*) FROM bank_statements WHERE submission_id = :submission_id),
    now()
FROM transactions t
WHERE t.submission_id = :submission_id
ON CONFLICT (submission_id) 
DO UPDATE SET
    date_range_start = EXCLUDED.date_range_start,
    date_range_end = EXCLUDED.date_range_end,
    total_deposits = EXCLUDED.total_deposits,
    deposit_count = EXCLUDED.deposit_count,
    largest_deposit = EXCLUDED.largest_deposit,
    total_withdrawals = EXCLUDED.total_withdrawals,
    withdrawal_count = EXCLUDED.withdrawal_count,
    largest_withdrawal = EXCLUDED.largest_withdrawal,
    total_transactions = EXCLUDED.total_transactions,
    account_count = EXCLUDED.account_count,
    statement_count = EXCLUDED.statement_count,
    calculated_at = now(),
    updated_at = now();
```

---

## Error Handling

### On Extraction Failure

```sql
UPDATE files
SET 
    status = 'failed',
    error_message = :error_message,
    updated_at = now()
WHERE id = :file_id;
```

### On Classification Failure

```sql
UPDATE files
SET 
    status = 'failed',
    classification_type = 'other',  -- Fallback
    error_message = :error_message,
    updated_at = now()
WHERE id = :file_id;
```

---

## TypeScript/JavaScript Helper Types

```typescript
// For bank statement processing
interface BankStatementPayload {
  file_id: string;
  submission_id: string;
  org_id: string;
  schema_job_id: string;
  result: {
    statement: {
      summary: {
        account_number: string;
        bank_name: string;
        company: string;
        start_balance: number;
        end_balance: number;
        statement_start_date: string; // yyyy-mm-dd
        statement_end_date: string;
        total_credits: number;
        total_debits: number;
        num_credits: number;
        num_debits: number;
        num_transactions: number;
      };
      transactions: Array<{
        amount: number;
        description: string;
        date: string;
        balance: number;
      }>;
    };
  };
}

// For application processing
interface ApplicationPayload {
  file_id: string;
  submission_id: string;
  org_id: string;
  result: {
    submission_id: string;
    document_id: string;
    source: 'dashboard' | 'email' | 'api';
    file_name: string;
    extraction: {
      company: {
        legal_name: string;
        dba_name?: string;
        ein?: string;
        industry?: string;
        address_line1: string;
        address_line2?: string;
        city: string;
        state: string;
        zip: string;
        phone?: string;
        email?: string;
        website?: string;
      };
      application: {
        business_structure?: string;
        start_date?: string;
        years_in_business?: number;
        number_of_employees?: number;
        annual_revenue?: number;
        amount_requested?: number;
        loan_purpose?: string;
        owner_1_first_name: string;
        owner_1_middle_name?: string;
        owner_1_last_name: string;
        // ... more owner fields
      };
      confidence_score: number;
    };
  };
}
```

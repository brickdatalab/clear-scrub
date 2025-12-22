# Backend PDF Data Flow - ClearScrub

## Complete Journey: From Upload to Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER UPLOADS PDF VIA DASHBOARD                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 1: upload-documents Edge Function                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Endpoint: POST /functions/v1/upload-documents                              │
│ Auth: JWT Required (Authorization: Bearer {token})                         │
│ Input: Multipart form data with files + file types (bank_statement|app)   │
│                                                                             │
│ Process:                                                                    │
│ 1. Validate JWT & extract user.id from token                             │
│ 2. Look up user profile → extract org_id (multi-tenant isolation)         │
│ 3. Parse multipart form data (files array)                                │
│ 4. Create SUBMISSION record (org_id, user_id, ingestion_method='dashboard')│
│ 5. For each file:                                                         │
│    a. Upload to Supabase Storage:                                         │
│       Path: {org_id}/{submission_id}/{timestamp}_{filename}              │
│       Bucket: "incoming-documents"                                        │
│    b. Create DOCUMENT record in database:                                 │
│       - submission_id (links to batch)                                    │
│       - file_path (storage location)                                      │
│       - status: 'uploaded'                                                │
│       - mime_type, file_size_bytes, metadata                              │
│ 6. Fire-and-forget: Call document-metadata function (async)              │
│                                                                             │
│ Response: 202 Accepted (async processing initiated)                        │
│ Triggers Realtime: Document status broadcast for UI toast notifications   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
                            (Fire-and-Forget)
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│              STEP 2: document-metadata Edge Function (ASYNC)                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Triggered by: upload-documents (async POST call)                          │
│ Input: Storage event payload with file path, bucket, created_at           │
│                                                                             │
│ Process:                                                                    │
│ 1. Receive file path: "{org_id}/{submission_id}/{timestamp}_{filename}"  │
│ 2. Trigger n8n webhook to start OCR processing:                          │
│    - POST to n8n workflow with file_path, org_id, submission_id           │
│ 3. n8n Process (EXTERNAL SERVICE):                                        │
│    a. Download PDF from Supabase Storage                                  │
│    b. Send to Mistral AI for OCR extraction                               │
│    c. Parse structured JSON response                                      │
│    d. Generate webhook callback payload with extracted_data               │
│ 4. Return immediately (don't wait for n8n)                               │
│                                                                             │
│ ⏱️  Duration: ~15-35 seconds (n8n external processing)                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
                    (n8n OCR Processing - External)
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│         STEP 3: n8n Webhook Callback (Extracted Data Ready)                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Sent to: statement-schema-intake OR application-schema-intake              │
│ Header: X-Webhook-Secret: clearscrub_webhook_2025_xyz123                 │
│                                                                             │
│ Payload Structure:                                                         │
│ {                                                                          │
│   "document_id": "uuid",                                                   │
│   "file_path": "{org_id}/{submission_id}/{timestamp}_{filename}",         │
│   "extracted_data": {                                                      │
│     "statement": {                                                         │
│       "summary": { account_number, bank_name, company, balances, ... },  │
│       "transactions": [ { amount, description, date, balance }, ... ]    │
│     }                                                                      │
│   }                                                                        │
│ }                                                                          │
│                                                                             │
│ For BANK STATEMENTS → statement-schema-intake                             │
│ For APPLICATIONS → application-schema-intake                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│          STEP 4: statement-schema-intake Edge Function                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Endpoint: POST /functions/v1/statement-schema-intake                      │
│ Auth: X-Webhook-Secret header (shared secret, NOT JWT)                    │
│ Client: Supabase service_role_key (bypasses RLS for admin write)          │
│                                                                             │
│ Process (ENTITY RESOLUTION - 4-Step Matching):                            │
│ ┌──────────────────────────────────────────────────────────────────┐      │
│ │ Input: company_name, account_number, statement_period, ...       │      │
│ │                                                                  │      │
│ │ STEP 1: Try EIN match (if EIN provided)                         │      │
│ │ STEP 2: Try normalized_legal_name match (uppercase, no punct)  │      │
│ │ STEP 3: Try company_aliases lookup                             │      │
│ │ STEP 4: Create new company if no match found                   │      │
│ │                                                                  │      │
│ │ Result: company_id (guaranteed to exist)                        │      │
│ └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│ Database Operations:                                                       │
│ 1. Find or Create COMPANY:                                                │
│    - normalized_legal_name: uppercase, remove punctuation, legal suffixes │
│    - ein: if provided                                                     │
│                                                                             │
│ 2. Find or Create ACCOUNT:                                                │
│    - account_number_hash: SHA-256(digits_only)                            │
│    - account_number_masked: "****{last_4_digits}"                         │
│    - bank_name: from extracted data                                       │
│    - account_type: "checking" (default)                                   │
│                                                                             │
│ 3. Create STATEMENT record:                                               │
│    - company_id, account_id, submission_id                                │
│    - statement_period_start, statement_period_end                         │
│    - average_daily_balance, daily_balance_low, daily_balance_high         │
│    - total_deposits, total_withdrawals, deposit_count, withdrawal_count  │
│                                                                             │
│ 4. Create TRANSACTION records (bulk insert):                              │
│    For each line item in extracted_data.transactions:                     │
│    - statement_id, transaction_date, amount, description                  │
│    - type: classify as 'deposit' / 'withdrawal' / 'fee'                   │
│    - balance_after_transaction                                             │
│                                                                             │
│ 5. Update DOCUMENT status:                                                │
│    - status: 'complete'                                                   │
│    - processing_completed_at: timestamp                                   │
│                                                                             │
│ 6. Refresh MATERIALIZED VIEWS (async RPC call):                           │
│    - refresh_account_rollups_concurrent()                                 │
│    - refresh_company_rollups_concurrent()                                 │
│    (Pre-calculates monthly aggregates for fast dashboard queries)         │
│                                                                             │
│ Response: 200 OK                                                          │
│ Triggers Realtime: Companies INSERT/UPDATE, Documents UPDATE              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│          STEP 5: Realtime Broadcasts (Frontend Updates)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Supabase Realtime Channel: rt:org:{org_id}:dashboard                      │
│                                                                             │
│ Broadcasts:                                                                │
│ 1. INSERT on companies table                                              │
│    → Toast: "Company created - {company_name}"                            │
│    → Auto-refresh companies list                                          │
│                                                                             │
│ 2. UPDATE on documents table (status='complete')                          │
│    → Toast: "Document processed - {filename}"                             │
│    → Auto-refresh companies list (shows new data)                         │
│                                                                             │
│ 3. UPDATE on documents table (status='failed')                            │
│    → Toast: "Document failed - {filename}"                                │
│    → Display error message                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│              STEP 6: Dashboard Display (User Sees Data)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Frontend Endpoints (Read APIs - Require JWT):                              │
│                                                                             │
│ 1. GET /functions/v1/list-companies                                       │
│    Returns: Paginated company list with aggregates                        │
│                                                                             │
│ 2. GET /functions/v1/get-company-detail/{company_id}                     │
│    Returns: Company profile + monthly account rollups (NO transactions)   │
│                                                                             │
│ 3. GET /functions/v1/get-statement-transactions/{statement_id}           │
│    Returns: Lazy-loaded transactions for specific statement               │
│    (Only fetched when user expands statement panel)                        │
│                                                                             │
│ 4. GET /functions/v1/get-company-debts/{company_id}                      │
│    Returns: Debt analysis from transaction patterns                       │
│                                                                             │
│ RLS Enforcement:                                                           │
│ - All queries filtered by: org_id IN (SELECT org_id FROM profiles...)    │
│ - Users only see their organization's data                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Data Structures

### Submission (Upload Batch)
```
submissions {
  id: UUID,
  org_id: UUID,              # Multi-tenant root
  user_id: UUID,             # Who uploaded
  ingestion_method: 'dashboard',
  status: 'pending' | 'completed' | 'failed',
  metadata: {
    upload_timestamp,
    file_names: [...]
  }
}
```

### Document (Individual File)
```
documents {
  id: UUID,
  submission_id: UUID,       # Links to batch
  file_path: string,         # org_id/submission_id/timestamp_filename
  filename: string,
  status: 'uploaded' | 'processing' | 'complete' | 'failed',
  mime_type: 'application/pdf',
  file_size_bytes: number,
  processing_started_at: timestamp,
  processing_completed_at: timestamp,
  error_message?: string
}
```

### Company (Entity Resolution Result)
```
companies {
  id: UUID,
  org_id: UUID,
  legal_name: string,
  normalized_legal_name: string,  # UPPERCASE + no punctuation
  ein?: string,                    # Unique per org
  dba_name?: string,
  industry?: string,
  address_line1-2, city, state, zip
}
```

### Account (Bank Account)
```
accounts {
  id: UUID,
  company_id: UUID,
  bank_name: string,
  account_number_masked: string,   # ****1234
  account_number_hash: string,     # SHA-256(digits_only)
  account_type: 'checking' | 'savings',
  status: 'active'
}
```

### Statement (Monthly Period)
```
statements {
  id: UUID,
  account_id: UUID,
  company_id: UUID,
  submission_id: UUID,
  statement_period_start: date,
  statement_period_end: date,
  average_daily_balance: number,
  daily_balance_low: number,
  daily_balance_high: number,
  total_deposits: number,
  total_withdrawals: number,
  deposit_count: number,
  withdrawal_count: number
}
```

### Transaction (Line Item)
```
transactions {
  id: UUID,
  statement_id: UUID,
  transaction_date: date,
  amount: number,
  type: 'deposit' | 'withdrawal' | 'fee',
  description: string,
  balance_after_transaction: number
}
```

---

## Critical Design Decisions

### 1. Entity Resolution (4-Step Matching)
- **Problem:** Duplicate companies if statements uploaded before applications
- **Solution:** Try EIN → normalized_name → aliases → create new
- **Result:** Same company regardless of document order

### 2. Lazy-Loading Transactions
- **Problem:** 1.5MB+ payload with all transactions (2s+ load time)
- **Solution:** Separate API endpoint, transactions fetched on-demand
- **Result:** Main API <50KB, transactions load when user expands panel

### 3. Async Processing (202 Accepted Pattern)
- **Problem:** OCR takes 15-35 seconds, user shouldn't wait
- **Solution:** Return 202 immediately, process in background
- **Result:** Responsive UI, realtime status via Supabase Realtime

### 4. Service Role Key for Webhooks
- **Problem:** External n8n service doesn't have user sessions
- **Solution:** Webhooks use service_role_key to bypass RLS
- **Result:** Admin writes for data ingestion, RLS enforced for user reads

### 5. RLS Multi-Tenant Isolation
- **All tables filtered by:** `org_id = user's org_id`
- **Enforced at:** PostgreSQL level (can't be bypassed by client)
- **Result:** Complete data isolation between organizations

---

## Performance Targets

| Operation | Target | Method |
|-----------|--------|--------|
| GET /list-companies | <500ms | Index on (org_id, created_at) |
| GET /get-company-detail | <2s | Materialized views + lazy-load |
| POST /upload-documents | <200ms | Return 202, process async |
| PDF → Dashboard | 15-35s | n8n OCR + realtime broadcast |

---

## Realtime Events Broadcast

Supabase Realtime channel: `rt:org:{org_id}:dashboard`

**INSERT on companies**
- Fired when: Entity resolution creates new company
- UI Response: Toast "Company created", auto-refresh list

**UPDATE on documents (status='complete')**
- Fired when: statement-schema-intake finishes processing
- UI Response: Toast "Document processed", refresh dashboard

**UPDATE on documents (status='failed')**
- Fired when: Processing error (OCR fail, webhook fail, etc)
- UI Response: Toast "Document failed", show error message

---

## Complete Timeline Example

```
0ms:      User uploads statement_oct2024.pdf + classifies as "bank_statement"
50ms:     upload-documents: JWT validated, org_id extracted
100ms:    File uploaded to Storage: org_123/sub_456/1699000000000_statement_oct2024.pdf
150ms:    Document record created: status='uploaded'
200ms:    upload-documents returns 202 Accepted
250ms:    document-metadata async function fires
300ms:    n8n webhook triggered with file_path
1000ms:   n8n downloads PDF from Storage
3000ms:   Mistral OCR processes PDF
5000ms:   n8n extracts structured JSON (account_number, transactions, etc)
6000ms:   n8n sends callback to statement-schema-intake webhook
6100ms:   statement-schema-intake validates webhook secret
6150ms:   Entity resolution finds or creates company
6200ms:   Entity resolution finds or creates account
6250ms:   Creates statement record + 47 transaction records
6300ms:   Updates document status: 'complete'
6400ms:   Refreshes materialized views (account_monthly_rollups)
6500ms:   Realtime broadcasts: Documents UPDATE + Companies (if new)
6600ms:   Frontend toast: "Document processed - statement_oct2024.pdf"
6700ms:   Companies list auto-refreshes
6800ms:   User sees statement data in dashboard

⏱️ Total: ~6.8 seconds from upload to dashboard visibility
```

---

## Security & Isolation

### Authentication Context
| Context | Method | Used By | RLS Bypass |
|---------|--------|---------|-----------|
| User Reads | JWT (Authorization header) | Frontend → Read APIs | NO - RLS enforced |
| Webhook Intake | Shared secret (X-Webhook-Secret) | n8n → Intake webhooks | YES - service_role_key |
| Dashboard Sync | Realtime channel (org_id filtered) | Frontend → Supabase Realtime | N/A - client-side filtering |

### Data Isolation
- **Row Level Security** filters all queries by `org_id`
- **Webhook secret** prevents unauthorized ingestion
- **JWT validation** ensures users only access their org's data
- **Storage paths** include `org_id` for additional isolation

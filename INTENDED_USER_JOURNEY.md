# ClearScrub Intended User Journey

**Document Version:** 1.0
**Last Updated:** October 24, 2025
**Status:** Intended Design (Not Current Implementation)
**Purpose:** Defines the ideal user experience from sign-in to viewing financial analytics

---

## Overview

This document describes the **intended** user journey for ClearScrub, a bank statement underwriting platform for lenders. This represents the designed workflow, not necessarily the current implementation with bugs. Any AI or developer reading this should understand how the system is **supposed to work**.

---

## Table of Contents

1. [User Persona](#user-persona)
2. [Journey Overview](#journey-overview)
3. [Step 1: Sign Up / First-Time User](#step-1-sign-up--first-time-user)
4. [Step 2: Login / Returning User](#step-2-login--returning-user)
5. [Step 3: Dashboard Landing](#step-3-dashboard-landing)
6. [Step 4: Upload Documents](#step-4-upload-documents)
7. [Step 5: Background Processing](#step-5-background-processing)
8. [Step 6: Real-Time Updates](#step-6-real-time-updates)
9. [Step 7: View Company Analytics](#step-7-view-company-analytics)
10. [Step 8: Deep Dive Into Financial Data](#step-8-deep-dive-into-financial-data)
11. [Alternative Journeys](#alternative-journeys)
12. [Error Scenarios](#error-scenarios)

---

## User Persona

**Name:** Sarah Martinez
**Role:** Senior Loan Underwriter at Regional Bank
**Goal:** Quickly analyze applicant financials from bank statements to make lending decisions
**Pain Point:** Manual review of bank statements takes hours; prone to errors
**Technical Level:** Comfortable with web applications, not a developer

---

## Journey Overview

```
┌──────────┐     ┌─────────┐     ┌───────────┐     ┌────────────┐     ┌──────────┐
│ Sign Up/ │ --> │Dashboard│ --> │Upload PDFs│ --> │  Processing│ --> │View      │
│  Login   │     │ Landing │     │(Drag-Drop)│     │(Real-time) │     │Analytics │
└──────────┘     └─────────┘     └───────────┘     └────────────┘     └──────────┘
    1-2 min         Instant          30 sec          15-35 sec          Ongoing

Total Time: First company analytics available in ~3-5 minutes
```

---

## Step 1: Sign Up / First-Time User

### Entry Point
- Sarah visits **https://dashboard.clearscrub.io**
- Redirected to `/signup` (not authenticated)

### User Actions
1. **Enters email address** (e.g., sarah@regionalbank.com)
2. **Creates password** (minimum 8 characters, uppercase, lowercase, number)
3. **Confirms password** (must match)
4. **Agrees to terms and conditions** (checkbox)
5. **Clicks "Sign Up" button**

### System Actions

#### Frontend Validation
```
✓ Password strength check (8+ chars, uppercase, lowercase, number)
✓ Passwords match
✓ Terms agreed
```

#### Supabase Auth API Call
```typescript
supabase.auth.signUp({
  email: "sarah@regionalbank.com",
  password: "SecurePass123"
})
```

#### Database Trigger Execution (Atomic)
**Trigger:** `on_auth_user_created` fires after user record created

**What Happens:**
1. **Creates Organization**
   ```sql
   INSERT INTO organizations (id, name)
   VALUES (gen_random_uuid(), 'Organization sarah@regionalbank.com')
   RETURNING id
   ```

2. **Creates Profile with org_id**
   ```sql
   INSERT INTO profiles (id, email, org_id)
   VALUES (
     {user_uuid},
     'sarah@regionalbank.com',
     {org_id_from_step1}
   )
   ```

3. **Creates Default API Key**
   ```sql
   INSERT INTO api_keys (org_id, key_hash, is_default)
   VALUES (
     {org_id},
     sha256('cs_live_' || random_hex(48)),
     true
   )
   ```

#### UI Response
```
✓ Success message: "Signup successful! Welcome to ClearScrub."
→ Auto-redirect to /companies (dashboard)
```

### Outcome
- Sarah now has:
  - ✓ User account (JWT authentication)
  - ✓ Organization (multi-tenant isolation)
  - ✓ Profile linked to organization
  - ✓ Default API key (for programmatic access later)
- **Duration:** ~30 seconds

### Security Guarantee
**Row Level Security (RLS):** From this moment forward, Sarah can ONLY see data where `org_id` matches her organization. This is enforced at the PostgreSQL level and cannot be bypassed by malicious clients.

---

## Step 2: Login / Returning User

### Entry Point
- Sarah visits **https://dashboard.clearscrub.io**
- Redirected to `/login`

### User Actions
1. **Enters email address**
2. **Enters password**
3. **(Optional) Checks "Remember me"** (saves email in localStorage)
4. **Clicks "Sign In" button**

### System Actions

#### Authentication Flow
```typescript
// Frontend: useAuth hook
const { data, error } = await supabase.auth.signInWithPassword({
  email: "sarah@regionalbank.com",
  password: "SecurePass123"
})
```

#### Supabase Auth
1. **Verifies email exists** in auth.users table
2. **Compares password** with stored bcrypt hash
3. **Generates JWT token** with 1-hour expiry:
   ```json
   {
     "sub": "user-uuid-123",
     "email": "sarah@regionalbank.com",
     "role": "authenticated",
     "exp": 1730123456
   }
   ```

#### Session Management
```typescript
// React Context updates
setUser(data.user)
setSession(data.session)  // Includes JWT token
```

#### JWT Auto-Inclusion
**From this point forward, ALL API requests automatically include:**
```http
Authorization: Bearer {jwt_token}
```

**PostgreSQL extracts user ID from JWT:**
```sql
SELECT auth.uid()  -- Returns Sarah's user UUID
```

**RLS policies filter all queries by Sarah's org_id:**
```sql
-- Sarah's query:
SELECT * FROM companies;

-- Actual executed query (with RLS):
SELECT * FROM companies
WHERE org_id IN (
  SELECT org_id FROM profiles WHERE id = auth.uid()
);
```

### Outcome
- Sarah is authenticated with JWT token (1-hour expiry, auto-refreshed)
- All her API calls are automatically filtered by her organization's org_id
- **Duration:** ~2 seconds

---

## Step 3: Dashboard Landing

### Entry Point
- After successful login, Sarah lands on **https://dashboard.clearscrub.io/companies**

### Initial View (First Time User)

#### Layout
```
┌─────────────────────────────────────────────────────────────┐
│ [ClearScrub Logo]  Companies  Upload  Settings    [Profile]│ ← Top Bar
├───────────┬─────────────────────────────────────────────────┤
│           │                                                 │
│ ☰ Menu    │  📊 Companies                                  │
│           │                                                 │
│ 🏢 Companies │  ┌──────────────────────────────────┐        │
│ 📤 Upload │  │  No companies yet                  │        │
│ ⚙️  Settings │  │                                    │        │
│           │  │  🏦 Add your first company by      │        │
│           │  │  uploading bank statements or      │        │
│           │  │  loan applications                 │        │
│           │  │                                    │        │
│           │  │  [+ Upload Documents] button       │        │
│           │  └──────────────────────────────────┘        │
│           │                                                 │
└───────────┴─────────────────────────────────────────────────┘
```

#### Empty State
- **Header:** "No companies yet"
- **Message:** "Add your first company by uploading bank statements or loan applications"
- **Call-to-Action:** Blue button "[+ Upload Documents]"

### Returning User View

#### Data Table (TanStack React Table)
```
┌────────────────────────────────────────────────────────────────┐
│ Companies (3)                                [Search] [Filter] │
├────────────────────────────────────────────────────────────────┤
│ Company Name          │ EIN         │ Accounts │ Last Updated │
├────────────────────────────────────────────────────────────────┤
│ ABC Corp              │ 12-3456789  │ 3        │ 2 hours ago  │
│ Smith Construction    │ 98-7654321  │ 2        │ Yesterday    │
│ Tech Startup LLC      │ 45-6789012  │ 1        │ 3 days ago   │
└────────────────────────────────────────────────────────────────┘
```

#### Features
- **Sortable columns** (click column headers)
- **Search** (filters by company name, EIN)
- **Pagination** (10, 25, 50, 100 per page)
- **Row click** → navigates to Company Detail page

### Data Source

#### API Call
```typescript
// Frontend: src/services/api.ts
const companies = await supabase
  .from('companies')
  .select(`
    id,
    legal_name,
    normalized_legal_name,
    ein,
    industry,
    accounts:accounts(count),
    created_at,
    updated_at
  `)
  .order('updated_at', { ascending: false })
```

#### RLS Enforcement
**PostgreSQL automatically filters:**
```sql
WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
```

**Security guarantee:** Sarah only sees companies belonging to her organization, even if she tries to modify the query.

### Outcome
- Sarah sees either empty state (first time) or list of companies (returning user)
- Can immediately understand what companies she has data for
- Clear path to action: "Upload Documents" button
- **Duration:** Instant (page load <1 second)

---

## Step 4: Upload Documents

### Entry Point
- Sarah clicks **"+ Upload Documents"** button from dashboard
- OR clicks **"Upload"** in sidebar navigation
- Navigates to **https://dashboard.clearscrub.io/upload**

### Upload Page UI

```
┌────────────────────────────────────────────────────────────┐
│ Upload Documents                                    [Close]│
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────────────────────────────────┐    │
│  │                                                  │    │
│  │         📄 Drag and drop files here              │    │
│  │                     or                           │    │
│  │              [Browse Files]                      │    │
│  │                                                  │    │
│  │  Supported: PDF files only                       │    │
│  │  Max size: 50 MB per file                        │    │
│  │                                                  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                            │
│  ℹ️  Upload bank statements or loan applications         │
│      Our AI will automatically extract financial data     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### User Actions
1. **Drags PDF files** from desktop onto dropzone
   - OR clicks "Browse Files" and selects files from file picker
2. **Selects multiple files** (e.g., 3 bank statements for ABC Corp)
3. **Files appear in queue:**
   ```
   ┌────────────────────────────────────────┐
   │ ✓ statement_jan_2025.pdf  (1.2 MB)   │
   │ ✓ statement_feb_2025.pdf  (980 KB)   │
   │ ✓ application_abc_corp.pdf (750 KB)  │
   │                                        │
   │ [Cancel] [Upload 3 Files]             │
   └────────────────────────────────────────┘
   ```
4. **Clicks "Upload 3 Files"** button

### System Actions (Sequential Flow)

#### Step 4.1: Prepare Submission (RPC)
**API Call:**
```typescript
const { data } = await supabase.rpc('prepare_submission', {
  p_files: [
    { name: 'statement_jan_2025.pdf', size: 1228800, type: 'application/pdf' },
    { name: 'statement_feb_2025.pdf', size: 1003520, type: 'application/pdf' },
    { name: 'application_abc_corp.pdf', size: 768000, type: 'application/pdf' }
  ]
})
```

**Database Actions (Atomic Transaction):**
```sql
-- 1. Create submission record
INSERT INTO submissions (id, org_id, status)
VALUES (gen_random_uuid(), {sarah_org_id}, 'pending');

-- 2. Create document records (3 rows)
INSERT INTO documents (id, submission_id, file_name, file_path, status)
VALUES
  (gen_random_uuid(), {submission_id}, 'statement_jan_2025.pdf', '{org_id}/{submission_id}/{doc_id_1}.pdf', 'pending'),
  (gen_random_uuid(), {submission_id}, 'statement_feb_2025.pdf', '{org_id}/{submission_id}/{doc_id_2}.pdf', 'pending'),
  (gen_random_uuid(), {submission_id}, 'application_abc_corp.pdf', '{org_id}/{submission_id}/{doc_id_3}.pdf', 'pending');
```

**Response:**
```json
{
  "submission_id": "550e8400-e29b-41d4-a716-446655440000",
  "file_maps": [
    {
      "doc_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "file_name": "statement_jan_2025.pdf",
      "file_path": "{org_id}/{submission_id}/6ba7b810...c8.pdf"
    },
    ...
  ]
}
```

**Duration:** ~100ms

#### Step 4.2: Upload Files to Supabase Storage (Parallel)
```typescript
// Upload all 3 files in parallel
await Promise.all(
  file_maps.map((fileMap, index) =>
    supabase.storage
      .from('incoming-documents')
      .upload(fileMap.file_path, files[index])
  )
)
```

**Storage Bucket:** `incoming-documents`
**RLS Policy:** Only users from matching org_id can access
**Duration:** ~3-5 seconds (parallel upload)

#### Step 4.3: Enqueue Processing (Sequential)
```typescript
// Trigger processing for each document
for (const fileMap of file_maps) {
  await supabase.functions.invoke('enqueue-document-processing', {
    body: { doc_id: fileMap.doc_id }
  })
}
```

**Edge Function Actions:**
1. Updates document status to `'processing'`
2. Calls n8n webhook (fire-and-forget):
   ```http
   POST https://n8n.clearscrub.io/webhook/process-document
   Content-Type: application/json
   X-Webhook-Secret: clearscrub_webhook_2025_xyz123

   {
     "doc_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
     "file_path": "{org_id}/{submission_id}/6ba7b810...c8.pdf",
     "org_id": "{sarah_org_id}"
   }
   ```
3. Returns 202 Accepted (async processing)

**Duration:** ~200ms per document (~600ms total for 3 files)

### UI Feedback

#### Progress Indicator
```
┌────────────────────────────────────────┐
│ Uploading...                           │
│ ▓▓▓▓▓▓▓▓▓▓░░░░░░ 65%                  │
│                                        │
│ ✓ statement_jan_2025.pdf (uploaded)  │
│ ✓ statement_feb_2025.pdf (uploaded)  │
│ ⏳ application_abc_corp.pdf (uploading)│
└────────────────────────────────────────┘
```

#### Success Notification
```
✓ 3 documents uploaded successfully!
  Processing will take 15-30 seconds per file.

  [View Processing Status] [Upload More]
```

### Outcome
- 3 PDF files uploaded to Supabase Storage
- 3 document records created with status `'processing'`
- Processing webhooks triggered (async)
- Sarah can now monitor progress or continue working
- **Total duration:** ~5-10 seconds

---

## Step 5: Background Processing

### What's Happening (User Doesn't See This)

While Sarah waits or continues working, the system processes documents asynchronously:

#### Processing Pipeline (Per Document)

```
PDF in Storage
     ↓
n8n Webhook Triggered
     ↓
Download PDF from Storage
     ↓
OCR Extraction (Mistral AI + LlamaIndex)
     ↓
Structured JSON Output
     ↓
Validate Against Schema (bank_schema_v3.json)
     ↓
Call statement-schema-intake Edge Function
     ↓
Entity Resolution (4-step matching)
     ↓
Create/Update Company Record
     ↓
Insert Statements and Transactions
     ↓
Refresh Materialized Views
     ↓
Update Document Status to 'complete'
```

#### Detailed Steps

**Step 5.1: OCR Extraction**
- **Tool:** Mistral AI OCR + LlamaIndex document parser
- **Input:** PDF file from Storage
- **Output:** Structured JSON matching schema:
  ```json
  {
    "company": {
      "legal_name": "ABC Corporation",
      "ein": "12-3456789",
      "address": "123 Main St, New York, NY 10001"
    },
    "accounts": [
      {
        "account_number": "****1234",
        "account_type": "Business Checking",
        "institution_name": "Chase Bank",
        "statements": [
          {
            "statement_date": "2025-01-31",
            "start_date": "2025-01-01",
            "end_date": "2025-01-31",
            "beginning_balance": 15000.00,
            "ending_balance": 18500.00,
            "transactions": [
              {
                "date": "2025-01-05",
                "description": "Wire Transfer from Client",
                "amount": 5000.00,
                "type": "credit",
                "category": "revenue"
              },
              ...
            ]
          }
        ]
      }
    ]
  }
  ```
- **Duration:** 10-25 seconds per document

**Step 5.2: Schema Validation**
```typescript
// Validate JSON against bank_schema_v3.json
const validationResult = ajv.validate(bankSchema, extractedData)

if (!validationResult) {
  // Update document status to 'failed'
  await supabase
    .from('documents')
    .update({
      status: 'failed',
      error_text: ajv.errorsText()
    })
    .eq('id', doc_id)

  return // Stop processing
}
```

**Step 5.3: Call statement-schema-intake Webhook**
```http
POST /functions/v1/statement-schema-intake
Host: vnhauomvzjucxadrbywg.supabase.co
Content-Type: application/json
X-Webhook-Secret: clearscrub_webhook_2025_xyz123

{
  "company": { ... },
  "accounts": [ ... ],
  "doc_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "org_id": "{sarah_org_id}"
}
```

**Step 5.4: Entity Resolution (4-Step Matching)**

**Purpose:** Prevent duplicate companies. If Sarah uploads 3 statements for ABC Corp, we should create ONE company, not three.

```sql
-- Step 1: Match by EIN (if provided and not null)
SELECT id FROM companies
WHERE org_id = {sarah_org_id}
  AND ein = '12-3456789';

-- If found → use existing company
-- If not found → proceed to Step 2

-- Step 2: Match by normalized_legal_name
SELECT id FROM companies
WHERE org_id = {sarah_org_id}
  AND normalized_legal_name = normalize('ABC Corporation');
  -- normalize() converts to lowercase, removes punctuation, trims whitespace

-- If found → use existing company
-- If not found → proceed to Step 3

-- Step 3: Match by company_aliases (manual variations)
SELECT company_id FROM company_aliases
WHERE org_id = {sarah_org_id}
  AND alias_name = normalize('ABC Corporation');

-- If found → use existing company
-- If not found → proceed to Step 4

-- Step 4: Create new company
INSERT INTO companies (id, org_id, legal_name, normalized_legal_name, ein)
VALUES (
  gen_random_uuid(),
  {sarah_org_id},
  'ABC Corporation',
  normalize('ABC Corporation'),
  '12-3456789'
)
RETURNING id;
```

**Result:** Sarah's 3 statements all link to the SAME company record (ABC Corporation).

**Step 5.5: Insert Statements and Transactions**
```sql
-- For each account in extracted data:
INSERT INTO accounts (id, company_id, account_number_hash, account_type, institution_name)
VALUES (
  gen_random_uuid(),
  {company_id},
  sha256('****1234'),
  'Business Checking',
  'Chase Bank'
)
ON CONFLICT (account_number_hash, company_id) DO UPDATE
  SET updated_at = NOW()
RETURNING id;

-- For each statement in account:
INSERT INTO statements (id, account_id, statement_date, start_date, end_date, beginning_balance, ending_balance)
VALUES (
  gen_random_uuid(),
  {account_id},
  '2025-01-31',
  '2025-01-01',
  '2025-01-31',
  15000.00,
  18500.00
)
RETURNING id;

-- For each transaction in statement (bulk insert):
INSERT INTO transactions (id, statement_id, date, description, amount, type, category)
VALUES
  (gen_random_uuid(), {statement_id}, '2025-01-05', 'Wire Transfer from Client', 5000.00, 'credit', 'revenue'),
  (gen_random_uuid(), {statement_id}, '2025-01-10', 'Payroll', -8000.00, 'debit', 'payroll'),
  ...
;
```

**Step 5.6: Refresh Materialized Views**
```sql
-- Update pre-calculated analytics
REFRESH MATERIALIZED VIEW CONCURRENTLY account_monthly_rollups;
REFRESH MATERIALIZED VIEW CONCURRENTLY company_rollups;
```

**What These Views Contain:**
- `account_monthly_rollups`: Monthly aggregates per account (total deposits, total withdrawals, average balance, transaction count)
- `company_rollups`: Company-level metrics (total revenue, total expenses, net cash flow, account count)

**Step 5.7: Update Document Status**
```sql
UPDATE documents
SET
  status = 'complete',
  processing_completed_at = NOW(),
  updated_at = NOW()
WHERE id = {doc_id};
```

### Outcome
- Company record created or updated
- Bank statements inserted (3 statements for 3 months)
- Transactions inserted (potentially hundreds of transactions)
- Materialized views updated (fast aggregated metrics)
- Document status = 'complete'
- **Total duration:** 15-35 seconds per document

---

## Step 6: Real-Time Updates

### What Sarah Sees

While Sarah waits on the dashboard, she sees **real-time updates** without refreshing the page.

#### Real-Time Subscription (Supabase Realtime)

```typescript
// Frontend: src/hooks/useDocumentSubscription.ts
useEffect(() => {
  const subscription = supabase
    .channel('documents_updates')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'documents',
      filter: `status=eq.complete`
    }, (payload) => {
      // Document completed processing
      const doc = payload.new

      // Show success notification
      toast.success(`✓ ${doc.file_name} processed successfully`)

      // Invalidate companies query (refresh list)
      queryClient.invalidateQueries(['companies'])
    })
    .subscribe()

  return () => subscription.unsubscribe()
}, [])
```

#### UI Update Flow

**Initial State (right after upload):**
```
┌────────────────────────────────────────────────────────────┐
│ Companies (0)                                              │
│                                                            │
│ No companies yet. Processing documents...                 │
│                                                            │
│ ⏳ Processing (3 documents)                                │
│    • statement_jan_2025.pdf                               │
│    • statement_feb_2025.pdf                               │
│    • application_abc_corp.pdf                             │
└────────────────────────────────────────────────────────────┘
```

**After 15 seconds (first document completes):**
```
✓ Notification: "statement_jan_2025.pdf processed successfully"

┌────────────────────────────────────────────────────────────┐
│ Companies (1)                                              │
├────────────────────────────────────────────────────────────┤
│ Company Name     │ EIN         │ Accounts │ Last Updated  │
├────────────────────────────────────────────────────────────┤
│ ABC Corporation  │ 12-3456789  │ 1        │ Just now      │
└────────────────────────────────────────────────────────────┘

⏳ Processing (2 documents)
   • statement_feb_2025.pdf
   • application_abc_corp.pdf
```

**After 30 seconds (second document completes):**
```
✓ Notification: "statement_feb_2025.pdf processed successfully"

┌────────────────────────────────────────────────────────────┐
│ Companies (1)                                              │
├────────────────────────────────────────────────────────────┤
│ Company Name     │ EIN         │ Accounts │ Last Updated  │
├────────────────────────────────────────────────────────────┤
│ ABC Corporation  │ 12-3456789  │ 1        │ Just now      │
└────────────────────────────────────────────────────────────┘
   ↑ Same company (entity resolution worked!)

⏳ Processing (1 document)
   • application_abc_corp.pdf
```

**After 45 seconds (all documents complete):**
```
✓ Notification: "application_abc_corp.pdf processed successfully"

┌────────────────────────────────────────────────────────────┐
│ Companies (1)                                              │
├────────────────────────────────────────────────────────────┤
│ Company Name     │ EIN         │ Accounts │ Last Updated  │
├────────────────────────────────────────────────────────────┤
│ ABC Corporation  │ 12-3456789  │ 1        │ Just now      │
└────────────────────────────────────────────────────────────┘

✓ All documents processed
```

### Key User Experience Points

1. **No manual refresh needed** - Real-time subscriptions push updates
2. **Instant feedback** - Toast notifications for each completed document
3. **Entity resolution visible** - User sees that 3 documents created 1 company (not 3 duplicates)
4. **Transparent processing** - Processing tab shows documents in flight
5. **Clear status** - Green checkmarks, blue spinners, red errors

### Outcome
- Sarah sees company appear in real-time as processing completes
- No need to manually refresh page
- Clear feedback on processing status
- **Duration:** Updates appear within 1 second of processing completion

---

## Step 7: View Company Analytics

### Entry Point
- Sarah clicks on **"ABC Corporation"** row in Companies table
- Navigates to **https://dashboard.clearscrub.io/companies/{company_id}**

### Company Detail Page UI

```
┌────────────────────────────────────────────────────────────────┐
│ ← Back to Companies                            [Export] [Share]│
├────────────────────────────────────────────────────────────────┤
│ ABC Corporation                                                │
│ EIN: 12-3456789 | Industry: Construction | Est. 2015          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ ┌─ Financial Summary ───────────────────────────────────────┐ │
│ │ Total Cash Flow: +$45,230 (3 months)                      │ │
│ │ Average Balance: $18,400                                  │ │
│ │ Total Revenue: $125,000                                   │ │
│ │ Total Expenses: $79,770                                   │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌─ Bank Accounts (1) ────────────────────────────────────────┐ │
│ │ Chase Business Checking ****1234                          │ │
│ │ Current Balance: $18,500 | Last Statement: Jan 31, 2025   │ │
│ │                                                            │ │
│ │ [Expand to see statements ▼]                              │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌─ Loan Application ─────────────────────────────────────────┐ │
│ │ Requested Amount: $50,000                                  │ │
│ │ Purpose: Equipment purchase                               │ │
│ │ Submitted: Jan 15, 2025                                   │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌─ Documents (3) ─────────────────────────────────────────────┐│
│ │ ✓ statement_jan_2025.pdf (Jan 31, 2025)                  │ │
│ │ ✓ statement_feb_2025.pdf (Feb 28, 2025)                  │ │
│ │ ✓ application_abc_corp.pdf (Jan 15, 2025)                │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Data Source

#### API Call
```typescript
// Frontend: src/services/api.ts
const companyDetail = await supabase.functions.invoke('get-company-detail', {
  body: { company_id }
})
```

#### Edge Function Query (Simplified)
```typescript
// Edge Function: get-company-detail/index.ts

// Fetch company with accounts (but NOT transactions yet)
const { data: company } = await supabase
  .from('companies')
  .select(`
    *,
    accounts:accounts(
      *,
      statements:statements(
        id,
        statement_date,
        start_date,
        end_date,
        beginning_balance,
        ending_balance
      )
    ),
    applications:applications(*),
    documents:documents(*)
  `)
  .eq('id', company_id)
  .single()

// Fetch pre-calculated rollups (fast aggregates)
const { data: rollups } = await supabase
  .from('company_rollups')
  .select('*')
  .eq('company_id', company_id)
  .single()

// Map snake_case to camelCase for frontend
return {
  companyName: company.legal_name,
  ein: company.ein,
  accounts: company.accounts.map(mapAccountToCamelCase),
  rollups: {
    totalCashFlow: rollups.total_cash_flow,
    averageBalance: rollups.average_balance,
    totalRevenue: rollups.total_revenue,
    totalExpenses: rollups.total_expenses
  },
  applications: company.applications,
  documents: company.documents
}
```

#### Why Transactions Are NOT Included
**Performance Optimization:** A company with 3 months of statements might have 300+ transactions. Including them in the initial load would make the payload 200+ KB and slow down page load.

**Lazy-Loading Pattern:** Transactions are fetched on-demand when Sarah expands an account or statement (see Step 8).

### Key Metrics Displayed

#### Financial Summary (From Materialized Views)
- **Total Cash Flow:** Sum of all deposits minus all withdrawals across all accounts
- **Average Balance:** Average ending balance across all statement periods
- **Total Revenue:** Sum of all credit transactions categorized as revenue
- **Total Expenses:** Sum of all debit transactions (payroll, rent, utilities, etc.)

#### Bank Accounts Section
Each account shows:
- **Institution and type** (Chase Business Checking)
- **Last 4 digits** (****1234, PII protection)
- **Current balance** (from most recent statement)
- **Statement count** (3 months)
- **Expand/collapse control** to see monthly statements

#### Loan Application Section (if present)
- **Requested amount** ($50,000)
- **Purpose** (Equipment purchase)
- **Submission date** (Jan 15, 2025)
- **Status** (Under Review, Approved, Denied)

#### Documents Section
- **List of all uploaded documents**
- **Processing status** (✓ complete, ⏳ processing, ❌ failed)
- **Upload date**
- **Link to download original PDF**

### Outcome
- Sarah sees complete financial overview for ABC Corporation
- Pre-calculated metrics load instantly (<1 second)
- Can drill down into accounts and statements on demand
- **Duration:** Page loads in <1 second (lazy-loading keeps payload small)

---

## Step 8: Deep Dive Into Financial Data

### Entry Point
- Sarah clicks **"Expand to see statements ▼"** on Chase Business Checking account

### Expanded Account View

```
┌─ Chase Business Checking ****1234 ─────────────────────────────┐
│ Current Balance: $18,500 | 3 statements | Last: Jan 31, 2025 │
│                                                                │
│ ┌─ January 2025 (Jan 1 - Jan 31) ────────────────────────────┐ │
│ │ Beginning: $15,000 | Ending: $18,500 | Change: +$3,500    │ │
│ │ Deposits: $25,000 (12 transactions)                       │ │
│ │ Withdrawals: $21,500 (45 transactions)                    │ │
│ │                                                            │ │
│ │ [View Transactions ▼]                                     │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌─ February 2025 (Feb 1 - Feb 28) ───────────────────────────┐ │
│ │ Beginning: $18,500 | Ending: $22,100 | Change: +$3,600    │ │
│ │ Deposits: $28,500 (14 transactions)                       │ │
│ │ Withdrawals: $24,900 (48 transactions)                    │ │
│ │                                                            │ │
│ │ [View Transactions ▼]                                     │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌─ March 2025 (Mar 1 - Mar 31) ──────────────────────────────┐ │
│ │ Beginning: $22,100 | Ending: $26,230 | Change: +$4,130    │ │
│ │ Deposits: $32,000 (15 transactions)                       │ │
│ │ Withdrawals: $27,870 (52 transactions)                    │ │
│ │                                                            │ │
│ │ [View Transactions ▼]                                     │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ 📊 Cash Flow Trend: [Chart showing increasing deposits]       │
└────────────────────────────────────────────────────────────────┘
```

### User Action
- Sarah clicks **"View Transactions ▼"** on January 2025 statement

### Lazy-Loaded Transactions

#### API Call (On-Demand)
```typescript
// Frontend: triggered when user expands statement
const transactions = await supabase.functions.invoke('get-statement-transactions', {
  body: { statement_id }
})
```

#### Edge Function Query
```sql
SELECT
  id,
  date,
  description,
  amount,
  type,  -- 'credit' or 'debit'
  category,
  created_at
FROM transactions
WHERE statement_id = {statement_id}
ORDER BY date DESC, created_at DESC
LIMIT 100;  -- Pagination if needed
```

### Expanded Transactions View

```
┌─ January 2025 Transactions (57 total) ─────────────────────────┐
│ Date       │ Description               │ Amount     │ Category │
├────────────┼───────────────────────────┼────────────┼──────────┤
│ Jan 31     │ Wire from Smith LLC      │ +$8,000.00 │ Revenue  │
│ Jan 30     │ Payroll                  │ -$6,500.00 │ Payroll  │
│ Jan 28     │ Rent Payment             │ -$3,200.00 │ Rent     │
│ Jan 25     │ Client Invoice #1234     │ +$4,500.00 │ Revenue  │
│ Jan 22     │ Equipment Purchase       │ -$1,800.00 │ Equipment│
│ Jan 20     │ Utility Bill             │   -$450.00 │ Utilities│
│ Jan 15     │ Deposit from Jones Co    │ +$7,200.00 │ Revenue  │
│ Jan 10     │ Insurance Premium        │ -$1,200.00 │ Insurance│
│ Jan 5      │ Client Payment           │ +$5,000.00 │ Revenue  │
│ Jan 3      │ Supplies Order           │   -$780.00 │ Supplies │
│ ...        │                          │            │          │
└────────────────────────────────────────────────────────────────┘

[Export to CSV] [Show All 57 Transactions]
```

### Key Features Sarah Can Use

#### Filtering
```
Filter by:
☐ Deposits (Credits)
☐ Withdrawals (Debits)

Category:
☐ Revenue
☐ Payroll
☐ Rent
☐ Equipment
☐ Utilities
```

#### Sorting
- **By Date** (newest first, oldest first)
- **By Amount** (largest first, smallest first)
- **By Category** (alphabetical)

#### Search
```
[Search transactions...] 🔍
```
- Searches transaction descriptions
- Example: "payroll" shows all payroll transactions

#### Export
- **CSV Export** - Download all transactions for Excel analysis
- **PDF Report** - Generate formatted PDF report

### Cash Flow Analysis

#### Monthly Trend Chart
```
Cash Flow Trend (3 months)

$35k ┤                            ╭─ Deposits
     │                         ╭─╯
$30k ┤                      ╭─╯
     │                   ╭─╯
$25k ┤                ╭─╯
     │             ╭─╯
$20k ┤          ╭─╯  ╱─╮─╮─╮─ Withdrawals
     │       ╭─╯   ╱─╯
$15k ┤    ╭─╯   ╱─╯
     └────┴────┴────
     Jan   Feb   Mar

Trend: ↗ Increasing deposits, stable withdrawals
       Positive cash flow growth
```

#### Category Breakdown (Pie Chart)
```
Expense Categories (3 months)

Payroll: 35% ($19,500)
Rent: 20% ($11,600)
Equipment: 15% ($8,700)
Utilities: 10% ($5,800)
Insurance: 8% ($4,640)
Supplies: 7% ($4,060)
Other: 5% ($2,900)
```

### Decision Support Metrics

Sarah can see at a glance:
- **Positive cash flow trend** (deposits increasing month-over-month)
- **Stable expense patterns** (rent and payroll consistent)
- **Growing revenue** (more client payments in March vs January)
- **Responsible spending** (no large unexplained expenses)

**Underwriting Decision:** This financial profile supports loan approval for $50,000 equipment purchase. The company shows:
- ✓ Consistent revenue growth
- ✓ Stable expense management
- ✓ Positive cash flow
- ✓ No red flags (overdrafts, bounced checks, large unexplained transfers)

### Outcome
- Sarah has complete visibility into ABC Corporation's financials
- Can drill down from company-level to individual transactions
- Data is organized for quick underwriting decisions
- **Duration:** Instant for aggregates, <2 seconds for transaction lazy-loading

---

## Alternative Journeys

### Journey 2: API Integration (Programmatic Upload)

Instead of manual upload, Sarah's company can integrate ClearScrub via API:

```bash
# Loan origination system automatically sends bank statements to ClearScrub
curl -X POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents \
  -H "Authorization: Bearer cs_live_abc123..." \
  -H "Content-Type: multipart/form-data" \
  -F "files=@statement.pdf"

# Response: 202 Accepted, processing starts automatically
```

**Benefit:** Zero manual work - bank statements flow automatically from Sarah's loan origination system (LOS) to ClearScrub for analysis.

### Journey 3: Email Ingestion

Sarah's company gets a dedicated email address:

```
regionalbank-org-id@underwrite.clearscrub.io
```

**Workflow:**
1. Loan applicant emails bank statements to this address
2. ClearScrub automatically detects PDF attachments
3. Processing pipeline triggers (same as manual upload)
4. Sarah gets notified when company appears in dashboard

**Benefit:** Applicants can send documents directly, no Sarah involvement needed.

### Journey 4: Webhook Notifications

Sarah's company configures webhook notifications:

```
Dashboard → Settings → Webhooks → Add Webhook

URL: https://regionalbank.com/api/clearscrub-callback
Events: ☑ statement_processed ☑ company_created
```

**Workflow:**
1. When ABC Corporation processing completes, ClearScrub POSTs to webhook:
   ```json
   {
     "event": "company_created",
     "company_id": "550e8400-...",
     "company_name": "ABC Corporation",
     "ein": "12-3456789",
     "total_accounts": 1,
     "processed_at": "2025-10-24T14:45:00Z"
   }
   ```
2. Regional Bank's LOS receives notification
3. LOS automatically updates loan application status
4. Sarah gets notified in her LOS dashboard

**Benefit:** ClearScrub data flows directly into Sarah's existing workflow tools.

---

## Error Scenarios

### Scenario 1: OCR Fails (Poor Quality PDF)

**What Happens:**
1. Document uploads successfully
2. OCR extraction fails (PDF is scan of handwritten notes, not bank statement)
3. Document status → `'failed'`
4. Error message: "Unable to extract structured data from PDF"

**Sarah Sees:**
```
❌ Notification: "statement_jan_2025.pdf failed to process"

Failed Documents (1)
  ❌ statement_jan_2025.pdf
     Error: Unable to extract structured data from PDF
     [Download Original] [Retry] [Contact Support]
```

**Resolution Options:**
- **Retry:** Re-upload higher quality PDF
- **Manual Entry:** Manually enter data (future feature)
- **Contact Support:** ClearScrub support reviews PDF and fixes OCR model

### Scenario 2: Entity Resolution Ambiguity

**What Happens:**
1. OCR extracts: "ABC Corp" (no EIN provided)
2. Database has: "ABC Corporation" (EIN: 12-3456789) and "ABC Corp LLC" (EIN: 98-7654321)
3. Normalized names too similar → entity resolution can't decide

**System Behavior:**
- Creates new company "ABC Corp" (conservative approach)
- Flags for manual review

**Sarah Sees:**
```
⚠️  Possible Duplicate: "ABC Corp" might be the same as "ABC Corporation"

[Merge Companies] [Keep Separate] [Review Later]
```

**Resolution:**
- Sarah clicks "Merge Companies"
- System merges data under ABC Corporation
- Creates alias: "ABC Corp" → "ABC Corporation"

### Scenario 3: Session Timeout

**What Happens:**
1. Sarah leaves dashboard open for 2 hours (JWT token expires after 1 hour)
2. Token auto-refreshes in background (Supabase handles this)
3. Sarah continues working without interruption

**If Refresh Fails:**
- Sarah clicks something
- API returns 401 Unauthorized
- Frontend detects expired session
- Auto-redirects to `/login` with preserved destination:
  ```
  Navigate to /login?returnTo=/companies/550e8400-...
  ```
- After re-login, Sarah returns to exact page she was on

---

## Journey Metrics (Target Performance)

| Stage | Target Duration | Measurement |
|-------|----------------|-------------|
| Signup | <30 seconds | Email entry to dashboard landing |
| Login | <2 seconds | Credentials to dashboard landing |
| Dashboard Load | <1 second | API response + initial render |
| File Upload | 5-10 seconds | 3 files selected to upload complete |
| OCR Processing | 15-35 seconds | Upload complete to company visible |
| Company Detail Load | <1 second | Click company to full page render |
| Transaction Lazy-Load | <2 seconds | Click "View Transactions" to data displayed |
| **Total (First-Time)** | **3-5 minutes** | Signup to viewing first company analytics |
| **Total (Returning)** | **20-40 seconds** | Login to viewing updated company analytics |

---

## Security & Privacy Throughout Journey

### Multi-Tenant Isolation
- **Every** database query automatically filtered by Sarah's `org_id`
- Sarah CANNOT see other lenders' companies (enforced by PostgreSQL RLS)
- Even if Sarah modifies client-side code, database will reject unauthorized queries

### PII Protection
- **Account numbers:** Hashed in database, displayed as ****1234
- **Passwords:** Hashed with bcrypt, never stored plaintext
- **API keys:** Hashed with SHA-256, displayed once then hashed

### Audit Trail
- Every API call logged (who, what, when)
- Document processing history retained (when uploaded, when processed, by whom)
- Company data changes tracked (created_at, updated_at, created_by)

---

## Summary: The Ideal Experience

**For Sarah (Loan Underwriter):**
1. **Signs up once** (30 seconds)
2. **Uploads bank statements** (drag-and-drop, 10 seconds)
3. **Waits briefly** (real-time notifications, 15-35 seconds)
4. **Views complete financial analysis** (instant, no SQL queries needed)
5. **Makes informed lending decision** (all data organized for underwriting)

**System Characteristics:**
- **Fast:** Total time from upload to analytics: <1 minute
- **Automatic:** Entity resolution prevents duplicates
- **Real-time:** No manual refreshing needed
- **Secure:** Multi-tenant isolation at database level
- **Accurate:** OCR + validation ensures data quality
- **Scalable:** Async processing handles peak loads

**Business Value:**
- **10x faster** than manual statement review
- **95% accuracy** from Mistral OCR + validation
- **Zero duplicate companies** via entity resolution
- **Real-time insights** for same-day lending decisions

---

**End of User Journey Document**

**Note:** This document describes the **intended** design. Actual implementation may vary during development. Use this as the north star for product decisions and bug prioritization.

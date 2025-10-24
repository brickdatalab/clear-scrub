# CLAUDE.md - Supabase Database Backend

**Last Updated:** 2025-10-21
**Status:** Production Schema Deployed | JWT Config Fixed Oct 21 | Pipeline Untested | No Test Data
**Project ID:** vnhauomvzjucxadrbywg

---

## Section 1: User Flow (THE CENTERPIECE)

### Complete Data Pipeline: PDF → Dashboard

This section describes the complete journey of a bank statement or loan application from PDF upload to display in the dashboard. Understanding this flow is critical for debugging and extending the system.

---

#### Step 1: Data Ingestion (Entry Points)

Three ways data enters ClearScrub:

**1. API Webhook (from n8n workflow)**
- n8n sends bank statement JSON to `statement-schema-intake`
- OR loan application JSON to `application-schema-intake`
- Auth: `X-Webhook-Secret` header (value: `clearscrub_webhook_2025_xyz123`)
- URLs:
  - Bank Statements: `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/statement-schema-intake`
  - Applications: `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/application-schema-intake`

**2. Manual Upload (via dashboard) - IN PROGRESS**
- User drags PDF to ClearScrub dashboard
- Uploaded to Supabase Storage (`incoming-documents` bucket)
- Trigger fires when file arrives
- Status: Not yet implemented

**3. Email Ingestion - PLANNED**
- Send PDF to `{org_id}@underwrite.cleardata.io`
- Email handler extracts attachment
- Status: Not yet implemented

---

#### Step 2: PDF Processing (n8n Workflow)

**External to this system** - happens before data reaches our webhooks:

1. n8n workflow receives PDF (from upload, email, or API)
2. n8n runs LlamaIndex + Mistral OCR to extract structured data
3. Generates JSON following statement-schema or application-schema
4. Sends JSON to appropriate webhook

**Example Statement JSON:**
```json
{
  "document_id": "uuid-123",
  "extracted_data": {
    "statement": {
      "summary": {
        "company": "H2 BUILD, INC.",
        "account_number": "3618-057-067",
        "bank_name": "Chase Bank",
        "statement_start_date": "2025-01-01",
        "statement_end_date": "2025-01-31",
        "start_balance": 5000.00,
        "end_balance": 7500.00,
        "total_credits": 15000.00,
        "total_debits": 12500.00,
        "num_credits": 10,
        "num_debits": 8
      },
      "transactions": [
        {
          "date": "2025-01-05",
          "description": "PAYMENT RECEIVED",
          "amount": 1500.00,
          "balance": 6500.00
        }
      ]
    }
  }
}
```

**Example Application JSON:**
```json
{
  "company": {
    "legal_name": "H2 BUILD LLC",
    "ein": "12-3456789",
    "dba_name": "H2 Build",
    "industry": "Construction",
    "address_line1": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip": "10001"
  },
  "application": {
    "funding_amount": 50000,
    "funding_purpose": "Equipment purchase",
    "requested_term": 12
  },
  "submission": {
    "file_name": "h2_build_application.pdf",
    "file_size": 245678
  }
}
```

---

#### Step 3: Entity Resolution Webhook (THE CORE LOGIC)

This is where duplicate prevention happens. Both webhooks implement the **UNIFIED 4-STEP ENTITY RESOLUTION STRATEGY** (fixed Oct 20, 2025).

**Why this matters:** Before Oct 20, the two webhooks used different matching strategies:
- `statement-schema-intake`: matched by name only
- `application-schema-intake`: matched by EIN only

This caused the same company to be created twice with different IDs. Now both use identical logic.

---

**UNIFIED 4-Step Entity Resolution:**

**Step 1: Try EIN Match** (if EIN provided)
```sql
SELECT id FROM companies
WHERE org_id = ? AND ein = ?
LIMIT 1
```
- If found → Use this `company_id`
- If not found OR no EIN provided → Continue to Step 2
- **Note:** Bank statements often don't have EIN, so this step is skipped for them

**Step 2: Try Normalized Legal Name Match**
```sql
SELECT id FROM companies
WHERE org_id = ? AND normalized_legal_name = ?
LIMIT 1
```
- Normalize incoming company name using `normalizeCompanyName()` function:
  - Convert to uppercase
  - Remove punctuation
  - Remove legal suffixes (INC, LLC, CORP, etc.)
  - Example: "H2 Build, INC." → "H2 BUILD"
- If found → Use this `company_id`
- If not found → Continue to Step 3

**Step 3: Try Company Aliases Lookup**
```sql
SELECT company_id FROM company_aliases
WHERE normalized_alias_name = ?
LIMIT 1
```
- Manual override for edge cases where automated matching fails
- Users can add aliases via dashboard (future feature)
- If found → Use this `company_id`
- If not found → Continue to Step 4

**Step 4: Create New Company**
```sql
INSERT INTO companies (
  org_id,
  legal_name,
  normalized_legal_name,
  ein  -- Only if provided
) VALUES (?, ?, ?, ?)
RETURNING id
```
- Creates new company with all available data
- Returns new `company_id`

**Key Implementation Details:**
- Function signature: `findOrCreateCompanyUnified(supabase, orgId, companyName, ein?)`
- EIN parameter is optional (bank statements may not have it)
- All queries filter by `org_id` for multi-tenant isolation
- Same function used in both `statement-schema-intake` and `application-schema-intake`
- Location: Lines 77-151 in both webhook files

---

#### Step 4: Database Write (with RLS Bypass)

Edge Function uses `service_role_key` (bypasses RLS) to write to database. This is necessary because webhooks come from external services, not authenticated users.

**Write Sequence:**

**1. Organizations table** (from org context)
```sql
-- org_id is determined from webhook context or API key
-- For webhooks: hardcoded test org OR extracted from submission metadata
```

**2. Companies table** (or update existing)
```sql
INSERT INTO companies (id, org_id, legal_name, normalized_legal_name, ein, ...)
VALUES (uuid, ?, ?, ?, ?, ...)
ON CONFLICT (org_id, normalized_legal_name) DO UPDATE ...
```
- Unique constraint: `ux_companies_org_normalized` (prevents dupes per org)
- Columns: `id`, `org_id`, `legal_name`, `normalized_legal_name`, `ein`, `industry`, `address_*`, `phone`, `email`, `website`
- `normalized_legal_name` used for deduplication

**3. Submissions table** (upload batch tracking)
```sql
INSERT INTO submissions (id, org_id, submission_date, file_count)
VALUES (uuid, ?, NOW(), 1)
```
- Tracks each webhook call as a submission batch
- Used for audit trail

**4. Documents table** (individual file metadata)
```sql
INSERT INTO documents (
  id, submission_id, file_name, file_size,
  processing_status, extracted_data
)
VALUES (uuid, ?, ?, ?, 'completed', ?::jsonb)
```
- Logs: `file_name`, `file_size`, `processing_status`, `extracted_data` (full JSON)
- Used for debugging and reprocessing

**5. Accounts table** (if new account)
```sql
INSERT INTO accounts (
  id, company_id, bank_name, account_number,
  account_number_masked, account_number_hash
)
VALUES (uuid, ?, ?, ?, ?, ?)
ON CONFLICT (account_number_hash) DO NOTHING
```
- `account_number_hash` = SHA-256 of digits-only account number
- Example: "3618-057-067" → normalize to "3618057067" → SHA-256 hash
- Unique constraint: `ux_accounts_number_hash` (global account dedup)
- `account_number_masked` stores last 4 digits for display (e.g., "****-***-067")
- Why hash? Prevents storing full account numbers (PCI compliance)

**6. Statements table** (monthly bank data)
```sql
INSERT INTO statements (
  id, account_id, statement_period_start, statement_period_end,
  opening_balance, closing_balance, total_deposits, total_withdrawals,
  deposit_count, transaction_count, raw_data
)
VALUES (uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
ON CONFLICT (account_id, statement_period_start, statement_period_end) DO UPDATE ...
```
- Unique constraint: `ux_statements_account_period` (prevents duplicate monthly statements)
- `raw_data` (JSONB) stores full transaction array for lazy-loading
- Aggregate columns computed from transactions for fast queries

**7. Applications table** (if application data)
```sql
INSERT INTO applications (
  id, company_id, submission_id, funding_amount,
  funding_purpose, application_data
)
VALUES (uuid, ?, ?, ?, ?, ?::jsonb)
```
- `application_data` (JSONB) stores full application payload
- Links to company via `company_id` (entity resolution)

**Transaction Handling:**
- All inserts happen in a single transaction
- If any step fails, entire webhook rolls back (atomic)
- Idempotency: Duplicate webhooks are safe due to unique constraints

---

#### Step 5: Materialized View Refresh

After data committed successfully, Edge Function calls PostgreSQL procedures to update pre-aggregated views:

```typescript
// In Edge Function after successful inserts:
await supabaseAdmin.rpc('refresh_account_rollups_concurrent');
await supabaseAdmin.rpc('refresh_company_rollups_concurrent');
```

**Why separate RPC calls and not database triggers?**
- PostgreSQL cannot use `REFRESH MATERIALIZED VIEW CONCURRENTLY` inside triggers
- Concurrent refresh requires running OUTSIDE a transaction
- Triggers run INSIDE transactions, would lock tables
- Solution: Edge Functions call RPC after commit

**What these procedures do:**

**1. `refresh_account_rollups_concurrent()`**
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY account_monthly_rollups;
```
Updates `account_monthly_rollups` view with new data:
- Aggregates statements by account + month
- Columns: `account_id`, `company_id`, `month_start`, `total_deposits`, `total_withdrawals`, `average_daily_balance`, `ending_balance`, `deposit_count`, etc.
- Used by dashboard for account-level charts

**2. `refresh_company_rollups_concurrent()`**
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY company_monthly_rollups;
```
Updates `company_monthly_rollups` view (aggregates from account rollups):
- Aggregates account_monthly_rollups by company + month
- Columns: `company_id`, `month_start`, `account_count`, `total_deposits`, `total_withdrawals`, etc.
- Used by dashboard for company-level charts

**Performance Benefits:**
- Dashboard queries these views instead of raw transactions
- Sub-second aggregates even with millions of transactions
- `CONCURRENTLY` means no table locks during refresh
- Requires unique index on each view (already created in migration)

**Error Handling:**
- If refresh fails, webhook still returns success (data is committed)
- Refresh failures logged but not bubbled up
- Views can be manually refreshed if needed

---

#### Step 6: Dashboard Fetches Data (via Read APIs)

User logs into dashboard with Supabase Auth (gets JWT token). All read APIs require JWT authentication and enforce RLS based on user's `org_id`.

---

**API Call #1: Get Company List**

```http
POST /functions/v1/list-companies
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "page": 1,
  "limit": 50,
  "filters": {
    "search": "H2 Build",
    "hasStatements": true
  }
}
```

**Response:**
```json
{
  "companies": [
    {
      "company_id": "uuid-123",
      "legal_name": "H2 BUILD LLC",
      "ein": "12-3456789",
      "total_accounts": 2,
      "total_statements": 6,
      "latest_statement_date": "2025-01-31",
      "monthly_rollup": {
        "total_deposits": 45000.00,
        "total_withdrawals": 38000.00,
        "average_balance": 12000.00
      }
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 50,
    "pages": 3
  }
}
```

**What it returns:**
- Paginated company list with summary metrics
- Aggregated data from `company_monthly_rollups` view
- NO transaction details (too heavy)

**RLS Applied:**
```sql
SELECT * FROM companies
WHERE org_id IN (
  SELECT org_id FROM profiles WHERE id = auth.uid()
)
```
Only returns companies where user's `org_id` matches company's `org_id`.

---

**API Call #2: Get Company Detail**

```http
GET /functions/v1/get-company-detail/{company_id}
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "company_id": "uuid-123",
  "legal_name": "H2 BUILD LLC",
  "ein": "12-3456789",
  "industry": "Construction",
  "accounts": [
    {
      "account_id": "uuid-456",
      "account_number_masked": "****-***-067",
      "bank_name": "Chase Bank",
      "monthly_balance": 15000.00,
      "statement_count": 3
    }
  ],
  "applications": [
    {
      "application_id": "uuid-789",
      "funding_amount": 50000,
      "funding_purpose": "Equipment purchase",
      "submission_date": "2025-01-15"
    }
  ],
  "monthly_aggregates": [
    {
      "month": "2025-01",
      "total_balance": 15000.00,
      "avg_balance": 12000.00,
      "total_deposits": 15000.00,
      "total_withdrawals": 12500.00
    }
  ]
}
```

**What it returns:**
- Company profile with full details
- Array of bank accounts with statement counts
- Array of loan applications
- Monthly aggregated metrics (from `company_monthly_rollups`)
- **NO transaction line items** (too heavy, loaded separately)

**RLS Applied:**
```sql
-- Verifies user can access this company
SELECT * FROM companies WHERE id = ? AND org_id IN (
  SELECT org_id FROM profiles WHERE id = auth.uid()
)
```

---

**API Call #3: Get Transactions (Lazy-Load)**

```http
POST /functions/v1/get-statement-transactions
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "statement_id": "uuid-999",
  "page": 1,
  "limit": 100
}
```

**Response:**
```json
{
  "transactions": [
    {
      "date": "2025-01-05",
      "description": "PAYMENT RECEIVED - ACME CORP",
      "amount": 1500.00,
      "balance": 6500.00,
      "category": "deposit"
    },
    {
      "date": "2025-01-06",
      "description": "CHECK #1234",
      "amount": -500.00,
      "balance": 6000.00,
      "category": "withdrawal"
    }
  ],
  "pagination": {
    "total": 250,
    "page": 1,
    "limit": 100
  }
}
```

**What it returns:**
- Paginated transaction list for specific statement
- Extracted from `statements.raw_data` JSONB column
- Only loaded when user expands statement panel in UI

**Why lazy-load?**
- Original payload was 1.5MB+ with all transactions
- Caused 2s+ load times on company detail page
- Now main API <50KB, transactions load on-demand in <500ms

**RLS Applied:**
```sql
-- Verifies user can access this statement's company
SELECT * FROM statements s
JOIN accounts a ON s.account_id = a.id
JOIN companies c ON a.company_id = c.id
WHERE s.id = ? AND c.org_id IN (
  SELECT org_id FROM profiles WHERE id = auth.uid()
)
```

---

**API Call #4: Get Debt Analysis**

```http
GET /functions/v1/get-company-debts/{company_id}
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "company_id": "uuid-123",
  "debts": [
    {
      "creditor": "ACME FINANCE",
      "payment_frequency": "monthly",
      "average_payment": 2500.00,
      "payment_count": 6,
      "first_payment": "2024-08-01",
      "last_payment": "2025-01-01"
    }
  ],
  "total_monthly_debt": 3500.00
}
```

**What it does:**
- Analyzes transaction patterns to identify recurring debt payments
- Uses regex patterns to match creditor names
- Calculates payment frequency and amounts
- Used for underwriting risk assessment

**RLS Applied:** Same as get-company-detail

---

#### Step 7: Dashboard Renders

React components receive data and display in user interface:

**Companies Page (`/companies`):**
- Table of all companies with filters and search
- Powered by `list-companies` API
- Shows summary metrics per company

**Company Detail Page (`/companies/:id`):**
- Company profile with full details
- Tabs for bank statements, applications, debt analysis
- Powered by `get-company-detail` API
- Lazy-loads transactions when user expands statement

**Bank Summary Section (component):**
- Accordion-style list of bank statements
- Collapsed by default (no transactions loaded)
- On expand: calls `get-statement-transactions` API
- Displays transaction table with pagination

**Key UI Features:**
- Loading states during API calls
- Error handling with user-friendly messages
- Pagination for large datasets
- Responsive design for mobile/desktop

---

### Complete Flow Visual

```
PDF arrives (upload/email/API)
  ↓
n8n Processing (external)
  ↓
LlamaIndex + Mistral OCR Extraction
  ↓
JSON Schema Created (statement or application)
  ↓
Webhook POST to Edge Function
  ↓
[AUTHENTICATION: X-Webhook-Secret header validated]
  ↓
Entity Resolution (4-step: EIN → name → aliases → create)
  ↓
Company Matched or Created (unified strategy)
  ↓
Database Writes (atomic transaction):
  - submissions table (batch tracking)
  - documents table (file metadata)
  - companies table (or update existing)
  - accounts table (if new account, dedup by hash)
  - statements table (monthly data, dedup by period)
  - applications table (if application)
  ↓
Transaction COMMIT
  ↓
Materialized View Refresh (RPC calls, non-blocking):
  - refresh_account_rollups_concurrent()
  - refresh_company_rollups_concurrent()
  ↓
Webhook returns 202 Accepted
  ↓
[USER ACCESSES DASHBOARD]
  ↓
User Login (Supabase Auth)
  ↓
JWT Token Generated
  ↓
Dashboard API Calls (with JWT):
  - list-companies (paginated list)
  - get-company-detail (full profile)
  - get-statement-transactions (lazy-load)
  - get-company-debts (debt analysis)
  ↓
RLS Policies Enforce org_id Isolation
  ↓
React Components Render Data
  ↓
User Sees Companies and Statements
```

---

## Section 2: Architecture Overview

### System Boundaries

**External Systems (not in this codebase):**
- n8n (PDF processing workflows)
- LlamaIndex + Mistral OCR (document extraction)
- Email service (for email ingestion)
- React Dashboard (lives in `clearscrub_dashboard/` directory)

**This System (Supabase Backend):**
- PostgreSQL Database (14 tables, 2 materialized views)
- Edge Functions (Deno TypeScript, 11 deployed)
- Supabase Auth (JWT authentication)
- Supabase Storage (4 buckets for files)
- RLS Policies (row-level security for multi-tenancy)

**Key Architectural Decisions:**
1. **Decoupled Frontend + Backend** - React app communicates via Edge Functions only
2. **Schema-First Design** - Database schema drives API responses
3. **Entity Resolution at Write Time** - Dedupe happens when data arrives, not at query time
4. **Materialized Views for Performance** - Pre-aggregated metrics for fast dashboard loads
5. **RLS for Multi-Tenancy** - Database enforces org isolation, not application code

---

### 3 Authentication Contexts

Understanding these three contexts is critical for debugging auth issues.

---

**Context 1: Webhook Authentication (External Service)**

**Used by:**
- `statement-schema-intake`
- `application-schema-intake`

**Auth method:** `X-Webhook-Secret` header
```http
X-Webhook-Secret: clearscrub_webhook_2025_xyz123
```

**Why this approach:**
- External services (n8n) don't have user sessions
- Can't generate JWT tokens
- Simple shared secret is sufficient for server-to-server

**Database access:** Service Role Key (bypasses RLS)
```typescript
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
```

**Security considerations:**
- Secret must be kept confidential
- Rotate secret if compromised
- Use HTTPS only (secret in header)

**✅ RESOLVED (Oct 21):**
- Issue: Supabase reported `verify_jwt: true` on statement-schema-intake
- Fixed: Redeployed with `verify_jwt: false` (uses X-Webhook-Secret instead)
- Status: Fixed and tested Oct 21, 2025

---

**Context 2: Service Role (Internal Processing)**

**Used by:**
- Triggers (if any)
- Batch operations (migrations, backfills)
- Admin tasks (manual data fixes)

**Auth method:** Supabase `service_role_key` (environment variable)

**Why this approach:**
- Needs unrestricted write access to all tables
- Can bypass RLS for admin operations
- Required for database maintenance

**Database access:** Full access (RLS bypassed)

**Security considerations:**
- NEVER expose service_role_key to frontend
- NEVER commit service_role_key to Git
- Use only in Edge Functions (server-side)

---

**Context 3: JWT (Dashboard Users)**

**Used by:**
- `list-companies`
- `get-company-detail`
- `get-statement-transactions`
- `get-company-debts`

**Auth method:** `Authorization: Bearer {jwt_token}` header

**Where token comes from:**
```typescript
// User signs in via dashboard
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
});

// JWT token stored in session
// Supabase client auto-includes it in subsequent requests
```

**Why this approach:**
- User-specific data access with RLS enforcement
- Tokens expire (1 hour default, then refresh)
- Multi-tenant isolation enforced at database level

**Database access:** Filtered by RLS based on `org_id`

**RLS Policy Example:**
```sql
CREATE POLICY "Users see own org companies"
ON companies
FOR SELECT
USING (
  org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  )
);
```

**How RLS works:**
1. User authenticates, gets JWT with `sub` claim (user ID)
2. `auth.uid()` PostgreSQL function extracts user ID from JWT
3. Policy joins to `profiles` table to get user's `org_id`
4. Only rows matching user's `org_id` are visible

**Security considerations:**
- JWT tokens automatically refreshed by Supabase client
- Token expiry prevents long-lived sessions
- RLS enforced at database level (can't be bypassed by malicious client)

---

## Section 3: Database Schema

### 14 Tables (All Deployed, All with RLS)

---

#### Tier 1: Multi-Tenant Root

**organizations** (Root tenant entity)
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  subscription_plan TEXT DEFAULT 'free',
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
- Root of tenant hierarchy
- Each user belongs to one organization via `profiles.org_id`
- `slug` used for vanity URLs (future feature)
- `owner_id` is the org admin (first user who signed up)

**profiles** (Users within organizations)
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  org_id UUID REFERENCES organizations(id),
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
- One-to-one with `auth.users` (Supabase Auth table)
- `org_id` determines data access scope (RLS filter)
- `role` for RBAC (owner, admin, member, viewer)
- Auto-created by trigger when user signs up

**api_keys** (Partner API authentication)
```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  key_name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- For API access without user login (future feature)
- `key_hash` stores bcrypt hash of API key
- Used by partners to send documents via API

---

#### Tier 2: Application Data

**companies** (Applicant businesses)
```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  legal_name TEXT NOT NULL,
  normalized_legal_name TEXT,
  dba_name TEXT,
  ein TEXT,
  industry TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT ux_companies_org_normalized
    UNIQUE (org_id, normalized_legal_name)
    WHERE normalized_legal_name IS NOT NULL
);
```
- Core entity - represents loan applicants
- `normalized_legal_name` used for entity resolution (deduplication)
- `ein` optional (bank statements may not have it)
- Unique constraint prevents duplicate companies per org

**applications** (Loan requests)
```sql
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  submission_id UUID REFERENCES submissions(id) NOT NULL,
  funding_amount NUMERIC,
  funding_purpose TEXT,
  requested_term INTEGER,
  application_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
- Loan applications submitted by companies
- `application_data` stores full JSON from webhook
- Links to company via `company_id` (entity resolution)
- Multiple applications per company allowed

**company_aliases** (Manual entity resolution)
```sql
CREATE TABLE company_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  normalized_alias_name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT ux_company_aliases_normalized
    UNIQUE (normalized_alias_name)
);
```
- Manual overrides when automated entity resolution fails
- Example: User knows "Acme Corp" and "ACME CORPORATION" are same company
- Used by entity resolution Step 3
- Future: Dashboard UI to add/manage aliases

---

#### Tier 3: Bank Statement Data (3-tier hierarchy)

**accounts** (Bank accounts)
```sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT,
  account_number_masked TEXT,
  account_number_hash TEXT,
  account_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT ux_accounts_number_hash
    UNIQUE (account_number_hash)
    WHERE account_number_hash IS NOT NULL
);
```
- Represents a single bank account
- `account_number_hash` = SHA-256 of digits-only number (PCI compliance)
- `account_number_masked` = last 4 digits for display (e.g., "****-***-067")
- Unique constraint prevents duplicate accounts globally
- One company can have multiple accounts

**statements** (Monthly periods)
```sql
CREATE TABLE statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) NOT NULL,
  company_id UUID REFERENCES companies(id) NOT NULL,
  statement_period_start DATE NOT NULL,
  statement_period_end DATE NOT NULL,
  opening_balance NUMERIC,
  closing_balance NUMERIC,
  total_deposits NUMERIC,
  total_withdrawals NUMERIC,
  deposit_count INTEGER DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  average_daily_balance NUMERIC,
  largest_deposit NUMERIC,
  largest_withdrawal NUMERIC,
  nsf_count INTEGER DEFAULT 0,
  nsf_total_amount NUMERIC,
  negative_balance_days INTEGER DEFAULT 0,
  true_revenue NUMERIC,
  true_revenue_count INTEGER,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT ux_statements_account_period
    UNIQUE (account_id, statement_period_start, statement_period_end)
);
```
- Monthly bank statement data
- `raw_data` (JSONB) stores full transaction array
- Aggregate columns computed from transactions for fast queries
- `deposit_count` added in Oct 16 migration for revenue analysis
- Unique constraint prevents duplicate statements for same account/period
- `company_id` denormalized for faster queries (avoid join)

**Transactions** (NOT a separate table!)
- Stored in `statements.raw_data` as JSONB array
- Why not separate table? Original design had separate table, but:
  - Millions of rows caused slow queries
  - Most queries aggregate at statement level
  - Transactions rarely queried individually
- Lazy-loaded via `get-statement-transactions` API

---

#### Tier 4: Ingestion & Processing

**submissions** (Upload batches)
```sql
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  submission_date TIMESTAMPTZ DEFAULT NOW(),
  file_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- Tracks each webhook call as a submission batch
- Groups related documents (e.g., 3 bank statements + 1 application)
- Used for audit trail and batch operations

**documents** (Individual files)
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id) NOT NULL,
  file_name TEXT,
  file_size INTEGER,
  processing_status TEXT DEFAULT 'pending',
  extracted_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
- Logs individual file processing
- `processing_status`: pending, processing, completed, failed
- `extracted_data` (JSONB) stores full webhook payload
- Used for debugging and reprocessing failed documents

**email_submissions** (Email ingestion - PLANNED)
```sql
CREATE TABLE email_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  email_from TEXT NOT NULL,
  email_subject TEXT,
  attachment_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- Tracks email-based document submissions
- Links to `documents` table via `submission_id` (future FK)
- Status: Not yet implemented

**usage_logs** (Billing/quota tracking)
```sql
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  api_calls_count INTEGER DEFAULT 0,
  storage_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- Tracks API usage per organization
- Used for billing and quota enforcement
- Status: Table exists, not yet populated

---

#### Tier 5: Debug & Monitoring

**webhook_catches** (Debug table)
```sql
CREATE TABLE webhook_catches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- RLS enabled but 0 policies (LOCKED DOWN)
- Used for debugging webhook payloads in development
- Status: Exists but not actively used

---

### RLS Policy Pattern

All tables follow a consistent RLS pattern:

**Pattern 1: Service Role Bypass**
```sql
CREATE POLICY "Service role bypass"
ON companies
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');
```
- Allows Edge Functions with service_role_key to bypass RLS
- Required for webhook writes (external services)

**Pattern 2: Org Isolation (SELECT)**
```sql
CREATE POLICY "Users see own org data"
ON companies
FOR SELECT
USING (
  org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  )
);
```
- Users can only see data where `org_id` matches their profile's `org_id`
- `auth.uid()` extracts user ID from JWT
- Applied to all read operations

**Pattern 3: Org Isolation (INSERT)**
```sql
CREATE POLICY "Users insert own org data"
ON companies
FOR INSERT
WITH CHECK (
  org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  )
);
```
- Users can only insert data with their own `org_id`
- Prevents cross-org data pollution

**Pattern 4: Org Isolation (UPDATE/DELETE)**
```sql
CREATE POLICY "Users update own org data"
ON companies
FOR UPDATE
USING (
  org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  )
);
```
- Users can only modify data in their own org
- Applied to all mutation operations

**Helper Function:**
```sql
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;
```
- Simplifies policy definitions
- Used throughout codebase

---

### company_aliases Table (Undocumented But Active)

**Purpose:** Manual entity resolution when automated 4-step matching fails

**Use Case:**
- User: "I know these are the same company, but the names don't match"
- Example: "Acme Corp" vs "ACME CORPORATION" vs "Acme Corp LLC"
- Action: Create `company_alias` to map variant name → canonical company

**How it works:**
1. User identifies duplicate companies in dashboard
2. Dashboard calls API to create alias: `INSERT INTO company_aliases (company_id, alias_name, normalized_alias_name)`
3. Entity resolution Step 3 checks aliases before creating new company
4. Future statements/applications matching alias link to existing company

**Status:**
- Table deployed and functional
- Used by entity resolution (both webhooks)
- Dashboard UI not yet implemented (manual SQL insert for now)

---

### Materialized Views (2)

**account_monthly_rollups**
```sql
CREATE MATERIALIZED VIEW account_monthly_rollups AS
SELECT
  account_id,
  company_id,
  date_trunc('month', statement_period_start)::date AS month_start,
  MAX(statement_period_end) AS month_end,
  SUM(total_deposits) AS total_deposits,
  SUM(total_withdrawals) AS total_withdrawals,
  AVG(average_daily_balance) AS average_daily_balance,
  MAX(closing_balance) AS ending_balance,
  SUM(true_revenue) AS true_revenue,
  SUM(deposit_count) AS deposit_count,
  SUM(nsf_count) AS nsf_count,
  MAX(largest_deposit) AS largest_deposit,
  MAX(created_at) AS last_updated
FROM statements
GROUP BY account_id, company_id, date_trunc('month', statement_period_start);
```
- Pre-aggregated monthly metrics per account
- Powers dashboard account-level charts
- Unique index: `(account_id, month_start)` (required for concurrent refresh)

**company_monthly_rollups**
```sql
CREATE MATERIALIZED VIEW company_monthly_rollups AS
SELECT
  company_id,
  month_start,
  COUNT(DISTINCT account_id) AS account_count,
  SUM(total_deposits) AS total_deposits,
  SUM(total_withdrawals) AS total_withdrawals,
  AVG(average_daily_balance) AS average_daily_balance,
  SUM(ending_balance) AS total_ending_balance,
  SUM(deposit_count) AS deposit_count,
  MAX(largest_deposit) AS largest_deposit
FROM account_monthly_rollups
GROUP BY company_id, month_start;
```
- Pre-aggregated monthly metrics per company (rolls up from account view)
- Powers dashboard company-level charts
- Unique index: `(company_id, month_start)` (required for concurrent refresh)

**Refresh Strategy:**
- Called via RPC after webhook writes: `refresh_account_rollups_concurrent()`, `refresh_company_rollups_concurrent()`
- `CONCURRENTLY` means no table locks during refresh
- If refresh fails, webhook still succeeds (data committed)
- Can be manually refreshed: `SELECT refresh_all_rollups_concurrent();`

---

## Section 4: Edge Functions (11 Total)

### Active Production Functions (6)

---

#### Intake Webhooks (External → Database)

**1. statement-schema-intake** (v8, deployed Oct 21, 2025)

**URL:** `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/statement-schema-intake`

**Auth:** `X-Webhook-Secret: clearscrub_webhook_2025_xyz123` (verify_jwt: false, fixed Oct 21)

**Purpose:** Receives bank statement JSON from n8n, writes to database

✅ **FIXED Oct 21, 2025** - JWT configuration corrected

**Request Body:**
```json
{
  "document_id": "uuid-123",
  "extracted_data": {
    "statement": {
      "summary": { ... },
      "transactions": [ ... ]
    }
  }
}
```

**Processing:**
1. Validates webhook secret
2. Extracts org_id from context (hardcoded test org for now)
3. Entity resolution (4-step) → company_id
4. Account deduplication (SHA-256 hash) → account_id
5. Statement deduplication (period constraint) → statement_id
6. Inserts: submissions, documents, companies, accounts, statements
7. Calls RPC: `refresh_account_rollups_concurrent()`, `refresh_company_rollups_concurrent()`
8. Returns 202 Accepted (async)

**Response:**
```json
{
  "success": true,
  "data": {
    "submission_id": "uuid-456",
    "company_id": "uuid-789",
    "account_id": "uuid-012",
    "statement_id": "uuid-345"
  }
}
```

**Error Handling:**
- 401 if webhook secret invalid
- 400 if required fields missing
- 500 if database write fails
- All errors logged to Edge Function logs

**Location:** `/Users/vitolo/Desktop/clearscrub_main/supabase/functions/statement-schema-intake/index.ts`

---

**2. application-schema-intake** (v4, deployed Oct 20, 2025)

**URL:** `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/application-schema-intake`

**Auth:** `X-Webhook-Secret: clearscrub_webhook_2025_xyz123`

**Purpose:** Receives loan application JSON from n8n, writes to database

**Request Body:**
```json
{
  "company": {
    "legal_name": "H2 BUILD LLC",
    "ein": "12-3456789",
    "industry": "Construction",
    ...
  },
  "application": {
    "funding_amount": 50000,
    "funding_purpose": "Equipment",
    ...
  },
  "submission": {
    "file_name": "app.pdf",
    "file_size": 245678
  }
}
```

**Processing:**
1. Validates webhook secret
2. Entity resolution (4-step, unified with statement-schema-intake) → company_id
3. Updates company with rich application data (address, industry, phone, etc.)
4. Inserts: submissions, documents, applications
5. Returns 202 Accepted (async)

**Response:**
```json
{
  "success": true,
  "data": {
    "application_id": "uuid-123",
    "company_id": "uuid-456",
    "submission_id": "uuid-789"
  }
}
```

**Key Difference from statement-schema-intake:**
- No materialized view refresh (applications don't affect rollups)
- Enriches company data with full profile (address, industry, etc.)
- Uses same entity resolution logic (fixed Oct 20)

**Location:** `/Users/vitolo/Desktop/clearscrub_main/supabase/functions/application-schema-intake/index.ts`

---

#### Read APIs (Dashboard → Database)

All read APIs require JWT authentication and enforce RLS.

**3. list-companies** (v2, deployed Oct 16, 2025)

**URL:** `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/list-companies`

**Auth:** `Authorization: Bearer {jwt_token}`

**Purpose:** Get paginated company list with summary metrics

**Request:**
```json
{
  "page": 1,
  "limit": 50,
  "filters": {
    "search": "H2 Build",
    "hasStatements": true
  }
}
```

**Response:** See Step 6 in User Flow section above

**Query Strategy:**
- Joins companies → company_monthly_rollups
- Aggregates latest month's metrics
- Filters by search term (ILIKE on legal_name)
- RLS automatically filters by user's org_id

---

**4. get-company-detail** (v2, deployed Oct 16, 2025)

**URL:** `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/get-company-detail/{company_id}`

**Auth:** `Authorization: Bearer {jwt_token}`

**Purpose:** Get full company profile with accounts, applications, and monthly aggregates

**Response:** See Step 6 in User Flow section above

**Query Strategy:**
- Single company lookup with joins:
  - companies → accounts → statements (count only)
  - companies → applications
  - companies → company_monthly_rollups
- RLS verifies user can access this company
- NO transaction details (too heavy)

---

**5. get-statement-transactions** (v2, deployed Oct 16, 2025)

**URL:** `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/get-statement-transactions`

**Auth:** `Authorization: Bearer {jwt_token}`

**Purpose:** Lazy-load transactions for specific statement

**Request:**
```json
{
  "statement_id": "uuid-999",
  "page": 1,
  "limit": 100
}
```

**Response:** See Step 6 in User Flow section above

**Query Strategy:**
- Single statement lookup: `SELECT raw_data FROM statements WHERE id = ?`
- Extract transactions array from JSONB
- Client-side pagination (JSONB array)
- RLS verifies user can access statement's company

---

**6. get-company-debts** (v2, deployed Oct 16, 2025)

**URL:** `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/get-company-debts/{company_id}`

**Auth:** `Authorization: Bearer {jwt_token}`

**Purpose:** Analyze transaction patterns to identify recurring debt payments

**Response:** See Step 6 in User Flow section above

**Analysis Strategy:**
1. Fetch all transactions for company
2. Regex match creditor names (LOAN, FINANCE, PAYMENT TO, etc.)
3. Group by creditor
4. Calculate payment frequency, average amount
5. Return debt summary

---

### Deprecated Functions (5 - Still Deployed)

These are from the old Operation12 document processing pipeline (pre-n8n). Archived but not deleted:

**1. process-document-operation12** (v3)
- Old document processing trigger
- Status: NOT USED

**2. catch-operation12-response** (v4)
- Old webhook catch endpoint
- Status: NOT USED

**3. catch-markdown-extract** (v2)
- Old markdown extraction webhook
- Status: NOT USED

**4. document-metadata** (v34)
- Old metadata extraction
- Status: NOT USED

**5. webhook-catch** (v8)
- Generic webhook debug endpoint
- Status: NOT USED

**Cleanup Plan:**
- Confirm new webhooks work in production
- Archive to Git history
- Delete from Supabase

---

## Section 5: Known Issues & Blockers

### ✅ RESOLVED (Oct 21): statement-schema-intake JWT Configuration

**Issue:** Supabase report showed `verify_jwt: true` on statement-schema-intake

**Expected:** Should be `verify_jwt: false` (uses `X-Webhook-Secret` instead)

**Resolution:** Fixed Oct 21, 2025. JWT verification disabled in favor of X-Webhook-Secret header.

**What was done:**
- Verified Edge Function code had no JWT middleware
- Redeployed function as v8 on Oct 21, 2025
- Tested with curl - webhook now accepts X-Webhook-Secret header properly

**Verification test:**
```bash
curl -X POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/statement-schema-intake \
  -H "X-Webhook-Secret: clearscrub_webhook_2025_xyz123" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Result: 400 (missing fields) - proves auth works, now validates payload
```

**Status:** FIXED

---

### HIGH: No Test Data in Database

**Issue:** All tables have 0 rows (verified Oct 21, 2025)

**Expected:** Should have sample bank statements to test entity resolution

**Impact:**
- Cannot verify 4-step matching logic works correctly
- Cannot test dashboard with real data
- Cannot verify materialized views refresh properly

**How to fix:**
1. Create test JSON payloads (bank statement + application)
2. POST to webhook endpoints
3. Verify data appears in database
4. Verify dashboard displays data correctly

**Test Payload Examples:**
- Bank statement: `/Users/vitolo/Desktop/clearscrub_main/supabase/database/bank_schema_example_output.json`
- Application: `/Users/vitolo/Desktop/clearscrub_main/docs/application_schema_v2.json`

**Status:** BLOCKING FOR PRODUCTION

---

### MEDIUM: Migration Tracking Broken

**Issue:** `list_migrations` returns empty array

**Expected:** Migrations should be tracked in `supabase_migrations` table

**Impact:**
- No version control for database schema
- No rollback capability
- Hard to know what migrations have run

**How to fix:**
- Implement proper migration system using Supabase CLI
- OR manually track migrations in project docs

**Current State:**
- All migrations applied manually via SQL editor
- No programmatic tracking
- One large migration file: `20251016_bank_statement_integration_phase1.sql`

**Status:** LOW PRIORITY (manual tracking works for now)

---

### MEDIUM: Materialized View Naming Mismatch

**Docs Claim:** `company_rollups` materialized view

**Reality:** Deployed as `company_monthly_rollups`

**Impact:** Documentation outdated, may confuse future developers

**How to fix:** Update all docs to use `company_monthly_rollups`

**Affected Files:**
- `/Users/vitolo/Desktop/clearscrub_main/CLAUDE.md`
- `/Users/vitolo/Desktop/clearscrub_main/docs/ARCHITECTURAL_DECISIONS.md`

**Status:** DOCUMENTATION FIX ONLY

---

### LOW: Deprecated Functions Not Deleted

**Issue:** 5 old operation12 functions still deployed

**Expected:** Should be removed after confirming new webhooks work

**Impact:**
- UI confusion in Supabase dashboard
- Wasted resources (cold starts)
- Potential for accidental use

**How to fix:**
```bash
supabase functions delete process-document-operation12 --project-ref vnhauomvzjucxadrbywg
supabase functions delete catch-operation12-response --project-ref vnhauomvzjucxadrbywg
supabase functions delete catch-markdown-extract --project-ref vnhauomvzjucxadrbywg
supabase functions delete document-metadata --project-ref vnhauomvzjucxadrbywg
supabase functions delete webhook-catch --project-ref vnhauomvzjucxadrbywg
```

**Status:** CLEANUP TASK (after testing)

---

## Section 5.1: Recent Fixes (Oct 21, 2025)

### JWT Configuration Fix

**Date Fixed:** Oct 21, 2025

**Function:** statement-schema-intake (v8)

**What Changed:** `verify_jwt: false` (was incorrectly `true`)

**Why It Matters:** Enables n8n webhooks to authenticate with X-Webhook-Secret header instead of requiring JWT tokens (which external services don't have)

**Technical Details:**
- Edge Functions in Supabase have a `verify_jwt` config option
- When `true`, function requires `Authorization: Bearer {jwt}` header
- When `false`, function can use custom auth (X-Webhook-Secret in our case)
- statement-schema-intake was incorrectly set to `true`, blocking n8n webhooks
- Redeployed with correct config on Oct 21, 2025

**Testing:**
- Tested with curl using X-Webhook-Secret header
- Confirmed function accepts webhook auth properly
- Verified 400 error for missing fields (proves auth works, now validating payload)

**Status:** Deployed and tested

---

## Section 6: Development Workflow

### Testing Webhooks Locally

**Test statement-schema-intake:**
```bash
curl -X POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/statement-schema-intake \
  -H "X-Webhook-Secret: clearscrub_webhook_2025_xyz123" \
  -H "Content-Type: application/json" \
  -d @/Users/vitolo/Desktop/clearscrub_main/supabase/database/bank_schema_example_output.json

# Check function logs
supabase functions logs statement-schema-intake --project-ref vnhauomvzjucxadrbywg
```

**Test application-schema-intake:**
```bash
curl -X POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/application-schema-intake \
  -H "X-Webhook-Secret: clearscrub_webhook_2025_xyz123" \
  -H "Content-Type: application/json" \
  -d @/Users/vitolo/Desktop/clearscrub_main/docs/application_schema_v2.json

# Check function logs
supabase functions logs application-schema-intake --project-ref vnhauomvzjucxadrbywg
```

**Test read APIs (requires JWT):**
```bash
# Get JWT from dashboard login
# Open browser console after login:
# supabase.auth.getSession().then(d => console.log(d.data.session.access_token))

TOKEN="your-jwt-token-here"

# List companies
curl -X POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/list-companies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"page": 1, "limit": 50}'

# Get company detail
curl https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/get-company-detail/{company_id} \
  -H "Authorization: Bearer $TOKEN"
```

---

### Deploying Edge Functions

**Deploy single function:**
```bash
cd /Users/vitolo/Desktop/clearscrub_main/supabase

# Deploy statement webhook
supabase functions deploy statement-schema-intake --project-ref vnhauomvzjucxadrbywg

# Deploy application webhook
supabase functions deploy application-schema-intake --project-ref vnhauomvzjucxadrbywg

# Deploy read API
supabase functions deploy list-companies --project-ref vnhauomvzjucxadrbywg
```

**Deploy all functions:**
```bash
supabase functions deploy --project-ref vnhauomvzjucxadrbywg
```

**Verify deployment:**
```bash
# Check function is live
curl -i https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/list-companies

# Should return 401 (auth required) - this means function is live
```

---

### Database Migrations

**Create new migration:**
```bash
cd /Users/vitolo/Desktop/clearscrub_main/supabase

supabase migration new add_company_notes_table
```

**Apply migrations to remote database:**
```bash
supabase db push --project-ref vnhauomvzjucxadrbywg
```

**WARNING:** Manual SQL in Supabase SQL Editor does NOT create migration files. Always use `supabase migration new` for version control.

---

### Viewing Logs

**Edge Function logs:**
```bash
# Live tail
supabase functions logs statement-schema-intake --project-ref vnhauomvzjucxadrbywg

# Specific time range
supabase functions logs statement-schema-intake --project-ref vnhauomvzjucxadrbywg --since 1h
```

**Database logs:**
- Use Supabase Dashboard → Database → Logs
- Filter by severity, table, operation

---

### Refreshing Materialized Views Manually

**From SQL editor:**
```sql
-- Refresh both views
SELECT refresh_all_rollups_concurrent();

-- Or refresh individually
SELECT refresh_account_rollups_concurrent();
SELECT refresh_company_rollups_concurrent();
```

**Check view data:**
```sql
-- Account rollups
SELECT * FROM account_monthly_rollups
ORDER BY month_start DESC
LIMIT 10;

-- Company rollups
SELECT * FROM company_monthly_rollups
ORDER BY month_start DESC
LIMIT 10;
```

---

## Section 7: Quick Reference

**Project ID:** `vnhauomvzjucxadrbywg`

**Webhook Secret:** `clearscrub_webhook_2025_xyz123`

**Base URL:** `https://vnhauomvzjucxadrbywg.supabase.co`

---

**Storage Buckets:**
- `incoming-documents` - Upload PDFs here for processing
- `extracted` - OCR results stored here
- `documents` - General document storage
- `public-assets` - Images, logos, public files

---

**Materialized Views:**
- `account_monthly_rollups` - Monthly metrics per account
- `company_monthly_rollups` - Monthly metrics per company (rolls up from account)

---

**PostgreSQL Procedures:**
- `refresh_account_rollups_concurrent()` - Refresh account view
- `refresh_company_rollups_concurrent()` - Refresh company view
- `refresh_all_rollups_concurrent()` - Refresh both views in order

---

**Helper Functions:**
- `get_my_org_id()` - Get current user's org_id (used in RLS policies)

---

**Critical Indexes:**
- `ux_statements_account_period` - Prevents duplicate statements
- `ux_companies_org_normalized` - Prevents duplicate companies per org
- `ux_accounts_number_hash` - Prevents duplicate accounts globally
- `idx_statements_company_period` - Fast statement queries by company/period
- `idx_account_monthly_rollups_lookup` - Required for concurrent MV refresh
- `idx_company_monthly_rollups_lookup` - Required for concurrent MV refresh

---

**Entity Normalization Functions:**
```typescript
// Company name: "H2 Build, INC." → "H2 BUILD"
function normalizeCompanyName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(INC|LLC|CORP|CO|LTD|CORPORATION|L\.L\.C|PLLC)\b/g, '')
    .trim();
}

// Account number: "3618-057-067" → "3618057067"
function normalizeAccountNumber(account: string): string {
  return account.replace(/[^0-9]/g, '');
}

// Then SHA-256 hash for storage
const hash = await computeSHA256(normalizedNumber);
```

---

**CORS Headers (Edge Functions):**
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

// OPTIONS handler
if (req.method === "OPTIONS") {
  return new Response("ok", { headers: corsHeaders });
}
```

---

## Section 8: Next Steps After Reading This

1. **Review Section 1 (User Flow)** until you understand the complete pipeline from PDF to dashboard display. This is the most important section.

2. **Check Section 5 (Known Issues)** - there are critical items that need verification:
   - statement-schema-intake JWT config (CRITICAL)
   - No test data in database (HIGH)
   - Migration tracking broken (MEDIUM)

3. **Add Test Data:**
   - Use curl commands in Section 6 to POST test payloads
   - Verify data appears in database
   - Verify dashboard displays correctly

4. **Use Development Workflow** (Section 6) when making changes:
   - Create migrations for schema changes
   - Deploy functions with `--project-ref vnhauomvzjucxadrbywg`
   - Check logs after deployment
   - Test with curl before declaring success

5. **Reference Schema Section** (Section 3) when:
   - Adding new columns
   - Understanding RLS policies
   - Debugging entity resolution
   - Understanding table relationships

6. **Understand Authentication Contexts** (Section 2):
   - Webhook = X-Webhook-Secret header
   - Dashboard = JWT token
   - Admin = service_role_key
   - Know which to use when

---

**This document is your complete reference for the Supabase database backend. Update it when:**
- Schema changes
- New Edge Functions deployed
- Issues discovered/fixed
- User flow changes
- New features added

**Keep it current. Keep it accurate. This is the source of truth.**

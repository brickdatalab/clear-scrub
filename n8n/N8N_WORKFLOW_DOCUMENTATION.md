# n8n Workflows for ClearScrub Document Extraction

**Date:** October 20, 2025
**Status:** Documentation complete - Workflows exist but configuration details need to be documented
**Scope:** Bank statement extraction + Application extraction via n8n + Claude Haiku 4.5

---

## Executive Summary

ClearScrub uses **n8n** to extract structured data from PDF documents using **Claude Haiku 4.5** (via Anthropic API integration). The extracted data flows through two separate **Supabase Edge Function webhooks** that normalize, deduplicate, and store the data.

**Key Finding:** Bank statement extraction prompts **do NOT yet exist** in documentation. Only application extraction prompts are documented. Both webhooks POST to Supabase using identical authentication.

---

## Architecture Overview

```
PDF INPUT
    ↓
[n8n Workflow]
    ├─ Parse PDF → Text
    ├─ Call Claude Haiku 4.5 (with extraction prompt)
    ├─ Clean JSON response
    └─ POST to Supabase webhook
    ↓
[Supabase Edge Function Webhook]
    ├─ Validate webhook secret
    ├─ Entity resolution (4-step matching)
    ├─ Normalize company names & account numbers
    ├─ Create/update companies, accounts, statements/applications
    └─ Refresh materialized views
    ↓
[Database - PostgreSQL]
    ├─ companies table
    ├─ accounts table (for bank statements)
    ├─ statements table (for bank statements)
    ├─ applications table (for loan applications)
    └─ transactions table (raw_transactions JSONB)
    ↓
[React Dashboard]
    ├─ GET /list-companies (paginated)
    ├─ GET /get-company-detail/:id
    ├─ GET /get-statement-transactions/:id (lazy-load)
    └─ Display unified company profile
```

---

## Webhook Endpoints

### 1. Bank Statement Intake Webhook
**Purpose:** Receive extracted bank statement JSON from n8n

- **URL:** `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/statement-schema-intake`
- **Method:** POST
- **Auth:** Header `X-Webhook-Secret: clearscrub_webhook_2025_xyz123`
- **Source File:** `/supabase/functions/statement-schema-intake/index.ts` (540 lines)
- **Status:** ✅ Deployed Oct 20, 2025 at 14:16 UTC

#### Input Schema (from n8n)
```typescript
{
  document_id: string;              // UUID of document in documents table
  extracted_data: {
    statement: {
      summary: {
        account_number: string;     // Bank account number
        bank_name: string;          // e.g., "Chase Bank", "Bank of America"
        company: string;            // Company name
        start_balance: number;      // Opening balance
        end_balance: number;        // Closing balance
        statement_start_date: string;  // YYYY-MM-DD
        statement_end_date: string;    // YYYY-MM-DD
        total_credits: number;      // Total deposits ($)
        total_debits: number;       // Total withdrawals ($)
        num_credits: number;        // Count of deposits
        num_debits: number;         // Count of withdrawals
        num_transactions: number;   // Total transactions
        ein?: string;               // Optional: EIN if extracted
      },
      transactions: Array<{
        amount: number;           // Positive = deposit, negative = withdrawal
        description: string;      // Transaction description
        date: string;             // YYYY-MM-DD
        balance: number;          // Running balance
      }>
    }
  }
}
```

#### What It Does
1. Validates webhook secret
2. Normalizes company name (uppercase, remove punctuation, strip legal suffixes)
3. Entity resolution with 4-step strategy:
   - Step 1: Try EIN match (if present)
   - Step 2: Try normalized_legal_name match
   - Step 3: Try company_aliases
   - Step 4: Create new company
4. Entity resolution for accounts (by normalized account number hash)
5. Calculates metrics:
   - deposit_count (FIX #8)
   - true_revenue (sum of deposits)
   - nsf_count (overdraft/NSF detection)
   - negative_balance_days (days with balance < 0)
6. Generates transaction IDs and classifies types (deposit/withdrawal/fee) (FIX #2, #3)
7. Detects duplicate documents via SHA-256 hash (FIX #14)
8. Creates/updates statements, accounts, companies
9. Refreshes materialized views via RPC (FIX #1)

#### Success Response (200)
```json
{
  "success": true,
  "document_id": "uuid",
  "statement_id": "uuid",
  "company_id": "uuid",
  "account_id": "uuid",
  "status": "completed",
  "metrics": {
    "deposit_count": 45,
    "nsf_count": 2,
    "negative_balance_days": 3,
    "true_revenue": 125000.50
  }
}
```

---

### 2. Application Intake Webhook
**Purpose:** Receive extracted loan application JSON from n8n

- **URL:** `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/application-schema-intake`
- **Method:** POST
- **Auth:** Header `X-Webhook-Secret: clearscrub_webhook_2025_xyz123`
- **Source File:** `/supabase/functions/application-schema-intake/index.ts` (~300 lines)
- **Status:** ⏳ Pending deployment (Oct 20, 2025)

#### Input Schema (from n8n)
```typescript
{
  company: {
    legal_name: string;           // REQUIRED: "ACME Corporation"
    dba_name: string | null;      // "ACME Trading as..."
    ein: string;                  // "12-3456789" format
    industry: string | null;      // "Manufacturing"
    address_line1: string;        // REQUIRED
    address_line2: string | null;
    city: string;                 // REQUIRED
    state: string;                // REQUIRED: 2-letter uppercase
    zip: string;                  // REQUIRED: 5 or 9-digit
    phone: string | null;
    email: string | null;
    website: string | null;
  },
  application: {
    submission_id: string | null; // UUID linking to bank statements
    document_id: string | null;   // Unique ID for this doc
    business_structure: string | null;  // "LLC" | "Corporation" | etc.
    start_date: string | null;    // "YYYY-MM-DD"
    years_in_business: number | null;
    number_of_employees: number | null;
    annual_revenue: number | null;
    amount_requested: number | null;
    loan_purpose: string | null;
    
    // Owner 1 (REQUIRED)
    owner_1_first_name: string;
    owner_1_middle_name: string | null;
    owner_1_last_name: string;
    owner_1_ssn: string | null;   // "XXX-XX-XXXX" format
    owner_1_dob: string | null;   // "YYYY-MM-DD"
    owner_1_ownership_pct: number | null;  // 0-100
    owner_1_address: Address | null;
    owner_1_cell_phone: string | null;
    owner_1_home_phone: string | null;
    owner_1_email: string | null;
    
    // Owner 2 (OPTIONAL - all null if not present)
    owner_2_first_name: string | null;
    owner_2_middle_name: string | null;
    owner_2_last_name: string | null;
    owner_2_ssn: string | null;
    owner_2_dob: string | null;
    owner_2_ownership_pct: number | null;
    owner_2_address: Address | null;
    owner_2_cell_phone: string | null;
    owner_2_home_phone: string | null;
    owner_2_email: string | null;
  },
  confidence_score: number  // 0.0-1.0 (extraction quality)
}

interface Address {
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
}
```

#### What It Does
1. Validates webhook secret & required fields
2. Entity resolution for company (4-step unified strategy):
   - Step 1: Try EIN match
   - Step 2: Try normalized_legal_name match
   - Step 3: Try company_aliases
   - Step 4: Create new company with EIN
3. **Enriches** existing company with full application data (address, industry, etc.)
4. Entity resolution for owners (by SSN or create new)
5. Links owners to application via application_owners junction table
6. Creates application record with confidence_score
7. Links to bank statements via matching company_id

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "application_id": "uuid",
    "company_id": "uuid",
    "submission_id": "uuid",
    "owner_ids": ["uuid1", "uuid2"]
  },
  "message": "Application intake successful"
}
```

---

## n8n Workflow Configuration

### Current Status
- ✅ Workflow EXISTS and is operational
- ✅ Uses Claude Haiku 4.5 (via Anthropic integration)
- ✅ Extracts to JSON
- ✅ POSTs to Supabase webhooks
- ❌ **Configuration NOT documented** (no export/config file visible in repo)

### Application Extraction Workflow
**Status:** ✅ **Documented** - See `/n8n_haiku_extraction_prompts.md`

#### System Message (from n8n_haiku_extraction_prompts.md, lines 10-44)
```
You are an expert data extraction specialist for business loan applications. 
Your task is to extract structured information from loan application documents 
and output it as valid JSON following a precise schema.

CORE RULES:
1. Extract data accurately - never guess or fabricate information
2. Use null for missing values (NEVER use empty strings "", "-", or "N/A")
3. Follow the exact schema structure provided - output ALL fields even if null
4. Parse numeric values intelligently (handle abbreviations like "2M", "500k", ranges, etc.)
5. Normalize dates to YYYY-MM-DD format
6. Split full names into separate first/middle/last name fields
7. Structure addresses as objects with separate fields (not concatenated strings)
8. Extract both cell phone and home phone as separate fields
9. Calculate a confidence_score (0.0-1.0) based on extraction quality

OUTPUT FORMAT (CRITICAL - FOLLOW EXACTLY):
- Output ONLY the raw JSON object
- Do NOT wrap in markdown code blocks
- Do NOT use ```json or ``` or any backticks
- Do NOT add any text before the JSON
- Do NOT add any text after the JSON
- Your entire response must be ONLY the JSON
- First character must be {
- Last character must be }
```

#### User Prompt (from n8n_haiku_extraction_prompts.md, lines 52-220)
Extracts:
- Company information (legal_name, EIN, address, industry)
- Application details (business structure, funding request, employee count)
- Primary owner details (name, SSN, DOB, address, phone, email, ownership %)
- Secondary owner details (same fields, all nullable)

#### n8n Node Flow for Applications
```
[Trigger/Webhook or File Upload]
    ↓
[Extract PDF Text]
    ↓
[Anthropic Claude Node]
    ├─ Model: claude-3-5-haiku-20241022
    ├─ System Message: (from prompts file)
    ├─ User Prompt: (with {{$json.document_text}} variable)
    ├─ Temperature: 0.0
    └─ Max Tokens: 4096
    ↓
[Code Node] - Clean markdown & extract JSON
    ├─ Input: n8n's nested Anthropic response
    ├─ Strip: markdown code blocks (```json and ```)
    ├─ Parse: JSON.parse()
    └─ Output: Clean extraction object
    ↓
[HTTP Request Node]
    ├─ Method: POST
    ├─ URL: https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/application-schema-intake
    ├─ Headers: X-Webhook-Secret, Content-Type
    └─ Body: {{ $json }} (parsed extraction)
    ↓
[Response Handler]
    ├─ Check: response.success
    ├─ Extract: application_id, company_id, owner_ids
    └─ Log: Success or error
```

#### Code Node for Cleaning Anthropic Response
From `n8n_haiku_extraction_prompts.md` (lines 275-292):
```javascript
// Extract the text from n8n's Anthropic response structure
let responseText = $input.item.json[0].content[0].text;

// Strip markdown code blocks if present (```json and ```)
responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

// Trim whitespace
responseText = responseText.trim();

// Parse the JSON
const extractedData = JSON.parse(responseText);

// Return the parsed object
return { json: extractedData };
```

### Bank Statement Extraction Workflow
**Status:** ❌ **NOT Documented** - Configuration details missing

#### What We Know (from statement-schema-intake webhook expectations)
The n8n workflow MUST output this structure:
```json
{
  "document_id": "uuid",
  "extracted_data": {
    "statement": {
      "summary": {
        "account_number": "1234567890",
        "bank_name": "Chase Bank",
        "company": "240 Roofing LLC",
        "start_balance": 15000,
        "end_balance": 18000,
        "statement_start_date": "2025-09-01",
        "statement_end_date": "2025-09-30",
        "total_credits": 45000,
        "total_debits": 42000,
        "num_credits": 23,
        "num_debits": 28,
        "num_transactions": 51
      },
      "transactions": [
        {
          "date": "2025-09-01",
          "description": "Opening Balance",
          "amount": 15000,
          "balance": 15000
        }
      ]
    }
  }
}
```

#### Expected n8n Workflow Structure
1. **PDF Input Node** - File upload or webhook trigger
2. **PDF Text Extraction Node** - Convert PDF → text/JSON
3. **Anthropic Claude Node** - Extract structured bank statement data
4. **Code Node** - Clean JSON response
5. **HTTP Request Node** - POST to statement-schema-intake webhook
6. **Response Handler** - Log success/error

#### Expected Extraction Prompt (NOT YET DOCUMENTED)
Should instruct Haiku to:
- Extract bank name, account number, account holder/company name
- Parse statement period (start/end dates)
- Extract opening and closing balances
- List all transactions with:
  - Date (YYYY-MM-DD)
  - Description
  - Amount (positive = deposit, negative = withdrawal/fee)
  - Running balance
- Calculate totals:
  - total_credits (sum of positive amounts)
  - total_debits (sum of negative amounts)
  - num_credits (count of deposits)
  - num_debits (count of withdrawals)
  - num_transactions (total count)

---

## Entity Resolution Strategy (Unified)

### Problem Fixed (Oct 20, 2025)
Both webhooks now use **identical 4-step matching**:

1. **EIN Match** (most reliable, exact identifier)
   ```sql
   SELECT id FROM companies
   WHERE org_id = ? AND ein = ?
   ```
   - If EIN found → Use this company_id
   - If not found or no EIN → Continue to Step 2

2. **Normalized Legal Name Match** (most common)
   ```sql
   SELECT id FROM companies
   WHERE org_id = ? AND normalized_legal_name = ?
   ```
   - Normalization: uppercase → strip punctuation → remove legal suffixes (INC, LLC, CORP, etc.)
   - Example: "H2 Build, INC." → "H2 BUILD"
   - If found → Use this company_id
   - If not found → Continue to Step 3

3. **Company Aliases Lookup** (edge cases, manual overrides)
   ```sql
   SELECT company_id FROM company_aliases
   WHERE org_id = ? AND normalized_alias_name = ?
   ```
   - Allows manual mapping for complex variations
   - If found → Use this company_id
   - If not found → Continue to Step 4

4. **Create New Company** (no match found)
   ```sql
   INSERT INTO companies (org_id, legal_name, normalized_legal_name, ein)
   VALUES (?, ?, ?, ?)
   ```
   - Creates company with provided data
   - EIN only stored if provided (bank statements may not have it)

### How This Fixes the Bug
**Scenario:** Customer submits 3 bank statements + 1 application for "240 Roofing LLC" (EIN: 93-1794722)

**Before (BROKEN):**
1. Statements (no EIN) → matched by normalized_legal_name → company_id = X
2. Application (has EIN) → matched by EIN → company_id = Y ❌ DIFFERENT!

**After (FIXED):**
1. Statements → Step 1 (no EIN, skip) → Step 2 (normalized_legal_name match) → company_id = X ✅
2. Application → Step 1 (EIN match FAILS - company created without EIN) → Step 2 (normalized_legal_name match) → company_id = X ✅ SAME!

---

## Data Normalization Rules

### Company Name Normalization
```typescript
function normalizeCompanyName(name: string): string {
  return name
    .toUpperCase()                           // "H2 Build, INC" → "H2 BUILD, INC"
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')  // → "H2 BUILD INC"
    .replace(/\s+/g, ' ')                   // → "H2 BUILD INC"
    .replace(/\b(INC|LLC|CORP|CO|LTD|CORPORATION|L\.L\.C|PLLC)\b/g, '') // → "H2 BUILD"
    .trim();                                // → "H2 BUILD"
}
```

### Account Number Normalization
```typescript
function normalizeAccountNumber(account: string): string {
  return account.replace(/[^0-9]/g, '');  // "3618-057-067" → "3618057067"
}
```

### Account Hash & Masking
```typescript
const normalizedAccount = normalizeAccountNumber(accountNumber);
const accountHash = SHA256(normalizedAccount);       // For deduplication
const last4 = normalizedAccount.slice(-4);
const maskedAccount = `****${last4}`;                // "****7067" for UI
```

### Transaction Classification
```typescript
function classifyTransaction(tx: any): 'deposit' | 'withdrawal' | 'fee' {
  if (tx.amount > 0) return 'deposit';
  if (tx.amount < 0) {
    if (/NSF|FEE|OVERDRAFT|SERVICE|CHARGE/i.test(tx.description)) {
      return 'fee';
    }
    return 'withdrawal';
  }
  return 'deposit';
}
```

---

## Dashboard Integration

### API Endpoints (for React frontend)

1. **List Companies** (paginated)
   ```
   GET /functions/v1/list-companies?page=1&limit=20
   ```
   - Returns: Array of companies with basic info

2. **Get Company Detail**
   ```
   GET /functions/v1/get-company-detail/:company_id
   ```
   - Returns: Full company profile + bank statements + applications
   - Does NOT include individual transactions (too large)

3. **Get Statement Transactions** (lazy-load)
   ```
   GET /functions/v1/get-statement-transactions/:statement_id
   ```
   - Returns: Array of transactions for specific statement
   - Called on-demand when user expands statement panel

4. **Get Company Debts** (analysis)
   ```
   GET /functions/v1/get-company-debts/:company_id
   ```
   - Returns: Recurring debt patterns (IRS, collections, loans, garnishments)

---

## Deployment Status

### Supabase Project
- **Project ID:** vnhauomvzjucxadrbywg
- **Region:** (not specified, default US)

### Webhook Secret
- **Header Name:** `X-Webhook-Secret`
- **Value:** `clearscrub_webhook_2025_xyz123`
- **Distribution:** Share with n8n only (keep confidential)

### Deployed Functions
1. ✅ **statement-schema-intake** - Deployed Oct 20, 14:16 UTC
2. ⏳ **application-schema-intake** - Ready for deployment (entity resolution fix pending)
3. ✅ **list-companies** - Deployed (paginated with RLS)
4. ✅ **get-company-detail** - Deployed (no transactions in payload)
5. ✅ **get-statement-transactions** - Deployed (lazy-load)
6. ✅ **get-company-debts** - Deployed (recurring debt analysis)

### Deployment Command
```bash
cd /Users/vitolo/Desktop/clearscrub_main
supabase functions deploy application-schema-intake --project-ref vnhauomvzjucxadrbywg
```

---

## Missing Documentation

### What Needs to Be Created

1. **Bank Statement Extraction Prompt**
   - System message for Haiku
   - User prompt template
   - Field descriptions for all statement fields
   - Example input/output
   - Confidence score guidelines

2. **n8n Workflow Export** (JSON)
   - Application extraction workflow
   - Bank statement extraction workflow
   - Include node configurations
   - Include error handling

3. **Extraction Validation Guide**
   - Common OCR errors and corrections
   - How to handle multi-page statements
   - How to handle scanned vs. digital PDFs
   - When to flag for manual review (low confidence scores)

4. **Testing Guide**
   - Test bank statements (various banks and formats)
   - Test loan applications (single and multiple owners)
   - Test edge cases (missing data, OCR errors, etc.)

---

## Technical Details

### Transaction ID Generation
```typescript
id: `${payload.document_id}-${index.toString().padStart(4, '0')}`
// Example: "doc-uuid-0001", "doc-uuid-0002", etc.
```
- Purpose: Stable, deterministic IDs for React keys
- Benefit: Same ID across webhook retries

### Materialized View Refresh
```typescript
// Called after statement/application created
await supabase.rpc('refresh_account_rollups_concurrent');
await supabase.rpc('refresh_company_rollups_concurrent');
```
- Why RPC (not triggers): PostgreSQL cannot use REFRESH MATERIALIZED VIEW CONCURRENTLY in triggers
- Why concurrent: Prevents table locks during refresh

### File Deduplication
```typescript
const dataHash = SHA256(JSON.stringify(payload.extracted_data));
// Check if this exact data already processed
const { data: existingDoc } = await supabase
  .from('documents')
  .select('id')
  .eq('submission_id', document.submission_id)
  .eq('structured_json', payload.extracted_data)  // Exact JSON match
  .neq('id', payload.document_id)
  .limit(1);
```
- Prevents duplicate statements from same extraction

### Confidence Score (Application Extraction)
```
0.9-1.0: Excellent - all required fields clear
0.7-0.89: Good - minor unclear fields
0.5-0.69: Fair - several fields missing/unclear
< 0.5: Poor - document illegible/incomplete
```

---

## n8n Integration Checklist

### Pre-Production
- [ ] Download n8n workflow exports for both workflows
- [ ] Document bank statement extraction prompt
- [ ] Test application extraction with 10+ sample PDFs
- [ ] Test bank statement extraction with 5+ bank formats
- [ ] Verify webhook secret is configured in n8n
- [ ] Verify Anthropic API key in n8n is active
- [ ] Test CORS preflight (OPTIONS request)
- [ ] Test error handling (invalid JSON, missing fields)

### Testing
- [ ] Extract single owner application
- [ ] Extract dual owner application
- [ ] Extract bank statement (manual check numbers)
- [ ] Extract statement with NSF fees
- [ ] Extract statement with negative balance days
- [ ] Verify company matching works (same company, different PDFs)
- [ ] Verify entity resolution unifies documents
- [ ] Verify confidence scores are accurate

### Monitoring
- [ ] Check Supabase Edge Function logs daily
- [ ] Monitor extraction success rate
- [ ] Alert on webhook errors (401, 400, 500)
- [ ] Alert on low confidence scores (< 0.7)
- [ ] Alert on duplicate detection

---

## Files Referenced

### Source Code
- `/supabase/functions/statement-schema-intake/index.ts` (540 lines)
- `/supabase/functions/application-schema-intake/index.ts` (~300 lines)
- `/supabase/functions/list-companies/index.ts`
- `/supabase/functions/get-company-detail/index.ts`
- `/supabase/functions/get-statement-transactions/index.ts`
- `/supabase/functions/get-company-debts/index.ts`

### Documentation
- `/n8n_haiku_extraction_prompts.md` - Application extraction (applications only)
- `/application_intake_webhook_setup.md` - Complete application webhook guide
- `/ENTITY_RESOLUTION_FIX.md` - Entity resolution bug fix (Oct 20)
- `/CLAUDE.md` - Project context and architecture

### Configuration
- No n8n workflow exports found in repository
- Webhook secret in code: `clearscrub_webhook_2025_xyz123`
- Supabase project ID: `vnhauomvzjucxadrbywg`

---

## Security Considerations

### Webhook Authentication
- ✅ **Webhook Secret:** Simple shared secret in header (X-Webhook-Secret)
- ✅ **JWT Bypass:** External webhook, so JWT disabled
- ✅ **Service Role Key:** Backend uses admin key for writes (bypasses RLS)
- ✅ **CORS:** All API responses include proper CORS headers

### Data Protection
- ✅ **Account Number Masking:** SHA-256 hash + last 4 digits
- ✅ **RLS Policies:** Multi-tenant isolation enforced
- ✅ **SSN Handling:** Stored in owners table, formatted as XXX-XX-XXXX
- ✅ **File Deduplication:** Prevents processing same PDF twice

### Recommendations
- Rotate webhook secret quarterly
- Monitor n8n logs for failed extractions
- Implement rate limiting on webhook endpoint
- Consider encryption at rest for PII (SSN, account numbers)
- Regular security audits of RLS policies

---

## Next Steps

### Immediate (To Complete Workflows)
1. **Document Bank Statement Extraction Prompt** - Create prompt guide with:
   - System message for Haiku
   - User prompt template
   - Field mapping from PDF → JSON
   - Example statements + expected output

2. **Export n8n Workflow Configurations** - Get JSON exports of:
   - Application extraction workflow
   - Bank statement extraction workflow
   - Store in `/n8n_workflows/` directory

3. **Create Testing Guide** - Document:
   - Sample test PDFs (bank statements + applications)
   - Expected output for each
   - Error scenarios and recovery

### Medium-term (Optimization)
1. Add batch processing for multiple files
2. Implement retry logic with exponential backoff
3. Add webhook signature verification (HMAC-SHA256)
4. Create n8n dashboard for monitoring extraction metrics

### Long-term (Enhancement)
1. Support for more document types (invoices, tax returns, payroll)
2. Machine learning model for confidence score prediction
3. Automated quality scoring and flagging
4. Multi-language extraction support

---

## References

### Related Documentation
- `/CLAUDE.md` - Full system architecture (88% → 95% confidence)
- `/ENTITY_RESOLUTION_FIX.md` - Entity resolution bug fix details
- `/n8n_haiku_extraction_prompts.md` - Application extraction prompts
- `/application_intake_webhook_setup.md` - Application webhook complete guide
- `/supabase/functions/statement-schema-intake/README.md` - Webhook API

### External Resources
- n8n Documentation: https://docs.n8n.io/
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Claude Haiku API: https://docs.anthropic.com/
- PostgreSQL RLS: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

---

**Document Version:** 1.0
**Last Updated:** October 20, 2025
**Author:** Vincent (with Claude Code assistance)
**Status:** Ready for review and implementation

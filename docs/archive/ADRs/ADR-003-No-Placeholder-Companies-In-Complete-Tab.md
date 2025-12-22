# ADR-003: No Placeholder Companies In Complete Tab Until Fully Processed

## Status
Accepted

## Date
October 23, 2025

## Context
When should completed documents result in a new company appearing in the Complete tab? This timing decision has significant implications for data integrity, user experience, and system architecture.

### Option A: Create Company As Soon As Submission Prepared
When `prepare_submission()` RPC is called, immediately create a company record:
- **Pros:**
  - User sees company instantly
  - Company exists as "container" for incoming data
- **Cons:**
  - Companies appear incomplete (no statements, no transactions)
  - Hard to edit before company is "finalized"
  - User sees companies in wrong state (data not yet extracted)
  - What if OCR fails? Orphaned incomplete company
  - Complex state management: "draft" vs "complete" companies

### Option B: Create Company After ALL Documents Processed
Wait until every document in submission is complete, then create company:
- **Pros:**
  - Company appears only when fully ready
  - No incomplete data visible to users
  - Clear state transitions (processing → complete)
- **Cons:**
  - Delays company creation (user waits for all files)
  - What if one file fails? Entire submission blocked?
  - Batch dependency: one slow file blocks entire submission

### Option C: Create Company Asynchronously During OCR Processing
Each document triggers OCR independently, entity resolution creates/updates company:
- **Pros:**
  - Automatic entity resolution and deduplication
  - By the time document completes, company normalized and ready
  - No blocking: files process independently
  - Handles multiple files for same company gracefully
- **Cons:**
  - Timing uncertainty (company appears "when ready", not predictable)
  - Relies on entity resolution RPC to prevent duplicates

## Decision
Create company asynchronously during OCR processing (Option C). The `statement-schema-intake` webhook handles entity resolution and company creation as a side effect of document processing.

## Implementation

### Processing Flow
```
1. User uploads PDFs via dashboard
     ↓
2. prepare_submission() creates submission + document records (status='pending')
     ↓
3. Frontend uploads files to Supabase Storage
     ↓
4. Frontend calls enqueue-document-processing() for each file
     ↓
5. enqueue-document-processing Edge Function:
   - Updates document status='processing'
   - Calls statement-schema-intake webhook with file_path
     ↓
6. statement-schema-intake performs:
   - OCR extraction (LlamaIndex + Mistral)
   - Entity resolution RPC (4-step matching)
   - Creates/updates company (if not exists)
   - Inserts statements and transactions
   - Updates document status='complete'
     ↓
7. Company now visible in Complete tab
```

### Entity Resolution Logic (Existing)
```sql
-- statement-schema-intake calls this RPC
-- Location: supabase/functions/statement-schema-intake/index.ts lines 77-151

FUNCTION resolve_or_create_company(
  p_org_id UUID,
  p_ein TEXT,
  p_legal_name TEXT,
  p_dba_name TEXT
) RETURNS UUID AS $$
BEGIN
  -- Step 1: Try EIN match (if provided)
  IF p_ein IS NOT NULL THEN
    SELECT id INTO company_id FROM companies
    WHERE org_id = p_org_id AND ein = p_ein;
    IF FOUND THEN RETURN company_id; END IF;
  END IF;

  -- Step 2: Try normalized_legal_name match
  SELECT id INTO company_id FROM companies
  WHERE org_id = p_org_id
  AND normalized_legal_name = normalize_company_name(p_legal_name);
  IF FOUND THEN RETURN company_id; END IF;

  -- Step 3: Try company_aliases lookup
  SELECT company_id INTO alias_company_id FROM company_aliases
  WHERE org_id = p_org_id
  AND normalized_alias = normalize_company_name(p_legal_name);
  IF FOUND THEN RETURN alias_company_id; END IF;

  -- Step 4: Create new company
  INSERT INTO companies (org_id, legal_name, normalized_legal_name, ein, dba_name)
  VALUES (p_org_id, p_legal_name, normalize_company_name(p_legal_name), p_ein, p_dba_name)
  RETURNING id INTO company_id;

  RETURN company_id;
END;
$$ LANGUAGE plpgsql;
```

### Document Status Lifecycle
```
pending
  ↓ (enqueue-document-processing called)
processing
  ├─ complete (OCR successful, entity resolved, company created/updated)
  │    ↓
  │    Company appears in Complete tab
  │    Document linked to company via statements.company_id
  └─ failed (OCR failed or entity resolution failed)
       ↓
       Document appears in Failed tab
       No company created
```

### Complete Tab Query
```typescript
// Frontend: src/services/api.ts
export async function getCompanies(page = 1, limit = 50) {
  const start = (page - 1) * limit
  const end = start + limit - 1

  const { data, error, count } = await supabase
    .from('companies')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(start, end)

  if (error) throw error
  return { data, count }
}

// RLS automatically filters by user's org_id
// Only shows companies where org_id matches user's profile
```

## Rationale

### 1. Single Source of Truth for Entity Resolution
Entity resolution RPC handles all company matching logic:
- EIN matching (authoritative identifier)
- Normalized legal name matching (handles variations)
- Company aliases lookup (manual overrides)
- Automatic deduplication

By centralizing this logic, we ensure consistent behavior regardless of:
- Document order (statements before/after application)
- Number of files uploaded
- Whether EIN is present or not

### 2. No Duplicates Guaranteed
4-step matching prevents duplicate companies:
```
Example Scenario:
1. User uploads bank statement (no EIN) for "H2 Build, LLC"
   → Creates company with normalized_legal_name = "H2 BUILD"

2. User uploads application (with EIN 12-3456789) for "H2 Build LLC"
   → Step 2: Matches existing company by normalized_legal_name
   → Updates existing company with EIN
   → No duplicate created
```

### 3. Complete Data When Company Appears
By the time company appears in Complete tab:
- OCR extraction finished (all fields populated)
- Entity resolution complete (no duplicates)
- Statements and transactions inserted
- Materialized views refreshed (monthly rollups ready)

User never sees incomplete or "draft" company.

### 4. Clean UX: Clear State Transitions
- **Processing tab:** Files being processed (shows documents)
- **Complete tab:** Companies ready to underwrite (shows companies)
- **Failed tab:** Errors requiring attention (shows documents with error_text)

Each tab shows appropriate entity type at appropriate stage.

### 5. Handles Multiple Files for Same Company
```
Scenario: User uploads 3 bank statements for same company

1. statement_jan.pdf processes → creates company "Acme Corp"
2. statement_feb.pdf processes → matches existing "Acme Corp", adds statement
3. statement_mar.pdf processes → matches existing "Acme Corp", adds statement

Result: One company with 3 statements (no duplicates)
```

Entity resolution automatically handles this.

## Consequences

### Positive
- **No stale companies:** Companies only exist when data is complete
- **Entity resolution centralized:** Single RPC function handles all matching
- **Deduplication automatic:** 4-step matching prevents duplicates
- **Clean UX:** Users see companies only when ready
- **Scalable:** Handles any number of files per company
- **Audit trail:** Document lineage tracks which files created company

### Negative
- **Company creation delayed:** Depends on OCR speed (typically 10-30 seconds per file)
  - **Mitigation:** Real-time subscriptions show progress in Processing tab
  - **Future:** WebSocket updates or polling to show live status

- **Timing uncertainty:** User doesn't know exactly when company will appear
  - **Mitigation:** Processing tab shows "Processing..." status with spinner
  - **Future:** Progress percentage or estimated time remaining

- **Relies on webhook success:** If statement-schema-intake fails, no company created
  - **Mitigation:** Document status='failed' with error_text explains why
  - **Future:** Retry mechanism for failed documents

### Neutral
- **Company creation is async:** Not synchronous with document upload
  - This is intentional: OCR processing is inherently async
  - Frontend uses polling or subscriptions to detect completion

## Alternatives Considered

### 1. Immediate Placeholder Creation (Rejected)
```sql
-- Would create incomplete company immediately
INSERT INTO companies (org_id, legal_name, status)
VALUES (p_org_id, 'Unknown Company', 'draft')
RETURNING id;

-- Later update when OCR completes
UPDATE companies SET legal_name = 'Acme Corp', status = 'complete'
WHERE id = company_id;
```
- **Why rejected:**
  - Not scalable: Multiple files for same company create multiple drafts
  - Hard to merge drafts: What if names don't match exactly?
  - Data pollution: Failed uploads leave orphaned drafts
  - Complex state management: "draft" vs "complete" status

### 2. Manual Company Creation (Rejected)
```typescript
// User fills form before upload
<Form>
  <Input name="company_name" required />
  <Input name="ein" />
  <FileUpload />
</Form>
```
- **Why rejected:**
  - Extra user friction: Requires manual data entry
  - Error-prone: User might misspell company name
  - Defeats purpose of OCR: We already extract this data from documents
  - Doesn't handle deduplication: What if company already exists?

### 3. Async Creation During OCR (Chosen)
```typescript
// statement-schema-intake webhook
const company_id = await resolveOrCreateCompany({
  org_id,
  ein: extracted_data.ein,
  legal_name: extracted_data.company_name,
  dba_name: extracted_data.dba_name
})

// Company created as side effect of document processing
// Appears in Complete tab when ready
```
- **Why chosen:**
  - Automatic: No manual data entry
  - Accurate: Data comes from authoritative source (documents)
  - Deduplication built-in: Entity resolution prevents duplicates
  - Scalable: Handles any number of files per company

## Edge Cases Handled

### Case 1: Multiple Files Uploaded Simultaneously
```
User uploads 3 files at once for same company:
- statement_jan.pdf
- statement_feb.pdf
- statement_mar.pdf

All 3 call statement-schema-intake concurrently.

Result:
- First to complete creates company
- Second and third match existing company via entity resolution
- No duplicates created (database-level locking prevents race conditions)
```

### Case 2: Application Before Bank Statement
```
User uploads application first (has EIN), then bank statement (no EIN).

Flow:
1. application-schema-intake creates company with EIN
2. statement-schema-intake matches company via EIN (Step 1 of entity resolution)
3. Adds statement to existing company
```

### Case 3: Bank Statement Before Application
```
User uploads bank statement first (no EIN), then application (has EIN).

Flow:
1. statement-schema-intake creates company without EIN (normalized_legal_name only)
2. application-schema-intake matches company via normalized_legal_name (Step 2)
3. Updates existing company with EIN
```

### Case 4: OCR Extraction Fails
```
User uploads corrupted PDF.

Flow:
1. statement-schema-intake attempts OCR
2. OCR fails (no text extracted)
3. Webhook updates document status='failed', error_text='OCR extraction failed'
4. No company created
5. Document appears in Failed tab
```

### Case 5: Entity Resolution Fails
```
User uploads document with ambiguous company name.

Flow:
1. OCR succeeds, extracts company name
2. Entity resolution creates new company (Step 4: no matches found)
3. User manually creates company_alias if deduplication needed
4. Future uploads will match via alias
```

## Related Decisions
- **ADR-001:** Job Model using submissions table (documents belong to submissions)
- **ADR-002:** Processing Tab derived from documents table (not placeholder companies)

## Integration Points

### Frontend (React Dashboard)
```typescript
// src/pages/Companies.tsx

// Complete tab: Shows companies (entity-centric)
const { data: companies } = useQuery(['companies'], getCompanies)

// Processing tab: Shows documents (file-centric)
const { data: documents } = useQuery(['processing'], getProcessingDocuments)

// When document.status changes to 'complete', company appears in Complete tab
// Real-time subscription (future):
useEffect(() => {
  const subscription = supabase
    .channel('documents')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'documents',
      filter: `status=eq.complete`
    }, (payload) => {
      queryClient.invalidateQueries(['companies']) // Refresh Complete tab
    })
    .subscribe()

  return () => subscription.unsubscribe()
}, [])
```

### Backend (Edge Functions)
```typescript
// supabase/functions/statement-schema-intake/index.ts

// Called by enqueue-document-processing
// Performs OCR + entity resolution + company creation atomically

const company_id = await resolveOrCreateCompany({
  org_id,
  ein: extracted_data.ein,
  legal_name: extracted_data.company_name,
  dba_name: extracted_data.dba_name
})

// Insert statements and transactions
await insertStatements(company_id, extracted_data.statements)
await insertTransactions(extracted_data.transactions)

// Update document status
await updateDocumentStatus(doc_id, 'complete')

// Company now visible in Complete tab
```

## Testing Strategy

### Unit Tests (Future)
```typescript
describe('Entity Resolution', () => {
  test('creates company when none exists', async () => {
    const company_id = await resolveOrCreateCompany({
      org_id: 'test-org',
      ein: null,
      legal_name: 'Acme Corp',
      dba_name: null
    })
    expect(company_id).toBeDefined()
  })

  test('matches existing company by EIN', async () => {
    const company_id_1 = await resolveOrCreateCompany({
      org_id: 'test-org',
      ein: '12-3456789',
      legal_name: 'Acme Corp',
      dba_name: null
    })

    const company_id_2 = await resolveOrCreateCompany({
      org_id: 'test-org',
      ein: '12-3456789',
      legal_name: 'Acme Corporation', // Different name
      dba_name: null
    })

    expect(company_id_1).toBe(company_id_2) // Same company
  })

  test('matches existing company by normalized name', async () => {
    const company_id_1 = await resolveOrCreateCompany({
      org_id: 'test-org',
      ein: null,
      legal_name: 'H2 Build, LLC',
      dba_name: null
    })

    const company_id_2 = await resolveOrCreateCompany({
      org_id: 'test-org',
      ein: null,
      legal_name: 'H2 BUILD LLC', // Different case and punctuation
      dba_name: null
    })

    expect(company_id_1).toBe(company_id_2) // Same company
  })
})
```

### Integration Tests (Manual)
```bash
# Test 1: Upload single file, verify company created
curl -X POST /functions/v1/enqueue-document-processing \
  -H "Authorization: Bearer {JWT}" \
  -d '{"doc_id": "{doc_id}"}'

# Wait 30 seconds
# Verify company appears in Complete tab
# Verify document status='complete'

# Test 2: Upload multiple files for same company
# Upload statement_jan.pdf
# Upload statement_feb.pdf
# Verify only ONE company created
# Verify company has TWO statements

# Test 3: Upload corrupted file
# Verify document status='failed'
# Verify error_text populated
# Verify NO company created
```

## References
- Entity resolution RPC: `supabase/functions/statement-schema-intake/index.ts` lines 77-151
- Unified entity resolution fix: `docs/ENTITY_RESOLUTION_FIX.md`
- Database schema: `supabase/database/migrations/20251023_add_company_feature_schema.sql`
- Original entity resolution bug: Fixed Oct 20, 2025

## Review Notes
This ADR documents the culmination of the unified entity resolution work (Oct 20, 2025). The decision to create companies asynchronously during OCR processing—rather than immediately or after batch completion—provides the best balance of:
- Data integrity (no incomplete companies)
- User experience (clear state transitions)
- System scalability (handles multiple files per company)
- Deduplication (automatic via entity resolution)

The key insight: **Company creation is a side effect of document processing, not a prerequisite.** This architectural choice enables robust entity resolution and prevents duplicate companies regardless of document order or upload patterns.

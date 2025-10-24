# ADR-002: Processing Tab Derived From Documents Table (Not Placeholder Companies)

## Status
Accepted

## Date
October 23, 2025

## Context
The Add Company feature requires a "Processing" tab to show files being uploaded and processed. The key architectural question: **What data model should drive the Processing tab?**

### Option A: Create Placeholder Companies During Upload
When files are uploaded, immediately create a company record with minimal data:
- **Pros:**
  - Users see "company in progress" immediately
  - Familiar mental model (companies everywhere)
- **Cons:**
  - Clutters companies list with unfinished entities
  - Hard to clean up failed uploads (what if OCR fails?)
  - User sees company they didn't intentionally "create"
  - Requires complex state management (partial vs complete company)
  - Failed uploads leave orphaned placeholder companies
  - No clear boundary between "draft" and "real" company

### Option B: Derive Processing Tab From Documents Table
Processing tab shows individual files, not companies:
- **Pros:**
  - No placeholder data pollution
  - Reflects actual state (document processing status)
  - Failed uploads don't leave orphans
  - When document status='complete', result company appears in Complete tab
  - Clear separation: documents in processing, companies in Complete tab
  - Transparent: users see actual file status
- **Cons:**
  - Users can't see "which company this is for" until complete
  - Different entity type in Processing tab vs Complete tab

## Decision
Derive Processing tab from `documents` table WHERE `status IN ('pending', 'processing')`. Users see individual files with processing status, not placeholder companies.

## Implementation

### Processing Tab Query
```typescript
// Frontend: src/services/api.ts
export async function getProcessingDocuments(page = 1, limit = 50) {
  const start = (page - 1) * limit
  const end = start + limit - 1

  const { data, error, count } = await supabase
    .from('documents')
    .select('*', { count: 'exact' })
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .range(start, end)

  if (error) throw error
  return { data, count }
}
```

### Processing Tab Component Structure
```typescript
// Frontend: src/pages/Companies.tsx (Processing Tab)
interface ProcessingDocument {
  id: string
  file_name: string
  file_size: number
  status: 'pending' | 'processing'
  processing_started_at: string | null
  created_at: string
}

// Display columns:
// - File Name (statement.pdf)
// - Size (102 KB)
// - Status (Processing... with spinner OR Pending)
// - Started At (timestamp)
// - Actions (Cancel button - future)
```

### RLS Policy (Already Exists)
```sql
-- documents table RLS policy
CREATE POLICY "Users see own org documents"
ON documents FOR SELECT
USING (
  submission_id IN (
    SELECT id FROM submissions WHERE org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  )
);
```

### Status Transition Flow
```
Document Status Lifecycle:
  pending
    ↓ (enqueue-document-processing called)
  processing
    ├─ complete (OCR successful, entity resolved)
    │    ↓
    │    Company appears in Complete tab
    └─ failed (OCR failed or entity resolution failed)
         ↓
         Document appears in Failed tab
```

## Rationale

### 1. Clean Separation of Concerns
- **Processing tab:** Work in progress (documents)
- **Complete tab:** Finished work (companies)
- **Failed tab:** Errors (documents with error_text)

This separation matches user mental model:
- "I'm waiting for files to process" → Processing tab
- "I want to see companies I've created" → Complete tab

### 2. No Data Pollution
Placeholder companies create technical debt:
- What if OCR fails? Delete the placeholder?
- What if user cancels upload? Orphaned company?
- How to distinguish "real" vs "placeholder" companies in queries?

By showing documents in Processing tab:
- Failed uploads don't create junk companies
- Cancellation is clean (delete document, not company)
- No "ghost" companies in database

### 3. Transparent Processing State
Users see actual file status:
- **Pending:** File uploaded, waiting for processing
- **Processing:** OCR extraction in progress
- **Complete:** Company created and visible in Complete tab
- **Failed:** Error message visible in Failed tab

This matches reality of async processing.

### 4. Future-Proof for Document Lineage
Documents table tracks:
- Which file created which company
- When processing started/completed
- Error messages for failures

This enables future features:
- "Show me source document for this company"
- "Reprocess failed document"
- "Audit trail: which files were uploaded when"

### 5. Better Diagnostics
When processing fails, user sees:
- Exact file name that failed
- Error message from OCR service
- Timestamp of failure

With placeholder companies, error state is ambiguous:
- "Company failed to create" - but which file?
- No clear mapping to source document

## Consequences

### Positive
- **Processing tab always shows work in progress:** Clear mental model
- **Clean data model:** No placeholder companies in database
- **Better diagnostics:** See which file failed and why
- **Easy to implement:** Direct query on documents table
- **Scalable:** No complex state management for partial entities
- **Audit trail:** Track document lineage to source file

### Negative
- **Users can't see "which company this is for" until complete:**
  - **Mitigation:** Display company name extracted from document metadata
  - **Future:** Show extracted company name in Processing tab (before full entity resolution)

- **Different entity type in Processing vs Complete tabs:**
  - Processing tab shows documents (file-centric view)
  - Complete tab shows companies (entity-centric view)
  - **Mitigation:** Clear UI labeling and column headers

### Neutral
- **Processing tab may show multiple documents for same company:**
  - Example: User uploads 3 bank statements for same company
  - Processing tab shows 3 rows (one per file)
  - This is intentional: user uploaded 3 files, they see 3 files processing
  - When complete, entity resolution merges into single company

## Alternatives Considered

### 1. Placeholder Companies (Rejected)
```sql
-- Would require complex state management
companies (
  id UUID,
  org_id UUID,
  status TEXT CHECK (status IN ('draft', 'complete')),
  ...
)

-- Query would need to filter:
SELECT * FROM companies WHERE status = 'draft' -- Processing tab
SELECT * FROM companies WHERE status = 'complete' -- Complete tab
```
- **Why rejected:** Data pollution, hard to clean up failures, no clear source file mapping

### 2. Separate Processing Queue Table (Rejected)
```sql
processing_queue (
  id UUID,
  org_id UUID,
  file_name TEXT,
  status TEXT,
  ...
)
```
- **Why rejected:** Redundant with documents table, would require data duplication

### 3. Derived Table from Documents (Chosen)
```sql
-- No additional tables needed
-- Query directly from documents table with status filter
SELECT * FROM documents WHERE status IN ('pending', 'processing')
```
- **Why chosen:** Simple, no data duplication, reflects actual state

## Related Decisions
- **ADR-001:** Job Model using submissions table (documents belong to submissions)
- **ADR-003:** Company creation timing (async during OCR, not immediate)

## UI/UX Implications

### Processing Tab Visual Design
```
┌─────────────────────────────────────────────────────────────┐
│ Processing (3 files)                                        │
├─────────────────────────────────────────────────────────────┤
│ File Name            │ Size   │ Status      │ Started At   │
├─────────────────────────────────────────────────────────────┤
│ statement_jan.pdf    │ 102 KB │ Processing  │ 2 mins ago   │
│ statement_feb.pdf    │ 98 KB  │ Processing  │ 2 mins ago   │
│ application.pdf      │ 51 KB  │ Pending     │ -            │
└─────────────────────────────────────────────────────────────┘
```

### Complete Tab Visual Design
```
┌─────────────────────────────────────────────────────────────┐
│ Complete (12 companies)                                     │
├─────────────────────────────────────────────────────────────┤
│ Company Name         │ EIN         │ Created At           │
├─────────────────────────────────────────────────────────────┤
│ H2 Build LLC         │ 12-3456789  │ Oct 23, 2025 2:30 PM │
│ Acme Corp            │ 98-7654321  │ Oct 22, 2025 9:15 AM │
└─────────────────────────────────────────────────────────────┘
```

## References
- Documents table schema: `/supabase/database/migrations/20251023_add_company_feature_schema.sql`
- API endpoint: `getProcessingDocuments()` in `/clearscrub_dashboard/src/services/api.ts`
- RLS policies: Documents inherit security from submissions via foreign key

## Review Notes
This ADR reflects a deliberate choice to prioritize data integrity and transparency over immediate user gratification (seeing "company" right away). The trade-off is acceptable because:
1. Processing time is typically <30 seconds per file
2. Real-time updates (future) will show progress
3. Clear error messages guide users when failures occur
4. Database remains clean without orphaned placeholders

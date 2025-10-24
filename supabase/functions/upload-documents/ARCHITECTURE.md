# upload-documents Architecture

## System Context

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ClearScrub System                            │
│                                                                      │
│  ┌─────────────┐      ┌──────────────┐      ┌──────────────┐      │
│  │  Dashboard  │─────▶│   upload-    │─────▶│   document-  │      │
│  │   (React)   │ POST │  documents   │ POST │   metadata   │      │
│  │             │      │   Function   │      │   Function   │      │
│  └─────────────┘      └──────┬───────┘      └──────┬───────┘      │
│         │                    │                      │               │
│         │                    ▼                      ▼               │
│         │              ┌──────────┐          ┌──────────┐          │
│         │              │PostgreSQL│          │  Flow    │          │
│         │              │ Database │          │ Webhook  │          │
│         │              └──────────┘          └──────────┘          │
│         │                    │                      │               │
│         │                    │                      ▼               │
│         │                    │              ┌──────────────┐       │
│         │                    │              │   Intake     │       │
│         └────────────────────┼─────────────▶│  Webhooks   │       │
│                              │              └──────────────┘       │
│                              ▼                                      │
│                        ┌──────────┐                                │
│                        │ Storage  │                                │
│                        │  Bucket  │                                │
│                        └──────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Phase 1: Upload (Synchronous - This Function)

```
User Action: Drag-and-drop PDFs
        ↓
Dashboard: Create FormData with files[]
        ↓
POST /upload-documents
  Headers: Authorization: Bearer {jwt}
  Body: multipart/form-data
        ↓
┌─────────────────────────────────────┐
│   upload-documents Edge Function    │
│                                     │
│  [1] Validate JWT                  │
│      ├─ Extract user from token    │
│      └─ Query profiles for org_id  │
│                                     │
│  [2] Parse Form Data                │
│      └─ Extract files[] array      │
│                                     │
│  [3] Create Submission              │
│      INSERT submissions (org_id)   │
│                                     │
│  [4] For Each File:                 │
│      ├─ Upload to Storage          │
│      │  Path: org_id/submission_id/│
│      │        timestamp_filename   │
│      │                             │
│      ├─ INSERT document record     │
│      │  (status: 'uploaded')       │
│      │                             │
│      └─ POST to document-metadata  │
│         (fire-and-forget)          │
│                                     │
│  [5] Return 202 Accepted            │
│      { submissions, summary }      │
└─────────────────────────────────────┘
        ↓
Dashboard: Show upload success
        ↓
Dashboard: Poll for processing status
```

### Phase 2: Processing (Asynchronous - External Functions)

```
document-metadata receives storage event
        ↓
Extract PDF metadata (page count, etc.)
        ↓
Update document record (status: 'processing')
        ↓
POST to Flow webhook (LlamaIndex + Mistral)
        ↓
Flow processes PDF → Structured JSON
        ↓
Flow POSTs to intake webhook
  (statement-schema-intake OR application-schema-intake)
        ↓
Intake webhook performs entity resolution
        ↓
Write to database:
  - companies
  - accounts
  - statements OR applications
        ↓
Refresh materialized views
        ↓
Update document record (status: 'completed')
        ↓
Dashboard polls → Shows processed data
```

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     upload-documents Function                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    Request Handlers                      │  │
│  │                                                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │  │
│  │  │ OPTIONS  │  │   POST   │  │  Other   │             │  │
│  │  │ Handler  │  │ Handler  │  │ Methods  │             │  │
│  │  │  (CORS)  │  │  (Main)  │  │  (405)   │             │  │
│  │  └──────────┘  └────┬─────┘  └──────────┘             │  │
│  │                     │                                   │  │
│  └─────────────────────┼───────────────────────────────────┘  │
│                        │                                       │
│  ┌─────────────────────▼───────────────────────────────────┐  │
│  │              Authentication Layer                        │  │
│  │                                                          │  │
│  │  ┌──────────────┐      ┌──────────────┐               │  │
│  │  │ JWT Validate │─────▶│ Extract      │               │  │
│  │  │ via auth API │      │ org_id from  │               │  │
│  │  │              │      │ profiles     │               │  │
│  │  └──────────────┘      └──────────────┘               │  │
│  └─────────────────────────┬──────────────────────────────┘  │
│                            │                                  │
│  ┌─────────────────────────▼──────────────────────────────┐  │
│  │               File Processing Layer                     │  │
│  │                                                         │  │
│  │  ┌──────────────┐      ┌──────────────┐              │  │
│  │  │ Parse        │─────▶│ Validate     │              │  │
│  │  │ multipart    │      │ files exist  │              │  │
│  │  └──────────────┘      └──────────────┘              │  │
│  └─────────────────────────┬──────────────────────────────┘  │
│                            │                                  │
│  ┌─────────────────────────▼──────────────────────────────┐  │
│  │              Database Operations Layer                  │  │
│  │                                                         │  │
│  │  ┌──────────────┐                                      │  │
│  │  │ Create       │  Uses service_role_key              │  │
│  │  │ Submission   │  (bypasses RLS)                     │  │
│  │  └──────┬───────┘                                      │  │
│  │         │                                              │  │
│  │         ▼                                              │  │
│  │  ┌──────────────────────────────────┐                 │  │
│  │  │ For Each File:                   │                 │  │
│  │  │  ├─ Upload to Storage            │                 │  │
│  │  │  ├─ Create Document Record       │                 │  │
│  │  │  └─ Invoke document-metadata     │                 │  │
│  │  └──────────────────────────────────┘                 │  │
│  └─────────────────────────┬──────────────────────────────┘  │
│                            │                                  │
│  ┌─────────────────────────▼──────────────────────────────┐  │
│  │               Response Builder Layer                    │  │
│  │                                                         │  │
│  │  ┌──────────────┐      ┌──────────────┐              │  │
│  │  │ Aggregate    │─────▶│ Format 202   │              │  │
│  │  │ Results      │      │ Response     │              │  │
│  │  └──────────────┘      └──────────────┘              │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Database Schema Interactions

### Tables Modified

```sql
-- 1. submissions (batch tracking)
CREATE TABLE submissions (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  submission_date TIMESTAMPTZ,
  file_count INTEGER,
  ingestion_method TEXT,  -- 'manual_upload'
  metadata JSONB,
  created_at TIMESTAMPTZ
);

-- 2. documents (individual files)
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id),
  file_path TEXT NOT NULL,  -- 'org_id/submission_id/timestamp_filename'
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  processing_status TEXT,  -- 'uploaded' | 'processing' | 'completed' | 'failed'
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### RLS Policies Applied

```sql
-- Service role bypasses ALL policies (used by this function)
CREATE POLICY "Service role bypass"
ON submissions FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- Users can only see their org's submissions
CREATE POLICY "Users see own org submissions"
ON submissions FOR SELECT
USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

## Storage Structure

```
incoming-documents/
├── org-uuid-1/
│   ├── submission-uuid-1/
│   │   ├── 1698765432000_statement.pdf
│   │   ├── 1698765433000_application.pdf
│   │   └── 1698765434000_bank_statement.pdf
│   └── submission-uuid-2/
│       └── 1698765435000_loan_app.pdf
└── org-uuid-2/
    └── submission-uuid-3/
        └── 1698765436000_financial.pdf
```

**Path Pattern:** `{org_id}/{submission_id}/{timestamp}_{sanitized_filename}`

**Why This Structure:**
- `org_id` → Multi-tenant isolation
- `submission_id` → Batch grouping
- `timestamp` → Prevents filename collisions
- `sanitized_filename` → Removes special characters

## Error Handling Flow

```
Request Received
     │
     ├─▶ JWT Invalid? ──▶ 401 Unauthorized
     │
     ├─▶ No Files? ──▶ 400 Bad Request
     │
     ├─▶ Wrong Method? ──▶ 405 Method Not Allowed
     │
     ├─▶ Parse Error? ──▶ 400 Invalid Form Data
     │
     ├─▶ Profile Not Found? ──▶ 401 Unauthorized
     │
     ├─▶ Submission Insert Fails? ──▶ 500 Internal Error
     │
     ├─▶ File Upload Fails?
     │       ├─▶ Log error
     │       ├─▶ Mark file as failed
     │       └─▶ Continue with next file
     │
     └─▶ All Processing Complete
             ├─▶ Some Succeeded? ──▶ 202 Accepted (partial success)
             └─▶ All Failed? ──▶ 202 Accepted (with all errors)
```

**Philosophy:** Maximize success, don't block entire batch

## Security Model

### Authentication Flow

```
1. Dashboard Login
   └─▶ Supabase Auth generates JWT
       └─▶ JWT contains user_id (sub claim)

2. Upload Request
   └─▶ Authorization: Bearer {jwt}
       └─▶ Function validates JWT via auth.getUser()
           └─▶ Success? Continue
           └─▶ Failure? 401

3. Profile Lookup
   └─▶ SELECT org_id FROM profiles WHERE id = auth.uid()
       └─▶ Found? Use org_id
       └─▶ Not Found? 401

4. Database Writes
   └─▶ Service role key (bypasses RLS)
       └─▶ But org_id enforced in INSERT
           └─▶ User can only upload to their org
```

### Authorization Flow

```
User uploads file with org_id = 'ABC'
     ↓
Submission created: { org_id: 'ABC' }
     ↓
Document created: { submission_id: UUID (links to ABC) }
     ↓
Storage path: ABC/submission-id/file.pdf
     ↓
User from org 'XYZ' tries to access
     ↓
RLS Policy: org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
     ↓
Query returns 0 rows (user can't see ABC's data)
```

## Performance Characteristics

### Time Complexity

**Per Request:**
- JWT validation: O(1) - Single auth API call
- Profile lookup: O(1) - Single SELECT with index
- Submission creation: O(1) - Single INSERT
- File processing: O(n) - Where n = number of files
  - Each file: Upload (O(file_size)) + Insert (O(1))
- Response building: O(n) - Aggregate results

**Total:** O(n * file_size) - Dominated by storage uploads

### Space Complexity

**Memory Usage:**
- Request parsing: O(total_upload_size) - Temporary form data
- File streaming: O(1) - Direct to storage (no buffering)
- Database records: O(n) - One document per file
- Response object: O(n) - Result array

**Storage:**
- Database: ~1KB per submission + ~1KB per document
- Storage: file_size per file (no compression)

### Scalability

**Vertical (Per Request):**
- Max files: Limited by timeout (150s)
- Max size: Limited by timeout (~150MB for 1s/MB)
- Recommended: < 10 files, < 50MB each

**Horizontal (Concurrent):**
- Edge Functions auto-scale
- Database handles concurrency via ACID
- Storage handles parallel uploads
- No shared state between requests

## Observability

### Logs Structure

```typescript
// Request start
console.log(`Processing upload for org_id: ${orgId}, user_id: ${userId}`);

// File processing
console.log(`Received ${files.length} file(s) for upload`);
console.log(`Processing file: ${name} (${size} bytes, ${type})`);

// Operations
console.log(`Created submission: ${submissionId}`);
console.log(`Uploaded to storage: ${storagePath}`);
console.log(`Created document record: ${documentId}`);

// Completion
console.log(`File processed successfully in ${ms}ms: ${name}`);
console.log(`Upload complete: ${successful} succeeded, ${failed} failed`);

// Errors
console.error('JWT validation failed:', error);
console.error(`Storage upload failed for ${name}:`, error);
```

### Metrics to Collect

**Function-Level:**
- Request count (total, success, failure)
- Response time (avg, p50, p95, p99)
- Error rate by code (401, 400, 500)
- Concurrent executions

**File-Level:**
- Files uploaded (count, size distribution)
- Upload time by size
- Success rate per file type
- Processing completion rate

**Business-Level:**
- Uploads per org
- Active users
- Storage growth rate
- Cost per upload

## Testing Strategy

### Unit Tests (Conceptual)

```typescript
describe('upload-documents', () => {
  test('validates JWT correctly', async () => {
    const invalidToken = 'invalid-jwt';
    const response = await uploadDocuments({ jwt: invalidToken });
    expect(response.status).toBe(401);
  });

  test('parses multipart form data', async () => {
    const formData = createMockFormData([file1, file2]);
    const files = await parseFormData(formData);
    expect(files.length).toBe(2);
  });

  test('sanitizes filenames', () => {
    expect(sanitizeFilename('test file!@#.pdf')).toBe('test_file___.pdf');
  });

  test('generates unique storage paths', () => {
    const path = generateStoragePath('org-1', 'sub-1', 'test.pdf');
    expect(path).toMatch(/^org-1\/sub-1\/\d+_test\.pdf$/);
  });
});
```

### Integration Tests (test-upload.sh)

1. **Successful Upload** - Verify 202 with IDs
2. **CORS Preflight** - Verify OPTIONS returns 204
3. **Missing Auth** - Verify 401 rejection
4. **No Files** - Verify 400 rejection
5. **Multiple Files** - Verify batch processing
6. **Wrong Method** - Verify 405 rejection

### E2E Tests (Manual)

1. **Full Pipeline** - Upload → Process → Display
2. **Multi-Tenant** - Verify org isolation
3. **Error Recovery** - Partial success handling
4. **Performance** - Load test with realistic data

## Deployment Architecture

```
┌──────────────────────────────────────────────────────┐
│              Supabase Cloud Platform                  │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │            Edge Function Runtime                │  │
│  │                                                 │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │      upload-documents Instance 1         │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  │                                                 │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │      upload-documents Instance 2         │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  │                                                 │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │      upload-documents Instance N         │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  │                                                 │  │
│  │  Auto-scaling based on load                    │  │
│  └────────────────────────┬───────────────────────┘  │
│                           │                           │
│  ┌────────────────────────▼───────────────────────┐  │
│  │           Supabase Storage Layer               │  │
│  │                                                │  │
│  │  incoming-documents bucket                     │  │
│  │  (S3-compatible)                               │  │
│  └────────────────────────┬───────────────────────┘  │
│                           │                           │
│  ┌────────────────────────▼───────────────────────┐  │
│  │          PostgreSQL Database                   │  │
│  │                                                │  │
│  │  submissions, documents tables                 │  │
│  │  (Multi-tenant with RLS)                       │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**Key Characteristics:**
- **Stateless:** No shared memory between instances
- **Auto-scaling:** Supabase handles based on load
- **Global:** Edge locations for low latency
- **Isolated:** Each invocation independent

## Related Components

### Upstream Callers

**Dashboard Upload Component:**
```typescript
// Example React component
const uploadFiles = async (files: File[]) => {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));

  const response = await fetch('/functions/v1/upload-documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });

  return response.json();
};
```

### Downstream Services

**document-metadata Function:**
- Receives storage event payload
- Extracts PDF metadata
- Initiates processing pipeline

**Flow Webhook:**
- LlamaIndex + Mistral OCR
- Converts PDF → Structured JSON
- Sends to intake webhooks

**Intake Webhooks:**
- statement-schema-intake (bank statements)
- application-schema-intake (loan applications)
- Entity resolution + database writes

## Summary

**Purpose:** Synchronous upload orchestration with async processing

**Inputs:**
- JWT token (authentication)
- Files array (multipart/form-data)

**Outputs:**
- 202 Accepted (immediate)
- Submission ID + Document IDs

**Side Effects:**
- Creates submission record
- Creates document records
- Uploads files to storage
- Triggers async processing

**Guarantees:**
- Atomic submission creation
- Per-file error handling
- Multi-tenant isolation
- Idempotent (via unique constraints)

**Non-Guarantees:**
- Processing completion (async)
- File type validation (future)
- Size limits (future)
- Delivery confirmation (fire-and-forget)

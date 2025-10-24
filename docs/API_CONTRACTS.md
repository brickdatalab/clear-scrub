# Add Company Feature - API Contracts

**Version:** 1.0
**Last Updated:** October 23, 2025
**Status:** Specification (Implementation Pending)

---

## Overview

This document specifies the API contracts for the Add Company feature in ClearScrub. The feature enables users to upload PDF documents (bank statements, loan applications) via the dashboard, with automatic OCR extraction and entity resolution.

### Architecture Summary

```
User uploads PDFs
  ↓
prepare_submission() RPC → Creates submission + document records
  ↓
Frontend uploads files to Supabase Storage
  ↓
enqueue-document-processing() Edge Function → Triggers OCR webhook
  ↓
statement-schema-intake webhook → OCR + entity resolution + company creation
  ↓
Company appears in Complete tab
```

### Key Principles

1. **Async Processing:** Document processing is asynchronous (OCR takes 10-30 seconds per file)
2. **Entity Resolution:** Automatic deduplication via 4-step matching (EIN → normalized_legal_name → aliases → create)
3. **RLS Enforcement:** All endpoints enforce Row Level Security (users only see their org's data)
4. **Status Tracking:** Documents have granular status (`pending` → `processing` → `complete`/`failed`)

---

## API Endpoints

### Table of Contents
1. [RPC: prepare_submission()](#1-rpc-prepare_submission)
2. [Edge Function: enqueue-document-processing](#2-edge-function-enqueue-document-processing)
3. [RPC: get_submission_status()](#3-rpc-get_submission_status)

---

## 1. RPC: prepare_submission()

### Purpose
Atomically create submission + documents records before file upload begins. This reserves database records and returns file paths for Storage uploads.

### Endpoint
```
POST /rest/v1/rpc/prepare_submission
Host: vnhauomvzjucxadrbywg.supabase.co
```

### Authentication
**Required:** JWT token (Authorization header)

### Request

#### Headers
```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

#### Body Schema
```typescript
interface PrepareSubmissionRequest {
  p_files: Array<{
    name: string      // File name (e.g., "statement.pdf")
    size: number      // File size in bytes
    type: string      // MIME type (e.g., "application/pdf")
  }>
}
```

#### Example Request
```json
POST /rest/v1/rpc/prepare_submission
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "p_files": [
    {
      "name": "statement_january_2025.pdf",
      "size": 102400,
      "type": "application/pdf"
    },
    {
      "name": "loan_application.pdf",
      "size": 51200,
      "type": "application/pdf"
    }
  ]
}
```

### Response

#### Success (200 OK)
```typescript
interface PrepareSubmissionResponse {
  submission_id: string   // UUID of created submission
  org_id: string          // UUID of user's organization (inherited from JWT)
  file_maps: Array<{
    doc_id: string        // UUID of created document record
    file_name: string     // Original file name
    file_path: string     // Storage path for upload (format: org_id/submission_id/doc_id.pdf)
    file_size: number     // File size in bytes
  }>
  created_at: string      // ISO 8601 timestamp
}
```

#### Example Response
```json
{
  "submission_id": "550e8400-e29b-41d4-a716-446655440000",
  "org_id": "123e4567-e89b-12d3-a456-426614174000",
  "file_maps": [
    {
      "doc_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "file_name": "statement_january_2025.pdf",
      "file_path": "123e4567-e89b-12d3-a456-426614174000/550e8400-e29b-41d4-a716-446655440000/6ba7b810-9dad-11d1-80b4-00c04fd430c8.pdf",
      "file_size": 102400
    },
    {
      "doc_id": "6ba7b811-9dad-11d1-80b4-00c04fd430c9",
      "file_name": "loan_application.pdf",
      "file_path": "123e4567-e89b-12d3-a456-426614174000/550e8400-e29b-41d4-a716-446655440000/6ba7b811-9dad-11d1-80b4-00c04fd430c9.pdf",
      "file_size": 51200
    }
  ],
  "created_at": "2025-10-23T14:30:00.000Z"
}
```

### Error Responses

#### 401 Unauthorized
```json
{
  "error": "JWT token missing or invalid",
  "code": "UNAUTHORIZED"
}
```
**Cause:** Missing `Authorization` header or invalid JWT token

#### 400 Bad Request
```json
{
  "error": "Invalid file format or empty array",
  "code": "INVALID_INPUT"
}
```
**Causes:**
- `p_files` is empty array
- File `type` is not `application/pdf`
- Missing required fields (`name`, `size`, `type`)

#### 403 Forbidden
```json
{
  "error": "User not authorized to create submissions",
  "code": "FORBIDDEN"
}
```
**Cause:** RLS policy denied access (user's profile missing `org_id`)

#### 500 Internal Server Error
```json
{
  "error": "Database error: {details}",
  "code": "INTERNAL_ERROR"
}
```
**Cause:** Database constraint violation or connection error

### Usage Flow

```typescript
// Frontend: src/services/api.ts
export async function prepareSubmission(files: File[]): Promise<PrepareSubmissionResponse> {
  const { data, error } = await supabase.rpc('prepare_submission', {
    p_files: files.map(f => ({
      name: f.name,
      size: f.size,
      type: f.type
    }))
  })

  if (error) throw error
  return data
}

// Frontend: src/pages/UploadDocuments.tsx
const handleUpload = async (files: File[]) => {
  // Step 1: Prepare submission (reserve database records)
  const { submission_id, file_maps } = await prepareSubmission(files)

  // Step 2: Upload files to Storage using returned paths
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const fileMap = file_maps[i]

    const { error: uploadError } = await supabase.storage
      .from('incoming-documents')
      .upload(fileMap.file_path, file)

    if (uploadError) throw uploadError
  }

  // Step 3: Enqueue each document for processing
  for (const fileMap of file_maps) {
    await enqueueDocumentProcessing(fileMap.doc_id)
  }
}
```

### Database Side Effects

#### Tables Modified
1. **submissions** - One row inserted
   ```sql
   INSERT INTO submissions (id, org_id, status, created_at)
   VALUES (
     gen_random_uuid(),
     {user_org_id},
     'pending',
     NOW()
   )
   ```

2. **documents** - N rows inserted (one per file)
   ```sql
   INSERT INTO documents (
     id, submission_id, file_name, file_path, file_size, file_type,
     status, created_at
   )
   VALUES (
     gen_random_uuid(),
     {submission_id},
     {file_name},
     '{org_id}/{submission_id}/{doc_id}.pdf',
     {file_size},
     {file_type},
     'pending',
     NOW()
   )
   ```

### Idempotency
**NOT idempotent:** Each call creates a new submission + documents.
**Rationale:** Users may upload multiple batches, each should create separate submission.

### Security Considerations

1. **RLS Enforcement:** Function uses `auth.uid()` to get user's `org_id` from profiles table
2. **File Path Security:** Paths include `org_id` to prevent cross-org access
3. **Storage Bucket Policy:** `incoming-documents` bucket has RLS policy matching `org_id` prefix

---

## 2. Edge Function: enqueue-document-processing

### Purpose
Mark document as processing and trigger OCR webhook. This function is the bridge between frontend upload and backend OCR processing.

### Endpoint
```
POST /functions/v1/enqueue-document-processing
Host: vnhauomvzjucxadrbywg.supabase.co
```

### Authentication
**Required:** JWT token (Authorization header)

### Request

#### Headers
```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

#### Body Schema
```typescript
interface EnqueueDocumentRequest {
  doc_id: string  // UUID of document record to process
}
```

#### Example Request
```json
POST /functions/v1/enqueue-document-processing
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "doc_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
}
```

### Response

#### Success (202 Accepted)
```typescript
interface EnqueueDocumentResponse {
  status: "accepted"
  doc_id: string
  message: string
}
```

#### Example Response
```json
{
  "status": "accepted",
  "doc_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "message": "Document queued for processing"
}
```

**202 Accepted:** Indicates async processing started successfully. The actual OCR processing happens asynchronously via webhook.

### CORS Headers
```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

### Error Responses

#### 401 Unauthorized
```json
{
  "error": "JWT token missing or invalid",
  "code": "UNAUTHORIZED"
}
```

#### 404 Not Found
```json
{
  "error": "Document not found or access denied",
  "code": "NOT_FOUND"
}
```
**Causes:**
- `doc_id` doesn't exist
- Document belongs to different org (RLS blocked access)

#### 400 Bad Request
```json
{
  "error": "Missing required field: doc_id",
  "code": "INVALID_INPUT"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Failed to call OCR webhook: {details}",
  "code": "WEBHOOK_FAILED"
}
```
**Cause:** Webhook endpoint unreachable or returned error

### Internal Behavior

```typescript
// Pseudocode for enqueue-document-processing Edge Function

export default async function handler(req: Request) {
  // 1. Validate JWT token
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const { user, error } = await supabase.auth.getUser(token)
  if (error) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Parse request body
  const { doc_id } = await req.json()
  if (!doc_id) return Response.json({ error: 'Missing doc_id' }, { status: 400 })

  // 3. Query document (RLS enforces org_id match)
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('*, submission:submissions(org_id)')
    .eq('id', doc_id)
    .single()

  if (docError || !doc) {
    return Response.json({ error: 'Document not found' }, { status: 404 })
  }

  // 4. Update document status to 'processing'
  await supabase
    .from('documents')
    .update({
      status: 'processing',
      processing_started_at: new Date().toISOString()
    })
    .eq('id', doc_id)

  // 5. Call statement-schema-intake webhook (fire-and-forget)
  const webhookUrl = 'https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/statement-schema-intake'

  fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': Deno.env.get('WEBHOOK_SECRET')
    },
    body: JSON.stringify({
      file_path: doc.file_path,
      submission_id: doc.submission_id,
      org_id: doc.submission.org_id,
      doc_id: doc.id
    })
  }).catch(err => console.error('Webhook call failed:', err))

  // 6. Return 202 (don't wait for webhook)
  return Response.json({
    status: 'accepted',
    doc_id,
    message: 'Document queued for processing'
  }, { status: 202 })
}
```

### Webhook Call Details

When enqueue-document-processing calls statement-schema-intake:

```http
POST /functions/v1/statement-schema-intake
Host: vnhauomvzjucxadrbywg.supabase.co
Content-Type: application/json
X-Webhook-Secret: clearscrub_webhook_2025_xyz123

{
  "file_path": "123e4567-e89b-12d3-a456-426614174000/550e8400-e29b-41d4-a716-446655440000/6ba7b810-9dad-11d1-80b4-00c04fd430c8.pdf",
  "submission_id": "550e8400-e29b-41d4-a716-446655440000",
  "org_id": "123e4567-e89b-12d3-a456-426614174000",
  "doc_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
}
```

**Webhook Authentication:** Uses `X-Webhook-Secret` header (NOT JWT).
**Why:** External OCR service doesn't have user session.
**Webhook Responsibilities:**
1. Download PDF from Storage
2. Perform OCR extraction (LlamaIndex + Mistral)
3. Call entity resolution RPC
4. Insert statements and transactions
5. Update document status to `complete` or `failed`

### Database Side Effects

#### Tables Modified
1. **documents** - Status updated
   ```sql
   UPDATE documents
   SET status = 'processing',
       processing_started_at = NOW(),
       updated_at = NOW()
   WHERE id = {doc_id}
   ```

### Idempotency
**Partially idempotent:** Multiple calls update `processing_started_at` timestamp but don't re-trigger webhook (webhook handles deduplication).

### Security Considerations

1. **RLS Enforcement:** Query uses JWT context, only returns documents matching user's `org_id`
2. **Webhook Secret:** Stored in environment variable, NOT exposed to frontend
3. **Fire-and-Forget:** Function doesn't wait for webhook response (prevents timeout)

### Usage Flow

```typescript
// Frontend: src/services/api.ts
export async function enqueueDocumentProcessing(doc_id: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('enqueue-document-processing', {
    body: { doc_id }
  })

  if (error) throw error
  // Don't wait for completion - processing is async
}

// Frontend: src/pages/UploadDocuments.tsx
const handleUpload = async (files: File[]) => {
  const { submission_id, file_maps } = await prepareSubmission(files)

  // Upload files to Storage
  for (let i = 0; i < files.length; i++) {
    await supabase.storage
      .from('incoming-documents')
      .upload(file_maps[i].file_path, files[i])
  }

  // Enqueue processing (fire-and-forget)
  for (const fileMap of file_maps) {
    await enqueueDocumentProcessing(fileMap.doc_id)
  }

  // Redirect to Processing tab
  navigate('/companies?tab=processing')
}
```

---

## 3. RPC: get_submission_status()

### Purpose
Polling fallback to check submission + document statuses. Used when real-time subscriptions are not available or as debugging tool.

### Endpoint
```
POST /rest/v1/rpc/get_submission_status
Host: vnhauomvzjucxadrbywg.supabase.co
```

### Authentication
**Required:** JWT token (Authorization header)

### Request

#### Headers
```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

#### Body Schema
```typescript
interface GetSubmissionStatusRequest {
  p_submission_id: string  // UUID of submission
}
```

#### Example Request
```json
POST /rest/v1/rpc/get_submission_status
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "p_submission_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Response

#### Success (200 OK)
```typescript
interface GetSubmissionStatusResponse {
  submission_id: string
  org_id: string
  status: "pending" | "processing" | "complete" | "failed"
  documents: Array<{
    id: string
    file_name: string
    status: "pending" | "processing" | "complete" | "failed"
    error_text: string | null
    processing_started_at: string | null   // ISO 8601 timestamp
    processing_completed_at: string | null // ISO 8601 timestamp
    created_at: string                     // ISO 8601 timestamp
  }>
  created_at: string  // ISO 8601 timestamp
}
```

#### Example Response
```json
{
  "submission_id": "550e8400-e29b-41d4-a716-446655440000",
  "org_id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "processing",
  "documents": [
    {
      "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "file_name": "statement_january_2025.pdf",
      "status": "processing",
      "error_text": null,
      "processing_started_at": "2025-10-23T14:30:05.000Z",
      "processing_completed_at": null,
      "created_at": "2025-10-23T14:30:00.000Z"
    },
    {
      "id": "6ba7b811-9dad-11d1-80b4-00c04fd430c9",
      "file_name": "loan_application.pdf",
      "status": "complete",
      "error_text": null,
      "processing_started_at": "2025-10-23T14:30:05.000Z",
      "processing_completed_at": "2025-10-23T14:30:35.000Z",
      "created_at": "2025-10-23T14:30:00.000Z"
    }
  ],
  "created_at": "2025-10-23T14:30:00.000Z"
}
```

### Error Responses

#### 401 Unauthorized
```json
{
  "error": "JWT token missing or invalid",
  "code": "UNAUTHORIZED"
}
```

#### 404 Not Found
```json
{
  "error": "Submission not found or access denied",
  "code": "NOT_FOUND"
}
```
**Causes:**
- `submission_id` doesn't exist
- Submission belongs to different org (RLS blocked access)

#### 500 Internal Server Error
```json
{
  "error": "Database error: {details}",
  "code": "INTERNAL_ERROR"
}
```

### Submission Status Calculation

The submission `status` is derived from document statuses:

```typescript
function calculateSubmissionStatus(documents: Document[]): SubmissionStatus {
  if (documents.every(d => d.status === 'complete')) return 'complete'
  if (documents.every(d => d.status === 'failed')) return 'failed'
  if (documents.some(d => d.status === 'processing')) return 'processing'
  return 'pending'
}
```

**Status Logic:**
- `complete`: All documents complete
- `failed`: All documents failed
- `processing`: At least one document processing
- `pending`: All documents pending

### Usage Flow

```typescript
// Frontend: src/services/api.ts
export async function getSubmissionStatus(submission_id: string): Promise<GetSubmissionStatusResponse> {
  const { data, error } = await supabase.rpc('get_submission_status', {
    p_submission_id: submission_id
  })

  if (error) throw error
  return data
}

// Frontend: src/pages/UploadDocuments.tsx (polling pattern)
const pollSubmissionStatus = async (submission_id: string) => {
  const interval = setInterval(async () => {
    const status = await getSubmissionStatus(submission_id)

    if (status.status === 'complete') {
      clearInterval(interval)
      navigate('/companies?tab=complete')
    } else if (status.status === 'failed') {
      clearInterval(interval)
      showErrorNotification('All documents failed to process')
    }

    // Update UI with current status
    setDocuments(status.documents)
  }, 5000) // Poll every 5 seconds

  return () => clearInterval(interval)
}
```

### Idempotency
**Idempotent:** Read-only operation, safe to call multiple times.

### Security Considerations

1. **RLS Enforcement:** Function filters by user's `org_id`
2. **Read-Only:** No side effects, safe for polling

---

## Request/Response Patterns

### Authentication

All endpoints require JWT authentication:

```http
Authorization: Bearer {access_token}
```

**How to Obtain Token:**
```typescript
// Frontend: src/hooks/useAuth.tsx
const { data: { session } } = await supabase.auth.getSession()
const token = session?.access_token
```

**Token Expiry:** 1 hour (auto-refreshed by Supabase client)

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Synchronous success (RPC functions) |
| 202 | Accepted | Async processing started (enqueue-document-processing) |
| 400 | Bad Request | Invalid input (missing fields, wrong format) |
| 401 | Unauthorized | Missing/invalid JWT token |
| 403 | Forbidden | RLS policy blocked request (user doesn't own resource) |
| 404 | Not Found | Resource doesn't exist or access denied |
| 500 | Internal Server Error | Server error (database, webhook failure) |

### Error Response Format

All errors follow consistent format:

```typescript
interface ErrorResponse {
  error: string   // Human-readable error message
  code: string    // Machine-readable error code (UPPERCASE_WITH_UNDERSCORES)
}
```

**Example:**
```json
{
  "error": "Document not found or access denied",
  "code": "NOT_FOUND"
}
```

### Timestamps

All timestamps use **ISO 8601 format** with UTC timezone:

```
2025-10-23T14:30:00.000Z
```

**Parsing in Frontend:**
```typescript
const date = new Date(timestamp) // Native JavaScript Date
const formatted = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short'
}).format(date) // "Oct 23, 2025, 2:30 PM"
```

---

## Document Status Lifecycle

### State Diagram

```
┌─────────┐
│ pending │ (Document created, file not yet uploaded)
└────┬────┘
     │
     │ enqueue-document-processing() called
     ▼
┌────────────┐
│ processing │ (OCR extraction in progress)
└─────┬──────┘
      │
      ├─────────────────────────────────────┐
      │                                     │
      │ OCR success                         │ OCR failed
      ▼                                     ▼
┌──────────┐                         ┌────────┐
│ complete │                         │ failed │
└──────────┘                         └────────┘
(Company created,                    (error_text populated,
statements inserted,                 no company created,
visible in Complete tab)             visible in Failed tab)
```

### Status Definitions

| Status | Definition | User-Visible State | Next Actions |
|--------|------------|-------------------|--------------|
| `pending` | Document record created, file uploaded to Storage, not yet queued for OCR | "Pending..." (gray badge) | Call `enqueue-document-processing()` |
| `processing` | OCR extraction in progress, webhook called | "Processing..." (blue badge with spinner) | Wait for webhook completion |
| `complete` | OCR successful, entity resolved, company created | Document linked to company, visible in Complete tab | View company details |
| `failed` | OCR failed or entity resolution error | "Failed" (red badge), error message shown | Retry or manual intervention |

### Query Patterns

#### Processing Tab: Show Files Being Processed
```sql
SELECT * FROM documents
WHERE status IN ('pending', 'processing')
AND submission_id IN (
  SELECT id FROM submissions WHERE org_id = {user_org_id}
)
ORDER BY created_at DESC
```

#### Failed Tab: Show Files with Errors
```sql
SELECT * FROM documents
WHERE status = 'failed'
AND submission_id IN (
  SELECT id FROM submissions WHERE org_id = {user_org_id}
)
ORDER BY created_at DESC
```

#### Complete Tab: Show Finished Companies
```sql
-- NOT documents! Show companies created by completed documents
SELECT * FROM companies
WHERE org_id = {user_org_id}
ORDER BY created_at DESC
```

**Key Insight:** Complete tab shows companies (entities), not documents (files). This is intentional (see ADR-002).

---

## Real-Time Updates (Future Enhancement)

### Supabase Realtime Subscription

Instead of polling with `get_submission_status()`, use real-time subscriptions:

```typescript
// Frontend: src/pages/Companies.tsx (Processing Tab)
useEffect(() => {
  const subscription = supabase
    .channel('documents_status')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'documents',
      filter: `status=eq.complete`
    }, (payload) => {
      // Document completed, refresh Complete tab
      queryClient.invalidateQueries(['companies'])

      // Show success notification
      toast.success(`${payload.new.file_name} processed successfully`)
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'documents',
      filter: `status=eq.failed`
    }, (payload) => {
      // Document failed, show error
      toast.error(`${payload.new.file_name} failed: ${payload.new.error_text}`)
    })
    .subscribe()

  return () => subscription.unsubscribe()
}, [])
```

**Benefits:**
- No polling overhead
- Instant UI updates when processing completes
- Better user experience (immediate feedback)

**Requires:** Supabase Realtime enabled on `documents` table

---

## Security & RLS Policies

### Row Level Security Overview

All database tables have RLS enabled. Users can only access data where `org_id` matches their profile's `org_id`.

### Policy Examples

#### submissions Table
```sql
CREATE POLICY "Users see own org submissions"
ON submissions FOR SELECT
USING (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users insert own org submissions"
ON submissions FOR INSERT
WITH CHECK (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
);
```

#### documents Table
```sql
CREATE POLICY "Users see own org documents"
ON documents FOR SELECT
USING (
  submission_id IN (
    SELECT id FROM submissions WHERE org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users update own org documents"
ON documents FOR UPDATE
USING (
  submission_id IN (
    SELECT id FROM submissions WHERE org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  )
);
```

### Service Role Bypass

The **enqueue-document-processing** Edge Function uses **service_role_key** internally to call statement-schema-intake webhook. This bypasses RLS for admin operations.

**Why:** Webhook needs to update document status without user session context.

**Security:** Service role key stored in environment variable, NEVER exposed to frontend.

---

## Performance Considerations

### File Upload Performance

**Sequential vs Parallel Uploads:**

```typescript
// ❌ SLOW: Sequential uploads
for (const file of files) {
  await uploadFile(file)
}

// ✅ FAST: Parallel uploads
await Promise.all(files.map(file => uploadFile(file)))
```

**Recommended:** Upload files in parallel (max 5 concurrent uploads).

### Processing Performance

**Expected Timings:**
- `prepare_submission()`: <100ms (database insert)
- File upload to Storage: ~1-5 seconds per file (depends on size)
- `enqueue-document-processing()`: <200ms (fire-and-forget)
- OCR processing: 10-30 seconds per file (async webhook)

**Total Time:** ~15-35 seconds from upload to company appearing in Complete tab

### Polling vs Real-Time

| Approach | Latency | Server Load | User Experience |
|----------|---------|-------------|-----------------|
| Polling (5s interval) | 0-5 seconds | High (repeated queries) | Good (eventual update) |
| Real-time subscriptions | <1 second | Low (push-based) | Excellent (instant) |

**Recommendation:** Implement real-time subscriptions for production.

---

## Testing

### Unit Tests (RPC Functions)

```typescript
describe('prepare_submission()', () => {
  test('creates submission and documents', async () => {
    const result = await supabase.rpc('prepare_submission', {
      p_files: [{ name: 'test.pdf', size: 1024, type: 'application/pdf' }]
    })

    expect(result.data.submission_id).toBeDefined()
    expect(result.data.file_maps).toHaveLength(1)
  })

  test('enforces RLS (different org cannot access)', async () => {
    const { error } = await supabase
      .from('submissions')
      .select()
      .eq('id', 'different-org-submission-id')

    expect(error).toBeDefined() // RLS should block
  })
})
```

### Integration Tests (Edge Functions)

```bash
# Test enqueue-document-processing
curl -X POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/enqueue-document-processing \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"doc_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"}'

# Expected: 202 Accepted
# Verify document status updated in database
```

### End-to-End Tests (Manual)

1. **Happy Path:**
   - Upload 2 PDF files
   - Verify `prepare_submission()` returns correct file paths
   - Verify files uploaded to Storage
   - Verify `enqueue-document-processing()` called successfully
   - Wait 30 seconds
   - Verify documents status = 'complete'
   - Verify company appears in Complete tab

2. **Error Handling:**
   - Upload corrupted PDF
   - Verify document status = 'failed'
   - Verify error_text populated
   - Verify no company created

3. **Concurrent Uploads:**
   - Upload 3 files for same company simultaneously
   - Verify only ONE company created (entity resolution)
   - Verify company has 3 statements

---

## Migration Checklist

When implementing this API:

- [ ] Create database migration with submissions and documents tables
- [ ] Add RLS policies on submissions and documents
- [ ] Implement `prepare_submission()` RPC function
- [ ] Implement `get_submission_status()` RPC function
- [ ] Create enqueue-document-processing Edge Function
- [ ] Configure environment variables (WEBHOOK_SECRET)
- [ ] Configure Storage bucket `incoming-documents` with RLS
- [ ] Update statement-schema-intake webhook to accept doc_id parameter
- [ ] Update statement-schema-intake to update document status after completion
- [ ] Add frontend API service functions (prepareSubmission, enqueueDocumentProcessing, getSubmissionStatus)
- [ ] Update Companies page with Processing tab
- [ ] Update Companies page with Failed tab
- [ ] Add file upload UI component
- [ ] Add real-time subscriptions (optional but recommended)
- [ ] Write unit tests for RPC functions
- [ ] Write integration tests for Edge Functions
- [ ] Document deployment procedure

---

## References

- **ADR-001:** Job Model Using Submissions Table (explains why no separate jobs table)
- **ADR-002:** Processing Tab Derived From Documents (explains why no placeholder companies)
- **ADR-003:** Company Creation During OCR (explains when companies are created)
- **Database Migration:** `/supabase/database/migrations/20251023_add_company_feature_schema.sql`
- **Entity Resolution:** `/supabase/functions/statement-schema-intake/index.ts` lines 77-151
- **Unified Entity Resolution Fix:** `/docs/ENTITY_RESOLUTION_FIX.md`

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Oct 23, 2025 | Initial specification |

---

## Contact

For questions or clarifications about this API specification, contact:

- **Maintainer:** Vincent (vincent@clearscrub.io)
- **Documentation Location:** `/Users/vitolo/Desktop/clearscrub_main/docs/API_CONTRACTS.md`

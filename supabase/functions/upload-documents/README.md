# upload-documents Edge Function

**Version:** 1.0
**Created:** 2025-10-21
**Status:** Ready for deployment

## Purpose

Orchestrates the file upload → processing pipeline for manual document uploads from the ClearScrub dashboard.

## Architecture

```
User uploads PDFs via dashboard
  ↓
POST /functions/v1/upload-documents (multipart/form-data)
  ↓
[JWT Validation] Extract org_id from user profile
  ↓
[Create Submission] Insert batch record in submissions table
  ↓
For each file:
  - Upload to Supabase Storage (incoming-documents bucket)
  - Create document record (status: 'uploaded')
  - Fire webhook to document-metadata function
  ↓
Return 202 Accepted with submission/document IDs
  ↓
[ASYNC] document-metadata processes files
  ↓
[ASYNC] Structured data written to database
  ↓
[ASYNC] Dashboard polls for completion
```

## Authentication

**Method:** JWT (Authorization: Bearer {token})

**Why JWT?**
- User-initiated uploads require user context
- Enforces RLS for multi-tenant isolation
- Links uploads to specific user/org

**How to get token:**
```typescript
// In dashboard after login
const { data: { session } } = await supabase.auth.getSession();
const token = session.access_token;
```

## Request Specification

**Endpoint:** `POST /functions/v1/upload-documents`

**Headers:**
```
Authorization: Bearer {jwt_token}
Content-Type: multipart/form-data
```

**Body (multipart/form-data):**
```
files: File[]  // Multiple files with key 'files'
```

**Example using fetch:**
```typescript
const formData = new FormData();
formData.append('files', file1);
formData.append('files', file2);
formData.append('files', file3);

const response = await fetch(
  'https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  }
);

const result = await response.json();
```

**Example using curl:**
```bash
TOKEN="your-jwt-token-here"

curl -X POST \
  https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@statement1.pdf" \
  -F "files=@statement2.pdf" \
  -F "files=@application.pdf"
```

## Response Specification

**Success (202 Accepted):**
```json
{
  "success": true,
  "submissions": [
    {
      "id": "uuid-submission-123",
      "documents": [
        {
          "id": "uuid-doc-456",
          "filename": "statement1.pdf",
          "status": "uploaded",
          "processing_initiated": true
        },
        {
          "id": "uuid-doc-789",
          "filename": "statement2.pdf",
          "status": "uploaded",
          "processing_initiated": true
        },
        {
          "id": "",
          "filename": "corrupted.pdf",
          "status": "failed",
          "processing_initiated": false,
          "error": "Invalid file format"
        }
      ]
    }
  ],
  "summary": {
    "total_files": 3,
    "successful": 2,
    "failed": 1
  }
}
```

**Error Responses:**

**401 Unauthorized:**
```json
{
  "error": {
    "code": "unauthorized",
    "message": "Invalid or expired JWT token",
    "details": {}
  }
}
```

**400 Bad Request:**
```json
{
  "error": {
    "code": "no_files",
    "message": "No files provided in request",
    "details": {}
  }
}
```

**500 Internal Server Error:**
```json
{
  "error": {
    "code": "submission_failed",
    "message": "Failed to create submission record",
    "details": {}
  }
}
```

## Database Operations

**Tables Modified:**

1. **submissions** - Batch tracking
   ```sql
   INSERT INTO submissions (
     org_id,
     submission_date,
     file_count,
     ingestion_method,
     metadata
   ) VALUES (?, ?, ?, 'manual_upload', ?);
   ```

2. **documents** - Individual file records
   ```sql
   INSERT INTO documents (
     submission_id,
     file_path,
     file_name,
     file_size,
     mime_type,
     processing_status,
     metadata
   ) VALUES (?, ?, ?, ?, ?, 'uploaded', ?);
   ```

**Storage Operations:**

- **Bucket:** `incoming-documents`
- **Path Pattern:** `{org_id}/{submission_id}/{timestamp}_{filename}`
- **Example:** `abc-123/def-456/1698765432000_statement.pdf`

## Processing Flow

**1. Upload Phase (This Function):**
- User submits files via dashboard
- Function validates JWT, extracts org_id
- Creates submission record
- Uploads files to storage
- Creates document records
- Invokes document-metadata function
- Returns 202 immediately

**2. Processing Phase (document-metadata):**
- Extracts PDF metadata (page count, processing method)
- Calls external Flow webhook (LlamaIndex + Mistral OCR)
- Updates document status: uploaded → processing → completed/failed

**3. Extraction Phase (n8n workflow):**
- Flow webhook processes PDF
- Generates structured JSON (bank statement or application)
- Sends to statement-schema-intake or application-schema-intake

**4. Database Write Phase (intake webhooks):**
- Entity resolution (find or create company)
- Writes to companies, accounts, statements, applications tables
- Refreshes materialized views
- Data now visible in dashboard

## Error Handling

**Partial Success Strategy:**
- If ANY file succeeds, return 202
- Include failures in response with error details
- Don't block entire batch due to one bad file

**File-Level Errors:**
- Storage upload failure → Mark as failed, continue
- Document record creation failure → Mark as failed, continue
- document-metadata invocation failure → Log, continue (async anyway)

**Batch-Level Errors:**
- JWT validation failure → 401, abort entire request
- No files provided → 400, abort
- Submission record creation failure → 500, abort

## Deployment

**Deploy function:**
```bash
cd /Users/vitolo/Desktop/clearscrub_main/supabase

supabase functions deploy upload-documents --project-ref vnhauomvzjucxadrbywg
```

**Verify deployment:**
```bash
# Should return 401 (auth required) - proves function is live
curl -i https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents
```

**View logs:**
```bash
# Live tail
supabase functions logs upload-documents --project-ref vnhauomvzjucxadrbywg

# Last hour
supabase functions logs upload-documents --project-ref vnhauomvzjucxadrbywg --since 1h
```

## Testing

**Test with real JWT:**
```bash
# 1. Get JWT from dashboard (browser console after login)
SESSION=$(supabase auth getSession)
TOKEN=$(echo $SESSION | jq -r '.data.session.access_token')

# 2. Upload test files
curl -X POST \
  https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@test-statement.pdf" \
  -F "files=@test-application.pdf"

# 3. Verify in database
psql $DATABASE_URL -c "SELECT * FROM submissions ORDER BY created_at DESC LIMIT 1;"
psql $DATABASE_URL -c "SELECT * FROM documents WHERE submission_id = 'uuid-from-above';"

# 4. Check storage
# Supabase Dashboard → Storage → incoming-documents → verify files uploaded
```

**Test CORS:**
```bash
curl -X OPTIONS \
  https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, content-type" \
  -i

# Should return 204 with CORS headers
```

**Test error cases:**
```bash
# No JWT
curl -X POST \
  https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents \
  -F "files=@test.pdf"
# Expected: 401 Unauthorized

# No files
curl -X POST \
  https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents \
  -H "Authorization: Bearer $TOKEN"
# Expected: 400 Bad Request

# Wrong method
curl -X GET \
  https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents \
  -H "Authorization: Bearer $TOKEN"
# Expected: 405 Method Not Allowed
```

## Security Considerations

**JWT Validation:**
- JWT extracted from Authorization header
- Validated via `supabaseJWT.auth.getUser()`
- org_id extracted from profiles table (ensures RLS)

**Database Access:**
- Service role key used for writes (bypass RLS for admin operations)
- org_id enforced at submission creation (user can only upload to their org)
- RLS policies prevent cross-org data access

**Storage Isolation:**
- Files stored under org_id prefix: `{org_id}/...`
- Prevents cross-org file access
- Storage RLS policies enforce bucket-level security

**Input Validation:**
- Filename sanitization: `/[^a-zA-Z0-9._-]/g` → `_`
- Prevents path traversal attacks
- No file type restrictions (allows all types for flexibility)

## Performance Considerations

**File Size:**
- No explicit limit enforced (Edge Function timeout: 150 seconds)
- Recommended max: 50MB per file
- Future: Add size validation if needed

**Batch Size:**
- No limit on number of files per request
- Consider timeout if uploading 100+ files
- Future: Implement batch splitting for large uploads

**Async Processing:**
- document-metadata invoked fire-and-forget (no await)
- Prevents blocking on external webhook calls
- Dashboard polls for completion via document status

**Storage Performance:**
- Direct upload to Supabase Storage (no local buffering)
- Streaming prevents memory exhaustion
- Unique timestamp prefix prevents filename collisions

## Future Enhancements

**1. File Type Validation**
```typescript
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
if (!ALLOWED_TYPES.includes(file.type)) {
  throw { code: 'unsupported_file_type', status: 415 };
}
```

**2. File Size Limits**
```typescript
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
if (file.size > MAX_FILE_SIZE) {
  throw { code: 'file_too_large', status: 413 };
}
```

**3. Duplicate Detection**
```typescript
const fileHash = await computeSHA256(await file.arrayBuffer());
// Check if hash exists in documents table
```

**4. Progress Reporting**
```typescript
// Use WebSocket or Server-Sent Events for real-time progress
// Push updates as each file completes
```

**5. Retry Logic**
```typescript
// Retry failed document-metadata invocations
// Implement exponential backoff
```

## Troubleshooting

**Issue:** 401 Unauthorized even with valid JWT

**Solution:**
- Verify JWT not expired (1 hour default)
- Check user has profile record with org_id
- Test: `SELECT * FROM profiles WHERE id = auth.uid();`

---

**Issue:** Files uploaded but processing never starts

**Solution:**
- Check document-metadata function logs
- Verify storage trigger enabled (if relying on trigger)
- Manual invocation may have failed silently
- Test: Call document-metadata directly with test payload

---

**Issue:** Partial success - some files fail

**Solution:**
- Check file size/format
- Verify storage bucket permissions
- Check Edge Function logs for specific errors
- Retry failed files individually

---

**Issue:** Submission created but no documents

**Solution:**
- Database transaction may have failed
- Check Edge Function logs for document insert errors
- Verify documents table RLS policies allow service_role writes

## Related Documentation

- **Database Schema:** `/Users/vitolo/Desktop/clearscrub_main/supabase/database/CLAUDE.md`
- **User Flow:** Main CLAUDE.md Section 1
- **document-metadata function:** `/Users/vitolo/Desktop/clearscrub_main/supabase/database/supabase/functions/document-metadata/`
- **Intake Webhooks:** statement-schema-intake, application-schema-intake

## Change Log

**v1.0 (2025-10-21):**
- Initial implementation
- JWT authentication
- Multi-file upload support
- Fire-and-forget document-metadata invocation
- Partial success handling
- Comprehensive error handling

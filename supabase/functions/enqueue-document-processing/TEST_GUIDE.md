# enqueue-document-processing Function - Test Guide

## Function Overview

**Purpose:** Queue document processing by calling statement-schema-intake webhook
**Auth:** JWT token required (enforces RLS)
**Method:** POST
**URL:** `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/enqueue-document-processing`

## Test Results

### ✅ Test 1: OPTIONS Preflight (CORS)

**Command:**
```bash
curl -X OPTIONS https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/enqueue-document-processing -i
```

**Expected:** 200 OK with CORS headers
**Result:** ✅ PASS

**Headers Verified:**
- `access-control-allow-origin: *`
- `access-control-allow-methods: POST, OPTIONS`
- `access-control-allow-headers: Content-Type, Authorization`

---

### ✅ Test 2: Missing Authorization Header

**Command:**
```bash
curl -X POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/enqueue-document-processing \
  -H "Content-Type: application/json" \
  -d '{"doc_id":"test-doc-123"}'
```

**Expected:** 401 Unauthorized
**Result:** ✅ PASS

**Response:**
```json
{
  "code": 401,
  "message": "Missing authorization header"
}
```

---

### ✅ Test 3: Invalid JWT Token

**Command:**
```bash
curl -X POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/enqueue-document-processing \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid-token-for-testing" \
  -d '{"doc_id":"test-doc-123"}'
```

**Expected:** 401 Invalid JWT
**Result:** ✅ PASS

**Response:**
```json
{
  "code": 401,
  "message": "Invalid JWT"
}
```

---

### ⏳ Test 4: Valid JWT with Missing doc_id

**Command:**
```bash
curl -X POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/enqueue-document-processing \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {VALID_JWT_TOKEN}" \
  -d '{}'
```

**Expected:** 400 Bad Request with "Missing doc_id"
**Status:** Pending valid JWT token

---

### ⏳ Test 5: Valid JWT with Non-Existent doc_id

**Command:**
```bash
curl -X POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/enqueue-document-processing \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {VALID_JWT_TOKEN}" \
  -d '{"doc_id":"non-existent-doc-id"}'
```

**Expected:** 404 Not Found with "Document not found or access denied"
**Status:** Pending valid JWT token

---

### ⏳ Test 6: Valid JWT with Real doc_id (Happy Path)

**Command:**
```bash
curl -X POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/enqueue-document-processing \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {VALID_JWT_TOKEN}" \
  -d '{"doc_id":"{REAL_DOC_ID}"}'
```

**Expected:** 202 Accepted
**Expected Response:**
```json
{
  "status": "accepted",
  "doc_id": "{REAL_DOC_ID}",
  "message": "Document queued for processing"
}
```

**Status:** Pending valid JWT token and real document

**Verification Steps:**
1. Check documents table: `status` should change to 'processing'
2. Check documents table: `processing_started_at` should be set
3. Check function logs for webhook call
4. Verify statement-schema-intake webhook received request

---

## Getting a Valid JWT Token

### Option 1: From Dashboard (Recommended)

1. Open browser DevTools (F12)
2. Navigate to https://dashboard.clearscrub.io
3. Login with test credentials
4. Go to Application > Local Storage > https://dashboard.clearscrub.io
5. Find `supabase.auth.token` key
6. Copy the `access_token` value (this is your JWT)

### Option 2: Using Supabase Client

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://vnhauomvzjucxadrbywg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' // anon key
)

const { data, error } = await supabase.auth.signInWithPassword({
  email: 'test@example.com',
  password: 'your-password'
})

console.log(data.session.access_token) // This is your JWT
```

### Option 3: Create Test User via SQL

```sql
-- Insert test user (requires service role access)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
VALUES (
  gen_random_uuid(),
  'test@clearscrub.io',
  crypt('TestPassword123!', gen_salt('bf')),
  now()
);
```

---

## Function Deployment Status

**Deployed:** ✅ October 23, 2025
**Project:** vnhauomvzjucxadrbywg
**Region:** us-east-1
**URL:** https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/enqueue-document-processing

**Dashboard:** https://supabase.com/dashboard/project/vnhauomvzjucxadrbywg/functions

---

## Database Schema Verification

**Tables Referenced:**
- `documents` (columns: id, submission_id, file_path, org_id, status, processing_started_at)

**Expected Status Flow:**
1. Initial: `status = 'uploaded'`
2. After enqueue: `status = 'processing'` + `processing_started_at` set
3. After processing: `status = 'completed'` or `status = 'failed'`

---

## Function Behavior Summary

1. **OPTIONS Request:** Returns 200 with CORS headers
2. **POST without Auth:** Returns 401 "Missing authorization header"
3. **POST with Invalid JWT:** Returns 401 "Invalid JWT"
4. **POST with Missing doc_id:** Returns 400 "Missing doc_id"
5. **POST with Non-Existent doc_id:** Returns 404 "Document not found or access denied"
6. **POST with Valid doc_id:**
   - Updates documents.status = 'processing'
   - Sets processing_started_at timestamp
   - Calls statement-schema-intake webhook
   - Returns 202 Accepted

---

## Logs Location

**Supabase Dashboard:**
https://supabase.com/dashboard/project/vnhauomvzjucxadrbywg/functions/enqueue-document-processing/logs

**CLI (from project root):**
```bash
# Note: supabase functions logs command may not support --project-ref
# Use dashboard for real-time logs
```

---

## Next Steps

1. **Get JWT Token:** Use one of the methods above to obtain a valid JWT
2. **Create Test Document:** Upload a PDF via upload-documents function to get a real doc_id
3. **Run Happy Path Test:** Test with valid JWT + real doc_id
4. **Verify Database Updates:** Check documents table after successful call
5. **Verify Webhook Call:** Check statement-schema-intake logs for incoming request

---

## Known Issues / Limitations

1. **Webhook Integration:** statement-schema-intake currently expects parsed JSON, not file_path. May need to:
   - Update statement-schema-intake to handle file_path input
   - Or call a separate OCR service that then calls statement-schema-intake
   - This is an architectural decision pending clarification

2. **Error Handling:** If webhook fails, document status is updated to 'failed' but no retry mechanism exists

3. **Async Processing:** Function returns 202 immediately. Actual processing status must be polled via separate endpoint (not yet implemented)

---

## Test Status Summary

| Test Case | Status | Notes |
|-----------|--------|-------|
| OPTIONS Preflight | ✅ PASS | CORS working |
| Missing Auth Header | ✅ PASS | Returns 401 |
| Invalid JWT | ✅ PASS | Returns 401 |
| Missing doc_id | ⏳ PENDING | Needs JWT token |
| Non-Existent doc_id | ⏳ PENDING | Needs JWT token |
| Happy Path (Valid doc_id) | ⏳ PENDING | Needs JWT + real document |

**Overall Status:** Function deployed and basic security working. Needs JWT token for complete testing.

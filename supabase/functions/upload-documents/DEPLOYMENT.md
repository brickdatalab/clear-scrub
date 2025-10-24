# Deployment Guide: upload-documents

## Pre-Deployment Checklist

- [ ] Code review completed
- [ ] README.md reviewed and accurate
- [ ] Test script exists and is executable
- [ ] Environment variables verified
- [ ] Database schema supports submissions/documents tables
- [ ] incoming-documents storage bucket exists
- [ ] document-metadata function deployed and working

## Deployment Steps

### Step 1: Verify Environment

```bash
# Check Supabase CLI installed
supabase --version

# Check project connection
supabase projects list | grep vnhauomvzjucxadrbywg

# Verify working directory
cd /Users/vitolo/Desktop/clearscrub_main/supabase
pwd
```

### Step 2: Deploy Function

```bash
# Deploy to production
supabase functions deploy upload-documents --project-ref vnhauomvzjucxadrbywg

# Expected output:
# Deploying Function (project-ref: vnhauomvzjucxadrbywg)
# Function upload-documents deployed successfully
```

### Step 3: Verify Deployment

```bash
# Test OPTIONS (CORS preflight)
curl -i -X OPTIONS \
  https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents

# Expected: 204 No Content with CORS headers

# Test authentication (should return 401)
curl -i -X POST \
  https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents

# Expected: 401 Unauthorized
```

### Step 4: Test with Real JWT

**Get JWT token:**
1. Open dashboard: https://clearscrub.com (or your dashboard URL)
2. Login with test account
3. Open browser console (F12)
4. Run:
   ```javascript
   supabase.auth.getSession().then(d => console.log(d.data.session.access_token))
   ```
5. Copy token

**Run test script:**
```bash
export TEST_JWT="your-token-here"
cd /Users/vitolo/Desktop/clearscrub_main/supabase/functions/upload-documents
./test-upload.sh
```

**Expected results:**
- TEST 1 (Upload): 202 Accepted ✓
- TEST 2 (CORS): 204 No Content ✓
- TEST 3 (No Auth): 401 Unauthorized ✓
- TEST 4 (No Files): 400 Bad Request ✓
- TEST 5 (Multiple Files): 202 Accepted ✓
- TEST 6 (Wrong Method): 405 Method Not Allowed ✓

### Step 5: Verify Database Records

```bash
# Check submissions
supabase db query "SELECT * FROM submissions ORDER BY created_at DESC LIMIT 5;" \
  --project-ref vnhauomvzjucxadrbywg

# Check documents
supabase db query "SELECT * FROM documents ORDER BY created_at DESC LIMIT 5;" \
  --project-ref vnhauomvzjucxadrbywg
```

**Expected:**
- Submissions table shows new record with correct org_id
- Documents table shows uploaded files with status='uploaded'
- File paths match pattern: `{org_id}/{submission_id}/{timestamp}_{filename}`

### Step 6: Verify Storage

1. Open Supabase Dashboard: https://supabase.com/dashboard/project/vnhauomvzjucxadrbywg
2. Navigate: Storage → incoming-documents bucket
3. Verify files uploaded to correct paths

### Step 7: Monitor Logs

```bash
# Live tail
supabase functions logs upload-documents --project-ref vnhauomvzjucxadrbywg

# Check for errors
supabase functions logs upload-documents --project-ref vnhauomvzjucxadrbywg --since 1h | grep -i error
```

**Look for:**
- "Processing upload for org_id: ..." (confirms JWT extraction)
- "Received X file(s) for upload" (confirms file parsing)
- "Created submission: uuid-..." (confirms submission record)
- "File processed successfully: ..." (confirms upload complete)

## Post-Deployment Validation

### Functional Tests

**Test 1: Single file upload from dashboard**
- [ ] Upload single PDF via dashboard UI
- [ ] Verify 202 response with submission_id and document_id
- [ ] Check database for submission and document records
- [ ] Verify file exists in storage bucket
- [ ] Confirm document-metadata processing initiated

**Test 2: Multiple files upload**
- [ ] Upload 3 PDFs simultaneously
- [ ] Verify all files get same submission_id
- [ ] Verify 3 separate document records created
- [ ] Check all files in storage

**Test 3: Error handling**
- [ ] Upload with expired JWT → 401
- [ ] Upload with no files → 400
- [ ] Upload with 50MB+ file → Check timeout behavior

**Test 4: Processing pipeline**
- [ ] Upload test bank statement PDF
- [ ] Wait 2-3 minutes for processing
- [ ] Check document status: uploaded → processing → completed
- [ ] Verify structured data appears in statements table
- [ ] Confirm data visible in dashboard

### Performance Tests

**Test 1: Upload speed**
```bash
time curl -X POST \
  https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents \
  -H "Authorization: Bearer $TEST_JWT" \
  -F "files=@test.pdf"

# Expected: < 2 seconds for 1MB file
```

**Test 2: Multiple files**
```bash
# Upload 5 files
time curl -X POST \
  https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents \
  -H "Authorization: Bearer $TEST_JWT" \
  -F "files=@test1.pdf" \
  -F "files=@test2.pdf" \
  -F "files=@test3.pdf" \
  -F "files=@test4.pdf" \
  -F "files=@test5.pdf"

# Expected: < 5 seconds for 5x 1MB files
```

**Test 3: Large file**
```bash
# Create 10MB test file
dd if=/dev/zero of=large.pdf bs=1M count=10

time curl -X POST \
  https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents \
  -H "Authorization: Bearer $TEST_JWT" \
  -F "files=@large.pdf"

# Expected: < 10 seconds
```

### Security Tests

**Test 1: Cross-org isolation**
- [ ] User A uploads file
- [ ] User B (different org) cannot access User A's submission
- [ ] Verify RLS policies enforce isolation

**Test 2: JWT expiration**
- [ ] Get JWT token
- [ ] Wait 1 hour
- [ ] Attempt upload with expired token → 401

**Test 3: Invalid JWT**
- [ ] Use malformed JWT
- [ ] Attempt upload → 401

## Rollback Procedure

If deployment fails or critical bugs discovered:

### Step 1: Identify Issue

```bash
# Check error logs
supabase functions logs upload-documents --project-ref vnhauomvzjucxadrbywg --since 1h

# Check for patterns:
# - "JWT validation failed" → Auth issue
# - "Storage upload failed" → Storage config issue
# - "Database error" → Schema issue
```

### Step 2: Quick Fix (if possible)

```bash
# Fix code locally
vim /Users/vitolo/Desktop/clearscrub_main/supabase/functions/upload-documents/index.ts

# Redeploy
supabase functions deploy upload-documents --project-ref vnhauomvzjucxadrbywg

# Verify fix
./test-upload.sh
```

### Step 3: Rollback (if critical)

**Option A: Disable function**
```bash
# There's no built-in disable command, but you can deploy a stub:
cat > /tmp/stub.ts << 'EOF'
Deno.serve((req) => {
  return new Response(JSON.stringify({
    error: {
      code: 'maintenance',
      message: 'Function temporarily disabled for maintenance'
    }
  }), { status: 503 });
});
EOF

supabase functions deploy upload-documents --project-ref vnhauomvzjucxadrbywg /tmp/stub.ts
```

**Option B: Revert to previous version**
```bash
# If you have Git history
git log --oneline -- supabase/functions/upload-documents/index.ts
git checkout <previous-commit-hash> -- supabase/functions/upload-documents/index.ts
supabase functions deploy upload-documents --project-ref vnhauomvzjucxadrbywg
```

### Step 4: Notify Users

- Update dashboard with maintenance banner
- Send email to affected users if data corruption occurred
- Document root cause in postmortem

## Monitoring Setup

### CloudWatch/Logs

```bash
# Set up log alerts (if using Supabase observability)
# Alert on:
# - Error rate > 5%
# - 500 status codes
# - JWT validation failures
# - Storage upload failures
```

### Health Check

Create a simple health check endpoint:

```typescript
// Add to index.ts
if (req.url.endsWith('/health')) {
  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### Metrics to Track

- **Upload success rate:** `successful / total_files`
- **Average upload time:** Time from request to 202 response
- **Processing completion rate:** `completed / uploaded` documents
- **Error rate by type:** 401, 400, 500 counts
- **Storage usage:** Track bucket size growth

## Documentation Updates

After successful deployment:

- [ ] Update main CLAUDE.md with new function details
- [ ] Add to API documentation
- [ ] Update dashboard integration guide
- [ ] Add to troubleshooting guide

## Support Contacts

**If deployment fails:**
- Backend Team: [contact info]
- DevOps: [contact info]
- Supabase Support: https://supabase.com/dashboard/support

**Escalation path:**
1. Check function logs
2. Review test results
3. Contact backend team
4. Escalate to DevOps if infrastructure issue

## Deployment Sign-Off

**Deployed by:** _______________
**Date:** _______________
**Version:** 1.0
**Git commit:** _______________

**Test Results:**
- [ ] All 6 tests passed
- [ ] Database records verified
- [ ] Storage files verified
- [ ] Logs show no errors
- [ ] Performance within SLA

**Approval:**
- [ ] Tech Lead: _______________
- [ ] Product Manager: _______________

---

## Quick Reference

**Function URL:** `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents`

**Deploy command:**
```bash
supabase functions deploy upload-documents --project-ref vnhauomvzjucxadrbywg
```

**Test command:**
```bash
cd /Users/vitolo/Desktop/clearscrub_main/supabase/functions/upload-documents
export TEST_JWT="your-jwt-here"
./test-upload.sh
```

**Logs:**
```bash
supabase functions logs upload-documents --project-ref vnhauomvzjucxadrbywg
```

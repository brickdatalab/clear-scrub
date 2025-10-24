# upload-documents Edge Function - Documentation Index

**Version:** 1.0
**Created:** October 21, 2025
**Status:** ✅ Ready for Deployment
**Total Lines:** ~2,100 (code + docs)

---

## Quick Start

**Deploy:**
```bash
cd /Users/vitolo/Desktop/clearscrub_main/supabase
supabase functions deploy upload-documents --project-ref vnhauomvzjucxadrbywg
```

**Test:**
```bash
export TEST_JWT="your-jwt-token"
cd functions/upload-documents
./test-upload.sh
```

**Use:**
```bash
curl -X POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@statement.pdf"
```

---

## Documentation Files

### 📘 Core Documentation

#### **[README.md](./README.md)** (11KB, 550 lines)
**Start here for complete understanding**

Contains:
- Purpose and architecture overview
- Authentication details (JWT validation)
- Request/response specifications
- Database operations breakdown
- Complete processing flow
- Error handling strategy
- Deployment instructions
- Testing procedures
- Security considerations
- Performance expectations
- Troubleshooting guide

**Read this if:** You're new to the project or need API specifications

---

#### **[ARCHITECTURE.md](./ARCHITECTURE.md)** (25KB, 650 lines)
**Deep dive into system design**

Contains:
- System context diagrams
- Data flow visualizations
- Component breakdown
- Database schema interactions
- Storage structure
- Error handling flows
- Security model
- Performance characteristics
- Observability strategy
- Testing strategy
- Deployment architecture

**Read this if:** You need to understand how everything fits together

---

#### **[SUMMARY.md](./SUMMARY.md)** (13KB, 400 lines)
**Executive overview and quick reference**

Contains:
- What was built (feature checklist)
- Architecture summary
- Technical decisions and rationale
- API contract
- Integration points
- Testing strategy
- Deployment checklist
- Performance expectations
- Monitoring setup
- Future enhancements roadmap

**Read this if:** You need a high-level overview or quick reference

---

#### **[DEPLOYMENT.md](./DEPLOYMENT.md)** (9KB, 400 lines)
**Step-by-step deployment guide**

Contains:
- Pre-deployment checklist
- Detailed deployment steps
- Verification procedures
- Functional test cases
- Performance benchmarks
- Security validation
- Rollback procedures
- Monitoring setup
- Support contacts
- Sign-off template

**Read this if:** You're deploying to production

---

### 💻 Implementation Files

#### **[index.ts](./index.ts)** (11KB, 405 lines)
**The actual Edge Function code**

Structure:
```typescript
// CORS headers
const corsHeaders = { ... };

// TypeScript interfaces
interface UploadResult { ... }
interface ErrorResponse { ... }

// Main handler
Deno.serve(async (req: Request) => {
  // [1] Handle CORS preflight
  // [2] Validate HTTP method
  // [3] JWT validation & org_id extraction
  // [4] Parse multipart form data
  // [5] Create submission record
  // [6] Process each file:
  //     - Upload to storage
  //     - Create document record
  //     - Invoke document-metadata
  // [7] Return 202 Accepted
});
```

**Key Features:**
- Full TypeScript typing
- Comprehensive error handling
- Detailed logging
- Production-ready code
- No TODOs or placeholders

---

### 🧪 Testing Files

#### **[test-upload.sh](./test-upload.sh)** (9KB, 250 lines)
**Automated test suite**

Tests:
1. ✅ Successful upload (202)
2. ✅ CORS preflight (204)
3. ✅ Missing auth (401)
4. ✅ No files (400)
5. ✅ Multiple files (202)
6. ✅ Wrong method (405)

Usage:
```bash
export TEST_JWT="your-token"
./test-upload.sh
```

---

#### **[test-examples.sh](./test-examples.sh)** (3KB, 90 lines)
**Quick manual test commands**

Copy-paste ready curl commands for:
- Single file upload
- Multiple file upload
- CORS testing
- Error testing
- Verbose debugging

Usage:
```bash
export TEST_JWT="your-token"
./test-examples.sh
```

---

## File Dependency Map

```
index.ts (Implementation)
    ↓
README.md (API Docs)
    ↓
ARCHITECTURE.md (System Design)
    ↓
SUMMARY.md (Overview)
    ↓
DEPLOYMENT.md (Operations)
    ↓
test-upload.sh (Automated Tests)
    ↓
test-examples.sh (Manual Tests)
```

**Flow:** Implementation → Documentation → Operations → Testing

---

## Reading Order

### For New Developers

1. **[SUMMARY.md](./SUMMARY.md)** - Get the big picture (15 min)
2. **[README.md](./README.md)** - Understand the API (30 min)
3. **[index.ts](./index.ts)** - Review the code (20 min)
4. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Deep dive (45 min)
5. **[test-upload.sh](./test-upload.sh)** - See it in action (10 min)

**Total Time:** ~2 hours

---

### For Deployers

1. **[SUMMARY.md](./SUMMARY.md)** - Verify what's being deployed (10 min)
2. **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Follow deployment steps (30 min)
3. **[test-upload.sh](./test-upload.sh)** - Run tests (5 min)
4. **[README.md](./README.md)** - Reference for troubleshooting (as needed)

**Total Time:** ~45 minutes

---

### For Integrators (Frontend)

1. **[README.md](./README.md)** - Section "Request Specification" (10 min)
2. **[SUMMARY.md](./SUMMARY.md)** - Section "API Contract" (5 min)
3. **[test-examples.sh](./test-examples.sh)** - See curl examples (5 min)
4. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Section "Upstream Callers" (5 min)

**Total Time:** ~25 minutes

---

### For Troubleshooters

1. **[README.md](./README.md)** - Section "Troubleshooting" (quick lookup)
2. **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Section "Rollback Procedure" (if critical)
3. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Section "Error Handling" (deep dive)
4. **[index.ts](./index.ts)** - Search for error codes (code review)

**Total Time:** Varies by issue

---

## Key Concepts

### 1. Authentication Context
- **JWT-based** - User authentication via Authorization header
- **org_id extraction** - Multi-tenant isolation via profiles table
- **Service role writes** - Bypass RLS for admin operations

### 2. Async Processing Pattern
- **202 Accepted** - Immediate response (don't wait for processing)
- **Fire-and-forget** - Invoke document-metadata without awaiting
- **Polling** - Dashboard polls for status updates

### 3. Partial Success Handling
- **Per-file errors** - Continue processing even if some fail
- **Error array** - Return details for each failed file
- **Success bias** - Return 202 if ANY file succeeds

### 4. Storage Path Convention
- **Pattern:** `{org_id}/{submission_id}/{timestamp}_{filename}`
- **Purpose:** Multi-tenant isolation + uniqueness
- **Benefits:** Prevents collisions, enables org filtering

### 5. Database Schema
- **submissions** - Batch tracking (one per upload request)
- **documents** - File tracking (one per file)
- **Relationship:** One submission → Many documents

---

## API Quick Reference

**URL:** `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/upload-documents`

**Method:** POST

**Auth:** `Authorization: Bearer {jwt}`

**Body:** `multipart/form-data` with `files[]` array

**Success:** 202 Accepted
```json
{
  "success": true,
  "submissions": [{
    "id": "uuid",
    "documents": [{"id": "uuid", "filename": "...", "status": "uploaded"}]
  }],
  "summary": {"total_files": 1, "successful": 1, "failed": 0}
}
```

**Errors:** 401 (auth), 400 (no files), 405 (method), 500 (server)

---

## Commands Quick Reference

### Deploy
```bash
supabase functions deploy upload-documents --project-ref vnhauomvzjucxadrbywg
```

### Test
```bash
export TEST_JWT="token"
./test-upload.sh
```

### Logs
```bash
supabase functions logs upload-documents --project-ref vnhauomvzjucxadrbywg
```

### Database
```sql
SELECT * FROM submissions ORDER BY created_at DESC LIMIT 5;
SELECT * FROM documents WHERE submission_id = 'uuid';
```

---

## Status Checklist

### Implementation
- [x] JWT authentication
- [x] Multipart file parsing
- [x] Submission record creation
- [x] Document record creation
- [x] Storage upload
- [x] document-metadata invocation
- [x] Error handling
- [x] CORS support
- [x] Logging
- [x] TypeScript types

### Documentation
- [x] README (API specs)
- [x] ARCHITECTURE (system design)
- [x] SUMMARY (overview)
- [x] DEPLOYMENT (ops guide)
- [x] INDEX (this file)

### Testing
- [x] Automated test script
- [x] Manual test examples
- [ ] E2E tests (pending deployment)
- [ ] Load tests (pending deployment)

### Deployment
- [ ] Function deployed
- [ ] Tests passed
- [ ] Database verified
- [ ] Storage verified
- [ ] Logs checked
- [ ] Performance measured

---

## Project Context

This function is part of the **ClearScrub** bank statement underwriting platform.

**Related Components:**
- `clearscrub_dashboard/` - React frontend
- `supabase/functions/document-metadata/` - PDF processing
- `supabase/functions/statement-schema-intake/` - Bank statement intake
- `supabase/functions/application-schema-intake/` - Application intake

**Project Root:** `/Users/vitolo/Desktop/clearscrub_main/`

**Main Documentation:** `CLAUDE.md` (project root)

---

## Next Steps

1. **Review** - Tech lead code review
2. **Deploy** - Follow DEPLOYMENT.md
3. **Test** - Run test-upload.sh
4. **Monitor** - Check logs for errors
5. **Integrate** - Update dashboard to use function
6. **Document** - Update main CLAUDE.md

---

## Support

**Questions?**
- Read [README.md](./README.md) first
- Check [ARCHITECTURE.md](./ARCHITECTURE.md) for design questions
- See [DEPLOYMENT.md](./DEPLOYMENT.md) for ops issues

**Issues?**
- Check function logs
- Review test output
- Verify database records
- Consult troubleshooting guides

**Escalation:**
- Backend team (code issues)
- DevOps team (infrastructure)
- Supabase support (platform issues)

---

## Version History

**v1.0 (2025-10-21)**
- Initial implementation
- Complete documentation
- Test suite
- Ready for production deployment

---

## License & Credits

**Built for:** ClearScrub Project
**Created by:** Claude Code
**Date:** October 21, 2025
**License:** Internal use only

---

*This is a living document. Update as the function evolves.*

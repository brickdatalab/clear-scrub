# ADR-001: Job Model Using Submissions Table (Not Separate Jobs Table)

## Status
Accepted

## Date
October 23, 2025

## Context
We needed to model file upload batches and track per-file processing status for the Add Company feature. Two primary architectural approaches were considered:

### Option A: Separate `jobs` table
- **Pros:**
  - Clean separation of concerns
  - Traditional job queue pattern
  - Clear job lifecycle management
- **Cons:**
  - Requires additional table in already complex schema
  - More joins required for queries
  - Another RLS policy to maintain
  - Adds complexity to entity relationships

### Option B: Use `submissions` table as job container
- **Pros:**
  - Fewer tables in schema
  - Simpler entity relationships
  - One natural hierarchical relationship
  - Already have submissions table for batch tracking
- **Cons:**
  - Slightly broader purpose for submissions table
  - Mixing domain concepts (submissions + job tracking)

## Decision
Use `submissions` table as job container. Each submission contains multiple documents that are processed independently.

## Implementation

### Database Schema
```sql
submissions (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

documents (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  error_text TEXT,
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### Relationship Structure
```
submissions (id, org_id, status, created_at)
  ├─ 1:N relationship
  └─ documents (id, submission_id, status, error_text, processing_started_at, processing_completed_at)
```

### Status Lifecycle
```
Submission Status:
  pending → processing → complete/failed

Document Status:
  pending → processing → complete/failed
```

## Rationale

### 1. Reduces Schema Complexity
- ClearScrub already has 14 tables with RLS policies
- Adding a 15th jobs table would increase maintenance burden
- Submissions table naturally represents "batch of work"

### 2. Natural Hierarchical Relationship
- Upload batch (submission) → individual files (documents)
- This matches user mental model: "I'm uploading a set of files"
- Documents inherit org_id from parent submission (simplifies RLS)

### 3. Easier Row Level Security
- Submission already filtered by org_id
- Documents inherit security context via foreign key
- No additional RLS policy required for job isolation

### 4. Future-Proof for Batch Operations
- Submission-level operations fit naturally:
  - "Retry all failed documents in submission"
  - "Reprocess entire submission"
  - "Cancel submission"
- Audit trail at submission level captures batch metadata

## Consequences

### Positive
- **Single submission-level audit trail**: Track who uploaded, when, and what happened
- **Batch operations straightforward**: Can operate on all documents in submission atomically
- **Foreign keys reduce orphaned documents**: ON DELETE CASCADE ensures cleanup
- **Simpler queries**: No complex joins between jobs and work items
- **Inheritance of org_id**: Documents automatically belong to same org as submission

### Negative
- **Submissions table now dual-purpose**: Handles both applicant data submissions and job tracking
- **Potential confusion**: "Submission" could mean different things in different contexts
  - Mitigation: Clear documentation and naming conventions

### Neutral
- **Status at two levels**: Both submission and document have status fields
  - This is intentional: submission status = aggregate of document statuses
  - Document status = individual file processing state

## Alternatives Considered

### 1. Separate Jobs Table (Rejected)
```sql
jobs (id, org_id, status, created_at)
  └─ job_items (id, job_id, document_id, status)
```
- **Why rejected:** Adds unnecessary complexity, another RLS policy, more joins

### 2. Embed Status in Documents Only (Rejected)
```sql
documents (id, org_id, status, ...)
```
- **Why rejected:** Loses batch concept, no way to track "who uploaded this set of files"

### 3. Separate Ingestion vs Processing Models (Rejected)
- **Why rejected:** Over-engineering for current scale (single developer, direct production)

## Related Decisions
- **ADR-002:** Processing Tab derived from documents table (not placeholder companies)
- **ADR-003:** Company creation timing (async during OCR, not immediate)

## References
- Database schema: `/supabase/database/migrations/20251023_add_company_feature_schema.sql`
- RPC function: `prepare_submission()` in migration file
- Documents table constraints and indexes

## Review Notes
This ADR represents a pragmatic choice prioritizing simplicity over theoretical purity. For a larger team or more complex system, a dedicated jobs table might be warranted. For ClearScrub's current scale (single developer, direct production workflow), this approach provides the right balance of functionality and maintainability.

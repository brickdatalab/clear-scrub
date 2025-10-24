-- Migration: 20251023_phase1_documents_schema_enhancements.sql
-- Purpose: Add error tracking and processing timestamps to documents table
-- Dependencies: documents table exists (created in previous phases)
-- Rationale: Enable error tracking for OCR/intake failures and performance monitoring
-- Impact: Non-breaking (adds nullable columns), safe for production deployment

-- ============================================================================
-- PHASE 1.4: Documents Table Schema Enhancements
-- ============================================================================

-- 1. Add error_text column (nullable, for storing OCR/intake errors)
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS error_text TEXT;

COMMENT ON COLUMN public.documents.error_text IS 'Stores error messages from OCR processing or intake webhook failures. NULL indicates no error.';

-- 2. Add processing timestamps for performance monitoring
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS processing_finished_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.documents.processing_started_at IS 'Timestamp when document processing began (OCR extraction started)';
COMMENT ON COLUMN public.documents.processing_finished_at IS 'Timestamp when document processing completed (success or failure)';

-- 3. Create unique index to prevent duplicate file uploads
-- Allows re-upload if document was deleted (status = 'deleted')
CREATE UNIQUE INDEX IF NOT EXISTS ux_documents_org_file_path
ON public.documents(org_id, file_path)
WHERE status != 'deleted';

COMMENT ON INDEX ux_documents_org_file_path IS 'Prevents duplicate file uploads within same org. Allows re-upload if document deleted.';

-- 4. Create index for efficient status queries in Processing tab
-- Partial index: only indexes documents that are actively being processed or need attention
CREATE INDEX IF NOT EXISTS idx_documents_status_org
ON public.documents(org_id, status)
WHERE status IN ('pending', 'processing', 'failed');

COMMENT ON INDEX idx_documents_status_org IS 'Optimizes queries for documents in active processing states (pending/processing/failed)';

-- 5. Create index for efficient lookup by submission_id
-- Used when fetching all documents for a specific upload batch
CREATE INDEX IF NOT EXISTS idx_documents_submission_org
ON public.documents(submission_id, org_id);

COMMENT ON INDEX idx_documents_submission_org IS 'Fast lookup of all documents in a submission batch for status tracking';

-- ============================================================================
-- Verification Queries (for post-deployment validation)
-- ============================================================================

-- Verify columns exist
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
-- AND table_name = 'documents'
-- AND column_name IN ('error_text', 'processing_started_at', 'processing_finished_at')
-- ORDER BY ordinal_position;

-- Verify indexes exist
-- SELECT
--   schemaname,
--   tablename,
--   indexname,
--   indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
-- AND tablename = 'documents'
-- AND indexname IN ('ux_documents_org_file_path', 'idx_documents_status_org', 'idx_documents_submission_org');

-- ============================================================================
-- Rollback Procedure (for emergency rollback)
-- ============================================================================

-- DROP INDEX IF EXISTS public.idx_documents_submission_org;
-- DROP INDEX IF EXISTS public.idx_documents_status_org;
-- DROP INDEX IF EXISTS public.ux_documents_org_file_path;
-- ALTER TABLE public.documents DROP COLUMN IF EXISTS processing_finished_at;
-- ALTER TABLE public.documents DROP COLUMN IF EXISTS processing_started_at;
-- ALTER TABLE public.documents DROP COLUMN IF EXISTS error_text;

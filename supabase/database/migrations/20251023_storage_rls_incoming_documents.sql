-- Migration: 20251023_storage_rls_incoming_documents.sql
-- Purpose: Create RLS policies for incoming-documents Storage bucket
-- Dependencies: incoming-documents bucket must exist (verified), profiles table with org_id
-- Rationale: Enforce multi-tenant isolation for uploaded files - users can only access their org's files
-- Impact: All file operations (upload, read, update, delete) restricted by org_id via RLS

-- =============================================================================
-- UP Migration: Create Storage RLS Policies
-- =============================================================================

-- Policy 1: INSERT - Allow authenticated users to upload files to their org's path
CREATE POLICY "Users can upload files to their org path"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'incoming-documents'
  AND (storage.foldername(name))[1]::uuid = (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Policy 2: SELECT - Allow authenticated users to read only their org's files
CREATE POLICY "Users can read their org files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'incoming-documents'
  AND (storage.foldername(name))[1]::uuid = (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Policy 3: UPDATE - Allow authenticated users to update metadata for their org's files
CREATE POLICY "Users can update their org files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'incoming-documents'
  AND (storage.foldername(name))[1]::uuid = (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'incoming-documents'
  AND (storage.foldername(name))[1]::uuid = (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Policy 4: DELETE - Allow authenticated users to delete only their org's files
CREATE POLICY "Users can delete their org files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'incoming-documents'
  AND (storage.foldername(name))[1]::uuid = (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- =============================================================================
-- Verification Queries (Run after deployment to confirm policies active)
-- =============================================================================

-- Check policies were created
-- SELECT policyname, cmd, roles, qual::text
-- FROM pg_policies
-- WHERE schemaname = 'storage'
--   AND tablename = 'objects'
--   AND policyname LIKE '%org%';

-- Test with specific user context (replace <user_uuid> with actual user ID)
-- SET request.jwt.claims.sub = '<user_uuid>';
-- SELECT * FROM storage.objects WHERE bucket_id = 'incoming-documents';

-- =============================================================================
-- DOWN Migration: Rollback (Drop all 4 policies)
-- =============================================================================

-- DROP POLICY IF EXISTS "Users can upload files to their org path" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can read their org files" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can update their org files" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can delete their org files" ON storage.objects;

-- =============================================================================
-- Migration Notes
-- =============================================================================

-- Path Structure Enforcement:
-- Files MUST be uploaded to paths: {org_id}/{submission_id}/{filename}
-- storage.foldername(name) splits path into array: ['org_id', 'submission_id', 'filename']
-- [1] extracts first segment (org_id) as text, ::uuid casts to UUID for comparison

-- Security Guarantee:
-- User from org_A cannot access files uploaded by org_B
-- Even with direct URL access, RLS blocks unauthorized reads
-- Service role key bypasses RLS (used by Edge Functions for admin operations)

-- Performance Considerations:
-- Subquery to profiles table executed on every file operation
-- Consider caching org_id in JWT custom claims if performance issues arise
-- Storage queries typically low volume (<100/sec) so current design acceptable

-- Testing Checklist:
-- [ ] User can upload file to {their_org_id}/{submission_id}/test.pdf
-- [ ] User cannot upload file to {other_org_id}/{submission_id}/test.pdf (403 error)
-- [ ] User can read files from their org path only
-- [ ] User cannot read files from other org paths
-- [ ] User can delete files from their org path only
-- [ ] Service role key can access all files (bypasses RLS)

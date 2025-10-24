-- Migration: 20251023_phase3_submission_status_rpc.sql
-- Purpose: Create RPC function for polling fallback to get submission status with all documents
-- Phase: Phase 3.3 - Add Company Feature - Realtime Status Wiring
-- Dependencies: documents table, submissions table, RLS policies
-- Rationale: Provides optimized single-call endpoint for fetching submission + documents for polling fallback

-- Drop function if exists (idempotent)
DROP FUNCTION IF EXISTS public.get_submission_status(uuid);

-- Create RPC function to get submission status with all related documents
CREATE OR REPLACE FUNCTION public.get_submission_status(p_submission_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id uuid;
  v_status_summary jsonb;
BEGIN
  -- Verify user's org_id from profile
  SELECT org_id INTO v_org_id FROM profiles WHERE id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for user';
  END IF;

  -- Get submission with all documents, enforcing RLS via org_id check
  SELECT jsonb_build_object(
    'submission_id', s.id,
    'org_id', s.org_id,
    'status', s.status,
    'ingestion_method', s.ingestion_method,
    'documents', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'filename', d.filename,
          'file_path', d.file_path,
          'status', d.status,
          'error_message', d.error_message,
          'processing_started_at', d.processing_started_at,
          'processing_completed_at', d.processing_completed_at,
          'processing_duration_seconds', d.processing_duration_seconds,
          'file_size_bytes', d.file_size_bytes,
          'company_id', d.company_id,
          'created_at', d.created_at,
          'updated_at', d.updated_at
        ) ORDER BY d.created_at DESC
      ) FILTER (WHERE d.id IS NOT NULL),
      '[]'::jsonb
    ),
    'created_at', s.created_at,
    'updated_at', s.updated_at
  ) INTO v_status_summary
  FROM submissions s
  LEFT JOIN documents d ON s.id = d.submission_id
  WHERE s.id = p_submission_id
  AND s.org_id = v_org_id  -- RLS enforcement: only return if user owns this org
  GROUP BY s.id, s.org_id, s.status, s.ingestion_method, s.created_at, s.updated_at;

  -- Return NULL if submission not found (rather than error)
  IF v_status_summary IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'Submission not found or access denied',
      'submission_id', p_submission_id
    );
  END IF;

  RETURN v_status_summary;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_submission_status(uuid) TO authenticated;

-- Add comment explaining function purpose
COMMENT ON FUNCTION public.get_submission_status(uuid) IS
'Returns submission details with all related documents for a given submission_id. Enforces RLS by checking user org_id. Used for polling fallback when realtime connection drops. Returns JSONB with submission metadata and documents array.';

-- Verification query (for testing after deployment)
-- SELECT public.get_submission_status('<submission_id>');

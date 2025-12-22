-- Migration: Add documents schema_job_id index
-- Purpose: Enable fast lookup by llama_job_id for run-level idempotency
-- Date: 2025-10-29

CREATE INDEX idx_documents_schema_job_id
ON documents(schema_job_id) WHERE schema_job_id IS NOT NULL;

-- =====================================================================
-- MIGRATION: Add Comprehensive Table and Column Descriptions
-- =====================================================================
-- Date: 2025-10-15
-- Project: vnhauomvzjucxadrbywg (clear_scrub)
-- Purpose: Document all 12 tables and 177 columns with detailed descriptions
--
-- IMPORTANT: Run this migration AFTER schema_revamp_plan.sql
-- =====================================================================

-- =====================================================================
-- TABLE 1: organizations (8 columns)
-- =====================================================================

COMMENT ON TABLE public.organizations IS
'Lender organizations using the ClearScrub platform. Each organization has an auto-generated email address for document intake and manages multiple user profiles. Organizations are the top-level tenant for multi-tenant RLS isolation.';

COMMENT ON COLUMN public.organizations.id IS
'Primary key uniquely identifying each lender organization. Used throughout the database for org-scoped RLS policies to ensure data isolation between tenants.';

COMMENT ON COLUMN public.organizations.name IS
'Legal or business name of the lender organization. Displayed in UI and used for customer identification. May differ from DBA names in marketing materials.';

COMMENT ON COLUMN public.organizations.email_address IS
'Auto-generated unique email address for document intake in format: org_{uuid}@emailforwarding.clearscrub.io. Forwarding this email to partners enables automatic document ingestion via email_submissions pipeline.';

COMMENT ON COLUMN public.organizations.email_domain IS
'Email forwarding domain configured for this organization. Typically emailforwarding.clearscrub.io but can be customized for white-label deployments or enterprise clients.';

COMMENT ON COLUMN public.organizations.status IS
'Organization account status. Values: active (normal operation), suspended (temporary restriction), cancelled (permanently closed). Suspended orgs cannot upload documents or access APIs.';

COMMENT ON COLUMN public.organizations.subscription_tier IS
'Billing plan level determining feature access and API rate limits. Values: free (trial/demo), basic (small lenders), pro (mid-market), enterprise (high-volume with SLA). Affects usage_logs cost calculations.';

COMMENT ON COLUMN public.organizations.created_at IS
'Timestamp when organization was created in the system. Automatically set via DEFAULT now() and never updated. Used for lifecycle analytics and billing start date.';

COMMENT ON COLUMN public.organizations.updated_at IS
'Timestamp of last modification to organization record. Updated via trigger on any column change. Tracks subscription changes, status updates, and configuration edits.';

-- =====================================================================
-- TABLE 2: profiles (9 columns)
-- =====================================================================

COMMENT ON TABLE public.profiles IS
'User accounts belonging to organizations. Extends Supabase auth.users with org membership and profile data. Created automatically via trigger on auth signup. Multiple profiles can belong to one organization.';

COMMENT ON COLUMN public.profiles.id IS
'Primary key matching auth.users.id (1:1 relationship). Foreign key ensures profile cannot exist without corresponding auth record. UUID consistency enables JOIN-free auth checks in RLS policies.';

COMMENT ON COLUMN public.profiles.email IS
'User email address copied from auth.users.email for convenience. Enables email lookups without joining auth.users. Updated via trigger when auth.users.email changes.';

COMMENT ON COLUMN public.profiles.full_name IS
'User display name shown in UI (topbar, activity logs, file uploads). NULL for new signups until profile completion. Not used for authentication or formal identification.';

COMMENT ON COLUMN public.profiles.avatar_url IS
'URL to profile image, typically from Supabase Storage public-assets bucket or Gravatar. NULL shows default avatar in UI. Not validated or CDN-optimized.';

COMMENT ON COLUMN public.profiles.phone IS
'User phone number for contact purposes. Optional field, NULL for most users. Not used for authentication or SMS notifications in current version.';

COMMENT ON COLUMN public.profiles.company_role IS
'User role within organization for display purposes only. Example values: Underwriter, Loan Officer, Manager. NOT used for authorization (permissions are planned for future RBAC system).';

COMMENT ON COLUMN public.profiles.created_at IS
'Timestamp when profile was created via auth trigger. Matches auth.users.created_at. Used for user lifecycle analytics and onboarding funnel tracking.';

COMMENT ON COLUMN public.profiles.updated_at IS
'Timestamp of last modification to profile data. Updated via trigger on any column change. Tracks profile completeness and engagement patterns.';

COMMENT ON COLUMN public.profiles.org_id IS
'Foreign key to organizations table establishing org membership. CRITICAL for RLS policies - all user data scoped to this org_id. NOT NULL enforces that every user must belong to exactly one organization.';

-- =====================================================================
-- TABLE 3: submissions (10 columns)
-- =====================================================================

COMMENT ON TABLE public.submissions IS
'Central hub tracking each document ingestion event. One submission can contain multiple documents (multi-file upload or email with attachments). Links together documents, email_submissions, and api_keys to provide unified ingestion audit trail.';

COMMENT ON COLUMN public.submissions.id IS
'Primary key uniquely identifying this ingestion event. Referenced by documents.submission_id, email_submissions.submission_id to group related files. One submission = one upload action or one email received.';

COMMENT ON COLUMN public.submissions.org_id IS
'Foreign key to organizations. Establishes which org owns this submission for RLS isolation. Copied from user profile or parsed from email address. CRITICAL for multi-tenant security.';

COMMENT ON COLUMN public.submissions.user_id IS
'Foreign key to auth.users indicating who initiated submission. NULL for API submissions (use api_key_id instead) and email submissions (sender tracked in email_submissions table). Used for activity tracking and audit logs.';

COMMENT ON COLUMN public.submissions.ingestion_method IS
'How documents arrived in the system. Values: api (via partner API), dashboard (manual upload), email (email forwarding). Determines which related table has additional metadata (email_submissions for email, api_keys for API).';

COMMENT ON COLUMN public.submissions.status IS
'Overall processing state for this submission batch. Values: received (just arrived), processing (documents being extracted), completed (all docs processed successfully), failed (extraction errors). Updated as documents progress through pipeline.';

COMMENT ON COLUMN public.submissions.error_message IS
'Error details if status is failed. Contains human-readable error from document processing pipeline. NULL for successful submissions. Used for debugging ingestion issues and customer support.';

COMMENT ON COLUMN public.submissions.metadata IS
'Flexible JSONB storage for method-specific data. API submissions store rate limiting info, email submissions store parsed headers, dashboard uploads store UI state. Schema varies by ingestion_method - not normalized due to high variance.';

COMMENT ON COLUMN public.submissions.created_at IS
'Timestamp when submission was received by system. Set via DEFAULT now() on INSERT. Used for ingestion analytics, SLA monitoring, and chronological sorting in dashboard.';

COMMENT ON COLUMN public.submissions.updated_at IS
'Timestamp of last status change. Updated via trigger when status or error_message changes. Used to calculate processing duration and detect stuck submissions.';

COMMENT ON COLUMN public.submissions.api_key_id IS
'Foreign key to api_keys if submitted via Partner API. NULL for manual dashboard uploads and email submissions. Moved from documents table to normalize ingestion metadata at submission level. Enables API usage tracking and rate limiting.';

-- =====================================================================
-- TABLE 4: companies (16 columns)
-- =====================================================================

COMMENT ON TABLE public.companies IS
'Applicant businesses being analyzed by lenders. Stores business profile data extracted from application PDFs and enriched from bank statements. One company can have multiple applications over time. Referenced by accounts (bank accounts) and applications (funding requests).';

COMMENT ON COLUMN public.companies.id IS
'Primary key uniquely identifying each applicant business. Referenced by applications.company_id, accounts.company_id, documents.company_id. UUID enables distributed generation without collisions.';

COMMENT ON COLUMN public.companies.org_id IS
'Foreign key to organizations. Establishes which lender owns this company record for RLS isolation. One company belongs to one lender. CRITICAL: companies cannot be shared between orgs in current design.';

COMMENT ON COLUMN public.companies.legal_name IS
'Official legal business name from incorporation documents or application. Used for matching across data sources and identity verification. May differ from DBA name used in marketing.';

COMMENT ON COLUMN public.companies.dba_name IS
'Doing Business As name (trade name). NULL if same as legal_name. Common for franchises and retail businesses. Used for bank statement reconciliation when transactions show DBA instead of legal name.';

COMMENT ON COLUMN public.companies.ein IS
'Employer Identification Number (9-digit tax ID). Used for identity verification and deduplication. Stored as text to preserve leading zeros. NULL if sole proprietor using SSN instead.';

COMMENT ON COLUMN public.companies.industry IS
'Business industry category extracted from application or manually entered. Free-form text currently (no controlled vocabulary). Used for risk scoring and industry benchmark comparisons. Future: standardize to NAICS codes.';

COMMENT ON COLUMN public.companies.address_line1 IS
'Primary street address of business location. Extracted from application PDF. Used for identity verification and geographic risk analysis. May be PO Box (flag for risk scoring).';

COMMENT ON COLUMN public.companies.address_line2 IS
'Secondary address line for suite/unit numbers. NULL for most businesses. Extracted from application PDF when present.';

COMMENT ON COLUMN public.companies.city IS
'City where business is located. Extracted from application PDF. Used for geographic risk scoring and state licensing validation.';

COMMENT ON COLUMN public.companies.state IS
'Two-letter state/province code (e.g., NY, CA, TX). Extracted from application PDF. CRITICAL for regulatory compliance and state-specific lending rules. TODO: validate against ISO 3166-2 codes.';

COMMENT ON COLUMN public.companies.zip IS
'Postal code (5-digit or ZIP+4 format). Extracted from application PDF. Used for fraud detection (address validation) and geographic clustering analysis.';

COMMENT ON COLUMN public.companies.phone IS
'Business contact phone number. Extracted from application or bank statements. No format validation currently - stored as-is. Used for identity verification and customer contact.';

COMMENT ON COLUMN public.companies.email IS
'Business contact email address. Extracted from application. Used for customer communication and identity verification. Not used for authentication (that is profiles.email).';

COMMENT ON COLUMN public.companies.website IS
'Company website URL. Optional field extracted from application when provided. NULL for many small businesses. Used for business validation and online presence verification.';

COMMENT ON COLUMN public.companies.notes IS
'Free-form text notes entered by underwriters. NULL initially, populated during manual review process. Used for internal communication between loan officers about applicant context or red flags.';

COMMENT ON COLUMN public.companies.created_at IS
'Timestamp when company record was first created in system. Set via DEFAULT now() on INSERT. Used for customer lifecycle analytics and duplicate detection.';

COMMENT ON COLUMN public.companies.updated_at IS
'Timestamp of last modification to company data. Updated via trigger on any column change. Tracks data enrichment progress (e.g., bank statement extraction filling in missing fields).';

-- =====================================================================
-- TABLE 5: applications (27 columns)
-- =====================================================================

COMMENT ON TABLE public.applications IS
'Funding request data extracted from application PDFs using LlamaIndex. One-to-one relationship with submissions (each submission generates one application). Stores structured business and owner information used for underwriting decisioning. Raw extraction stored in raw_extracted_data JSONB for audit trail.';

COMMENT ON COLUMN public.applications.id IS
'Primary key uniquely identifying this funding application. UUID enables distributed generation. Used by dashboard to display application details in CompanyDetail sidebar.';

COMMENT ON COLUMN public.applications.submission_id IS
'Foreign key to submissions with UNIQUE constraint enforcing 1:1 relationship. One submission produces exactly one application record. Enables tracing application data back to source PDF file.';

COMMENT ON COLUMN public.applications.company_id IS
'Foreign key to companies linking this application to a business entity. NULL initially, populated after entity resolution matching business_name to existing companies or creating new company record. Enables tracking multiple applications from same business over time.';

COMMENT ON COLUMN public.applications.business_name IS
'Business name extracted directly from application PDF. May differ from companies.legal_name due to OCR errors or applicant using DBA. Used for fuzzy matching during entity resolution to populate company_id.';

COMMENT ON COLUMN public.applications.business_structure IS
'Legal entity type extracted from application. Common values: LLC, Corporation, Sole Proprietorship, Partnership. Free-form text currently. Used for risk scoring (entity type affects liability). Future: standardize to controlled vocabulary.';

COMMENT ON COLUMN public.applications.years_in_business IS
'Number of years company has been operating. Extracted from application as numeric value. NULL if not provided. Used for underwriting (newer businesses = higher risk). Validated against incorporation date when available.';

COMMENT ON COLUMN public.applications.number_of_employees IS
'Total employee count reported in application. Integer value, NULL if not provided. Used for business size classification and revenue reasonableness checks (revenue per employee ratio).';

COMMENT ON COLUMN public.applications.annual_revenue IS
'Reported annual revenue in USD. Numeric field extracted from application. NULL if not provided. CRITICAL for underwriting - compared against bank statement deposits to detect inflation. Stored as numeric(15,2) for precision.';

COMMENT ON COLUMN public.applications.funding_amount IS
'Loan amount requested by applicant in USD. Numeric field extracted from application. Used for loan-to-revenue ratio calculation and approval thresholds. Stored as numeric(15,2) for precision.';

COMMENT ON COLUMN public.applications.funding_purpose IS
'Use of loan funds described by applicant. Free-form text extracted from application. Common values: working capital, equipment purchase, expansion, debt consolidation. Used for risk scoring (equipment = secured, working capital = unsecured).';

COMMENT ON COLUMN public.applications.owner_1_name IS
'Full name of primary business owner (typically highest ownership percentage). Extracted from application PDF. Used for background check lookup and personal guarantee identification. NULL if extraction fails.';

COMMENT ON COLUMN public.applications.owner_1_ssn_last4 IS
'Last 4 digits of primary owner Social Security Number. Extracted from application for identity verification. Stored as text to preserve leading zeros. SENSITIVE DATA - never log in plaintext. NULL if not provided in application.';

COMMENT ON COLUMN public.applications.owner_1_ownership_pct IS
'Primary owner ownership percentage as decimal (e.g., 0.51 = 51%). Extracted from application. Used for personal guarantee requirements (typically 20%+ ownership triggers guarantee). NULL if not disclosed.';

COMMENT ON COLUMN public.applications.owner_1_address IS
'Primary owner residential address. Extracted as single text field from application (not normalized). Used for identity verification and fraud detection (compare to business address). NULL if not provided.';

COMMENT ON COLUMN public.applications.owner_1_phone IS
'Primary owner contact phone number. Extracted from application, no format validation. Used for applicant contact and identity verification. NULL if not provided.';

COMMENT ON COLUMN public.applications.owner_1_email IS
'Primary owner email address. Extracted from application. Used for applicant communication. Not used for authentication. NULL if not provided.';

COMMENT ON COLUMN public.applications.owner_2_name IS
'Full name of secondary business owner. NULL if single owner or extraction fails. Used for multi-owner businesses requiring multiple personal guarantees.';

COMMENT ON COLUMN public.applications.owner_2_ssn_last4 IS
'Last 4 digits of secondary owner SSN. NULL if single owner or not disclosed. SENSITIVE DATA - same security requirements as owner_1_ssn_last4.';

COMMENT ON COLUMN public.applications.owner_2_ownership_pct IS
'Secondary owner ownership percentage as decimal. NULL if single owner or not disclosed. Used to verify 100% total ownership across all owners.';

COMMENT ON COLUMN public.applications.owner_2_address IS
'Secondary owner residential address. NULL if single owner or not provided. Used for multi-owner identity verification.';

COMMENT ON COLUMN public.applications.owner_2_phone IS
'Secondary owner contact phone number. NULL if single owner or not provided. Used for multi-owner applicant contact.';

COMMENT ON COLUMN public.applications.owner_2_email IS
'Secondary owner email address. NULL if single owner or not provided. Used for multi-owner applicant communication.';

COMMENT ON COLUMN public.applications.extracted_at IS
'Timestamp when LlamaIndex extraction completed successfully. NULL if extraction not yet run or failed. Used to calculate extraction latency and track processing pipeline performance.';

COMMENT ON COLUMN public.applications.raw_extracted_data IS
'Full unstructured extraction output from LlamaIndex as JSONB. Contains ALL fields extracted from PDF before normalization, including low-confidence fields not mapped to columns. Used for extraction accuracy audits and reprocessing. Never delete - permanent audit trail.';

COMMENT ON COLUMN public.applications.confidence_score IS
'Overall extraction confidence from LlamaIndex (0.0 to 1.0 scale). Low scores (<0.7) trigger manual review flag. NULL if extraction not yet run. Calculated as average of individual field confidence scores from raw_extracted_data.';

COMMENT ON COLUMN public.applications.created_at IS
'Timestamp when application record was created. Set via DEFAULT now() on INSERT. Used for application processing SLA monitoring and chronological ordering in dashboard.';

COMMENT ON COLUMN public.applications.updated_at IS
'Timestamp of last modification to application data. Updated via trigger on any column change. Tracks data enrichment (e.g., company_id population after entity resolution).';

-- =====================================================================
-- TABLE 6: documents (25 columns)
-- =====================================================================

COMMENT ON TABLE public.documents IS
'Tracks PDF files stored in Supabase Storage incoming-documents bucket with processing status and extracted content. One submission can have multiple documents (multi-file upload or email attachments). Documents progress through processing pipeline: uploaded → queued → processing → completed/failed. Extracted content stored as markdown (extracted_markdown) and structured JSON (structured_json).';

COMMENT ON COLUMN public.documents.id IS
'Primary key uniquely identifying this document. Referenced by statements.document_id and applications.submission_id (indirectly via submissions). Used in webhooks and API responses to track processing status.';

COMMENT ON COLUMN public.documents.company_id IS
'Foreign key to companies linking this document to a business entity. NULL initially, populated after entity resolution when document is classified and matched to company. Enables company-scoped document listing in dashboard.';

COMMENT ON COLUMN public.documents.filename IS
'Original filename from upload, email attachment, or API submission. Includes extension (e.g., statement.pdf). Displayed in UI for user recognition. Not guaranteed unique - use id or file_path for lookups.';

COMMENT ON COLUMN public.documents.file_path IS
'Full Storage path in incoming-documents bucket. Format: org_id/submission_id/filename or API key prefix variants. UNIQUE constraint ensures no duplicate uploads. Used for Storage API operations (download, delete, presigned URLs).';

COMMENT ON COLUMN public.documents.file_size_bytes IS
'File size in bytes for storage analytics and quota enforcement. Extracted from Storage metadata on upload. Used for usage_logs cost calculation (pricing tiers by file size). NULL if upload incomplete.';

COMMENT ON COLUMN public.documents.mime_type IS
'File MIME type from upload headers. Expected: application/pdf. Used for validation (reject non-PDF files) and download Content-Type headers. NULL if not provided by uploader.';

COMMENT ON COLUMN public.documents.status IS
'Processing pipeline status. Values: uploaded (in Storage, not yet queued), queued (sent to processing webhook), processing (extraction in progress), completed (extraction successful), failed (extraction error - see error_message). Drives dashboard UI loading states and retry logic.';

COMMENT ON COLUMN public.documents.processing_started_at IS
'Timestamp when document processing began (status changed to processing). NULL if not yet started. Used with processing_completed_at to calculate processing_duration_seconds for SLA monitoring.';

COMMENT ON COLUMN public.documents.processing_completed_at IS
'Timestamp when processing finished (status changed to completed or failed). NULL if still processing or not yet started. Used for latency analytics and stuck document detection (processing too long triggers alert).';

COMMENT ON COLUMN public.documents.processing_duration_seconds IS
'Total processing time in seconds calculated as (processing_completed_at - processing_started_at). NULL if processing incomplete. Used for performance monitoring and pipeline optimization. Typical range: 10-60 seconds for bank statements, 5-20 seconds for applications.';

COMMENT ON COLUMN public.documents.error_message IS
'Human-readable error details if status is failed. Contains exception message from processing pipeline (OCR errors, parsing failures, timeout). NULL for successful processing. Used for debugging and customer support. NOT SENSITIVE - safe to display in UI.';

COMMENT ON COLUMN public.documents.created_at IS
'Timestamp when document record was created in database (may differ slightly from upload timestamp). Set via DEFAULT now() on INSERT. Used for chronological sorting and ingestion analytics.';

COMMENT ON COLUMN public.documents.updated_at IS
'Timestamp of last modification to document record. Updated via trigger on any column change (especially status transitions). Used to detect stale documents and track processing pipeline progress.';

COMMENT ON COLUMN public.documents.extracted_markdown IS
'Full text content from PDF converted to markdown format by processing pipeline. Extracted via Mistral OCR or similar. Used for full-text search (future feature) and human review of extraction quality. NULL if extraction failed or not yet run. Large field - can be 50KB+ for multi-page statements.';

COMMENT ON COLUMN public.documents.structured_json IS
'Structured data extracted from document by LlamaIndex. Schema depends on classification_type: bank statements use bank_schema_v3.json format (transactions array), applications use application schema (business/owner fields). NULL if extraction not yet run. Used to populate statements and applications tables.';

COMMENT ON COLUMN public.documents.structured_at IS
'Timestamp when structured extraction (structured_json) was completed. Differs from processing_completed_at for two-phase extraction (OCR first, structuring second). NULL if structuring not yet run. Used for extraction pipeline performance analysis.';

COMMENT ON COLUMN public.documents.processing_pipeline_version IS
'Version identifier of extraction pipeline that processed this document. Format: v2.1.3 or git commit SHA. Used for A/B testing extraction improvements and reprocessing old documents with newer pipeline. NULL for manually uploaded documents never processed.';

COMMENT ON COLUMN public.documents.page_count IS
'Number of pages in PDF extracted from file metadata. Used for cost calculation (per-page OCR pricing) and quality validation (e.g., 1-page bank statement is suspicious). NULL if metadata extraction failed.';

COMMENT ON COLUMN public.documents.processing_method IS
'Extraction method used for this document. Values: mistral_ocr (default), tesseract (fallback), manual_entry (human-entered). Used for quality analysis by method and cost tracking. NULL if not yet processed.';

COMMENT ON COLUMN public.documents.ocr_confidence_score IS
'Overall OCR quality score from processing pipeline (0.0 to 1.0 scale). Low scores (<0.8) trigger manual review flag. Calculated as average confidence across all detected text blocks. NULL if OCR not yet run. Used for extraction quality monitoring.';

COMMENT ON COLUMN public.documents.has_errors IS
'Boolean flag for non-fatal processing errors (extraction succeeded but with warnings). Example: partially missing data, low confidence fields, format inconsistencies. FALSE = clean extraction, TRUE = review recommended. Used to filter documents needing manual attention.';

COMMENT ON COLUMN public.documents.submission_id IS
'Foreign key to submissions linking this document to an ingestion event. NOT NULL enforces that every document must belong to a submission. Enables grouping documents from same upload/email and tracing back to ingestion metadata.';

COMMENT ON COLUMN public.documents.classification_type IS
'Document type identified by LlamaIndex classifier. Values: bank_statement, application, debt_schedule, tax_return, unknown. Determines which structured_json schema to use and which table to populate (statements vs applications). NULL if classification not yet run.';

COMMENT ON COLUMN public.documents.classification_confidence IS
'Classification confidence from LlamaIndex (0.0 to 1.0 scale). Low scores (<0.7) mean document type is ambiguous and may be misclassified. Used to trigger manual classification review. NULL if not yet classified.';

COMMENT ON COLUMN public.documents.llama_file_id IS
'LlamaIndex Cloud file identifier for this document. UUID assigned by LlamaIndex on upload. Used for reprocessing documents, accessing extraction results, and debugging LlamaIndex API issues. NULL if uploaded directly to Storage without LlamaIndex (legacy documents).';

-- =====================================================================
-- TABLE 7: email_submissions (9 columns)
-- =====================================================================

COMMENT ON TABLE public.email_submissions IS
'Tracks documents received via email forwarding to organization-specific email addresses (e.g., org_uuid@emailforwarding.clearscrub.io). One email creates one email_submission record and one submission record, then spawns one document record per attachment. Used to store email metadata (sender, subject, body) for audit trail and sender identification.';

COMMENT ON COLUMN public.email_submissions.id IS
'Primary key uniquely identifying this email ingestion event. One-to-one relationship with submissions table - same ID typically used. Used for tracing documents back to source email.';

COMMENT ON COLUMN public.email_submissions.message_id IS
'Unique email Message-ID header from email server. Used for deduplication (ignore duplicate forwarded emails) and email threading. Format: <alphanumeric@domain>. Never NULL - email without Message-ID is rejected.';

COMMENT ON COLUMN public.email_submissions.sender_email IS
'Email address of person who sent the email (From: header). Used for sender identity tracking and allowlist validation (future feature). Not used for authentication - anyone can send to intake address currently.';

COMMENT ON COLUMN public.email_submissions.received_at IS
'Timestamp when email was received by forwarding service. Extracted from email Received: header or server timestamp. Used for chronological ordering and SLA monitoring (time from email received to processing complete).';

COMMENT ON COLUMN public.email_submissions.subject IS
'Email subject line. Used for applicant company name extraction via regex (e.g., Application for ABC Company) and email threading in UI. NULL if subject line empty.';

COMMENT ON COLUMN public.email_submissions.body_text IS
'Plain text email body (HTML stripped). Used for human review and potential future NLP extraction of unstructured data (e.g., loan officer notes in email). NULL if email body empty. Large field - can be 10KB+ for long emails.';

COMMENT ON COLUMN public.email_submissions.attachment_count IS
'Number of file attachments in email. Used for validation (reject emails with 0 attachments or >50 attachments). Matches number of documents created with same submission_id. Default 0 for emails without attachments.';

COMMENT ON COLUMN public.email_submissions.processed IS
'Boolean flag indicating whether email has been fully processed (all attachments extracted and queued). FALSE = processing in progress, TRUE = complete. Used for idempotency (prevent reprocessing same email on duplicate webhook calls).';

COMMENT ON COLUMN public.email_submissions.created_at IS
'Timestamp when email_submission record was created in database. Set via DEFAULT now() on INSERT. May differ slightly from received_at due to webhook latency.';

COMMENT ON COLUMN public.email_submissions.org_id IS
'Foreign key to organizations. Parsed from email TO: address (e.g., org_uuid@emailforwarding.clearscrub.io extracts org UUID). Used for RLS isolation and routing email to correct org. NOT NULL enforces valid org email addresses.';

COMMENT ON COLUMN public.email_submissions.submission_id IS
'Foreign key to submissions linking this email to the ingestion event record. Enables joining email metadata with document processing status. NOT NULL enforces that every email must create a submission.';

-- =====================================================================
-- TABLE 8: accounts (10 columns)
-- =====================================================================

COMMENT ON TABLE public.accounts IS
'Bank accounts belonging to applicant companies. Extracted from bank statement headers or manually entered. One company can have multiple accounts (checking, savings, merchant accounts). Account numbers stored in masked format (last 4 digits only) for PCI compliance. Referenced by statements table for statement-to-account relationship.';

COMMENT ON COLUMN public.accounts.id IS
'Primary key uniquely identifying this bank account. Referenced by statements.account_id for statement-to-account linking. UUID enables distributed generation.';

COMMENT ON COLUMN public.accounts.company_id IS
'Foreign key to companies establishing which business owns this account. NOT NULL enforces that every account must belong to a company. Used for company-scoped account listing in dashboard.';

COMMENT ON COLUMN public.accounts.bank_name IS
'Financial institution name extracted from statement header or manually entered. Free-form text - not normalized to bank code. Examples: Chase, Bank of America, Wells Fargo. Used for UI display and fraud detection (inconsistent bank names across statements).';

COMMENT ON COLUMN public.accounts.account_type IS
'Account classification extracted from statement or manually entered. Common values: checking, savings, merchant, credit_card, line_of_credit. Free-form text currently. Used for cashflow analysis (checking = operating account, savings = reserves). Future: standardize to controlled vocabulary.';

COMMENT ON COLUMN public.accounts.account_number_masked IS
'Last 4 digits of account number (e.g., **1234). Extracted from statement footer or manually entered. Used for account identification without exposing full PAN (PCI compliance). NOT UNIQUE - same last 4 can exist across different banks.';

COMMENT ON COLUMN public.accounts.routing_number_masked IS
'Last 4 digits of bank routing number (e.g., **5678). Extracted from statement or manually entered. Used for bank identification without exposing full routing number. NULL if not provided on statement.';

COMMENT ON COLUMN public.accounts.is_primary IS
'Boolean flag indicating primary operating account for cashflow analysis. TRUE = main checking account used for revenue deposits and operating expenses. FALSE = secondary accounts (savings, merchant, backup). Only one account per company should be primary. Used for dashboard summary calculations.';

COMMENT ON COLUMN public.accounts.status IS
'Account status from most recent statement. Values: active (normal operation), inactive (no recent transactions), closed (account closed per statement). Used to filter out closed accounts from analysis. Updated manually or from statement metadata.';

COMMENT ON COLUMN public.accounts.notes IS
'Free-form text notes entered by underwriters during manual review. NULL initially. Used for internal communication about account context (e.g., seasonal account, merchant account for specific product line, account used for fraud).';

COMMENT ON COLUMN public.accounts.created_at IS
'Timestamp when account record was created in database. Set via DEFAULT now() on INSERT. Used for account history tracking and audit trail.';

COMMENT ON COLUMN public.accounts.updated_at IS
'Timestamp of last modification to account record. Updated via trigger on any column change. Tracks data enrichment (e.g., status updates from new statements).';

-- =====================================================================
-- TABLE 9: statements (28 columns)
-- =====================================================================

COMMENT ON TABLE public.statements IS
'Monthly bank statement summaries with calculated financial metrics and raw transaction data. One statement per account per month. Aggregate columns (total_deposits, true_revenue, etc.) are pre-calculated at ingest from raw_transactions for performance - NOT redundant. These audited metrics enable reconciliation against bank-reported totals and fast dashboard queries without transaction-level aggregation.';

COMMENT ON COLUMN public.statements.id IS
'Primary key uniquely identifying this statement. Referenced by dashboard queries for statement detail view. UUID enables distributed generation.';

COMMENT ON COLUMN public.statements.document_id IS
'Foreign key to documents linking this statement to source PDF file. Enables tracing statement data back to original uploaded document for audit trail. NOT NULL enforces that every statement must come from a document.';

COMMENT ON COLUMN public.statements.account_id IS
'Foreign key to accounts linking this statement to a bank account. Enables account-level aggregation and multi-account analysis per company. NOT NULL enforces that every statement must belong to an account.';

COMMENT ON COLUMN public.statements.company_id IS
'Foreign key to companies. Denormalized from accounts.company_id for query performance (avoids JOIN for company-scoped statement queries). NOT NULL. CRITICAL: must match accounts.company_id for data consistency - enforce via application logic or trigger.';

COMMENT ON COLUMN public.statements.statement_period_start IS
'First day of statement period (inclusive). Extracted from statement header. Format: YYYY-MM-DD. Used for month-level aggregation and gap detection (missing statement months). NOT NULL - reject statements without period.';

COMMENT ON COLUMN public.statements.statement_period_end IS
'Last day of statement period (inclusive). Extracted from statement header. Format: YYYY-MM-DD. Typically last day of month but varies by bank (some use 4-week periods). Used for month-level aggregation and period length validation. NOT NULL.';

COMMENT ON COLUMN public.statements.statement_date IS
'Statement generation/issue date printed on statement. Typically 1-3 days after period_end. Format: YYYY-MM-DD. Used for chronological ordering when period dates are ambiguous. Can be NULL if not extractable.';

COMMENT ON COLUMN public.statements.opening_balance IS
'Account balance at start of statement period. Extracted from statement header. Used for reconciliation validation (previous closing_balance should match current opening_balance). NULL if not provided on statement.';

COMMENT ON COLUMN public.statements.closing_balance IS
'Account balance at end of statement period. Extracted from statement header. CRITICAL for cashflow analysis - ending balance validates transaction extraction completeness (opening + deposits - withdrawals = closing). NULL if not provided on statement.';

COMMENT ON COLUMN public.statements.total_deposits IS
'Sum of all deposit transactions (positive cashflow) from raw_transactions array. Pre-calculated at ingest for performance - enables fast dashboard queries without aggregating 1000+ transactions. Audited metric: compared against bank-reported total deposits when available. NULL if calculation fails.';

COMMENT ON COLUMN public.statements.total_withdrawals IS
'Sum of all withdrawal transactions (negative cashflow) from raw_transactions array. Pre-calculated at ingest for performance. Stored as positive number (e.g., 5000 for $5000 in withdrawals). Audited metric: compared against bank-reported total withdrawals. NULL if calculation fails.';

COMMENT ON COLUMN public.statements.average_daily_balance IS
'Average account balance across statement period calculated from daily balance values in raw_transactions. Used for revenue-to-balance ratio analysis (velocity of money). Pre-calculated for performance. NULL if daily balances not available on statement.';

COMMENT ON COLUMN public.statements.true_revenue IS
'Calculated genuine business revenue (deposits minus transfers, loan proceeds, returns, owner injections). Extracted using rule-based classification in processing pipeline. CRITICAL for underwriting - applicant-reported revenue validation. Pre-calculated for performance. NULL if classification fails.';

COMMENT ON COLUMN public.statements.true_revenue_count IS
'Number of transactions classified as true revenue (subset of total deposits). Used for revenue concentration analysis (few large deposits = higher risk than many small deposits). Pre-calculated for performance. Default 0 if no revenue transactions.';

COMMENT ON COLUMN public.statements.total_non_revenue IS
'Sum of non-revenue deposits (transfers, loan proceeds, returns, owner capital injections). Calculated as total_deposits minus true_revenue. Used for cashflow quality scoring. Pre-calculated for performance. NULL if classification fails.';

COMMENT ON COLUMN public.statements.non_revenue_count IS
'Number of transactions classified as non-revenue deposits. Used with true_revenue_count for deposit composition analysis. Pre-calculated for performance. Default 0.';

COMMENT ON COLUMN public.statements.negative_balance_days IS
'Number of days account balance was negative (overdraft). Extracted from daily balance history in raw_transactions. RED FLAG for underwriting - indicates cashflow problems. Pre-calculated for performance. Default 0 for statements without negative balances.';

COMMENT ON COLUMN public.statements.nsf_count IS
'Number of Non-Sufficient Funds (NSF) fee transactions. Extracted by pattern matching fee descriptions in raw_transactions (e.g., NSF Fee, Insufficient Funds). RED FLAG for underwriting - indicates bounced checks/ACH. Pre-calculated for performance. Default 0.';

COMMENT ON COLUMN public.statements.nsf_total_amount IS
'Total dollar amount of NSF fees charged. Sum of NSF transaction amounts from raw_transactions. Used for fee burden analysis and risk scoring. Pre-calculated for performance. Default 0 if no NSF fees.';

COMMENT ON COLUMN public.statements.transaction_count IS
'Total number of transactions in raw_transactions array. Used for activity level analysis (very low transaction count = inactive business or incomplete extraction). Pre-calculated for performance. Default 0 for empty statements.';

COMMENT ON COLUMN public.statements.largest_deposit IS
'Single largest deposit transaction amount from raw_transactions. Used for concentration risk analysis (one large deposit = high customer concentration). Pre-calculated for performance. NULL if no deposits.';

COMMENT ON COLUMN public.statements.largest_withdrawal IS
'Single largest withdrawal transaction amount from raw_transactions. Used for expense concentration analysis and owner draw detection. Pre-calculated for performance. NULL if no withdrawals.';

COMMENT ON COLUMN public.statements.reconciliation_difference IS
'Discrepancy between calculated balance (opening + deposits - withdrawals) and bank-reported closing balance. Should be $0.00 for perfect extraction. Non-zero values indicate extraction errors or missing transactions. Audited metric for extraction quality. NULL if reconciliation not performed.';

COMMENT ON COLUMN public.statements.anomaly_score IS
'Machine learning score (0.0 to 1.0) indicating unusual activity patterns. High scores (>0.8) flag potential fraud or data quality issues. Examples: sudden 10x revenue spike, negative balance for entire period, deposit patterns inconsistent with industry. NULL if anomaly detection not run.';

COMMENT ON COLUMN public.statements.data_quality_score IS
'Overall extraction quality score (0.0 to 1.0) based on completeness and confidence metrics. Factors: OCR confidence, field extraction completeness, reconciliation accuracy, transaction count vs page count. Low scores (<0.7) trigger manual review. NULL if quality scoring not run.';

COMMENT ON COLUMN public.statements.raw_transactions IS
'Full transaction array extracted from statement in JSONB format following bank_schema_v3.json structure. Each transaction: {date, description, amount, balance, category, is_revenue}. Used for transaction-level drill-down in dashboard, re-aggregation with different rules, and extraction audit. LARGE field - can be 100KB+ for high-volume accounts. Never delete - permanent audit trail.';

COMMENT ON COLUMN public.statements.created_at IS
'Timestamp when statement record was created in database. Set via DEFAULT now() on INSERT. Used for processing latency monitoring and chronological ordering.';

COMMENT ON COLUMN public.statements.updated_at IS
'Timestamp of last modification to statement record. Updated via trigger on any column change. Tracks reprocessing events (e.g., improved transaction classification applied to existing statements).';

COMMENT ON COLUMN public.statements.submission_id IS
'Foreign key to submissions linking this statement to the ingestion event. Enables tracing statement back to upload/email/API call that provided the source document. NOT NULL enforces ingestion audit trail.';

-- =====================================================================
-- TABLE 10: api_keys (9 columns)
-- =====================================================================

COMMENT ON TABLE public.api_keys IS
'Partner API authentication tokens for programmatic document submission. Each user can generate multiple API keys (live vs test, per-integration). Keys stored as bcrypt hashes for security - plaintext key shown only once at creation. Used by submissions table to track API-based ingestion events.';

COMMENT ON COLUMN public.api_keys.id IS
'Primary key uniquely identifying this API key. Referenced by submissions.api_key_id to track which key was used for each API upload. UUID enables distributed generation.';

COMMENT ON COLUMN public.api_keys.user_id IS
'Foreign key to auth.users establishing key ownership. NOT NULL enforces that every API key must belong to a user. Used for RLS policies (users can only see/revoke their own keys) and usage tracking.';

COMMENT ON COLUMN public.api_keys.key_name IS
'Human-readable label for this key entered by user at creation. Examples: Production Integration, Staging Server, Partner X. Displayed in API Keys page for key identification. NOT unique - users can use duplicate names.';

COMMENT ON COLUMN public.api_keys.key_hash IS
'Bcrypt hash of API key value. Plaintext key never stored in database - only shown to user once at creation. Used for authentication: hash incoming API key and compare to stored hash. NOT NULL enforces secure storage pattern.';

COMMENT ON COLUMN public.api_keys.prefix IS
'Visible key prefix in format cs_live_XXXX or cs_test_XXXX (first 12 chars of key). Stored for key identification in logs and UI without exposing full key. Used for last-N-characters display in dashboard. NOT NULL and UNIQUE enforce one prefix per key.';

COMMENT ON COLUMN public.api_keys.last_used_at IS
'Timestamp when key was most recently used for successful API authentication. NULL if never used. Updated on every API call. Used for inactive key detection (revoke keys unused for 90+ days) and security monitoring.';

COMMENT ON COLUMN public.api_keys.created_at IS
'Timestamp when API key was generated. Set via DEFAULT now() on INSERT. Used for key age tracking and security audit (rotate keys older than 1 year).';

COMMENT ON COLUMN public.api_keys.expires_at IS
'Optional expiration date for key. NULL = never expires (default). Keys with expires_at < now() are rejected during authentication. Used for temporary partner access and security compliance (enforce key rotation).';

COMMENT ON COLUMN public.api_keys.is_active IS
'Boolean flag indicating whether key is active and can be used for authentication. TRUE = active, FALSE = revoked. Revoked keys fail authentication even if hash matches. Used for instant key revocation without deleting record (preserves usage history). Default TRUE.';

-- =====================================================================
-- TABLE 11: usage_logs (6 columns)
-- =====================================================================

COMMENT ON TABLE public.usage_logs IS
'API usage tracking for billing and quota enforcement. One log entry per billable action (document upload, extraction, API call). Used for monthly invoice generation, rate limiting, and usage analytics. Cost calculated based on subscription_tier pricing rules.';

COMMENT ON COLUMN public.usage_logs.id IS
'Primary key uniquely identifying this usage event. UUID enables distributed generation. Used for billing reconciliation and duplicate detection.';

COMMENT ON COLUMN public.usage_logs.user_id IS
'Foreign key to auth.users tracking which user performed the action. NOT NULL enforces user attribution. Used for user-level usage analytics and cost allocation in multi-user orgs.';

COMMENT ON COLUMN public.usage_logs.document_id IS
'Foreign key to documents linking this usage event to a specific document (for upload/process actions). NULL for non-document actions (API calls, exports). Used for per-document cost breakdown and audit trail.';

COMMENT ON COLUMN public.usage_logs.action IS
'Type of billable action performed. Values: upload (file upload to Storage), process (extraction run), export (data download), api_call (API endpoint hit). Determines cost calculation formula. NOT NULL enforces action classification.';

COMMENT ON COLUMN public.usage_logs.cost IS
'Calculated cost for this action in USD. Formula depends on action type and subscription_tier: upload (per MB), process (per page), api_call (per call), export (per record). Stored as numeric(10,2) for precision. Used for monthly invoice totals.';

COMMENT ON COLUMN public.usage_logs.metadata IS
'Additional context about usage event in JSONB format. Examples: {api_endpoint, response_time_ms}, {pages_processed, extraction_method}, {export_format, row_count}. Schema varies by action type. Used for detailed usage analytics and debugging billing issues.';

COMMENT ON COLUMN public.usage_logs.created_at IS
'Timestamp when usage event occurred. Set via DEFAULT now() on INSERT. Used for monthly billing periods, usage trend analysis, and rate limiting (e.g., max 1000 API calls per hour).';

-- =====================================================================
-- TABLE 12: webhook_catches (6 columns)
-- =====================================================================

COMMENT ON TABLE public.webhook_catches IS
'Debug table for capturing ALL webhook payloads sent to ClearScrub Edge Functions. Used for webhook debugging, payload inspection, and integration troubleshooting. NOT part of production data flow - purely diagnostic. Stores raw HTTP request data (body, headers, query params) for manual inspection.';

COMMENT ON COLUMN public.webhook_catches.id IS
'Primary key uniquely identifying this webhook catch event. UUID enables distributed generation. Used for chronological ordering and duplicate detection during debugging.';

COMMENT ON COLUMN public.webhook_catches.payload IS
'Full JSON body from webhook POST request. Stored as JSONB for querying specific fields during debugging. Example: Flow.io sends {document_id, extraction_results, status}. Large field - can be 100KB+ for extraction results. Never delete - debug history permanent.';

COMMENT ON COLUMN public.webhook_catches.headers IS
'HTTP headers from webhook request stored as JSONB. Keys lowercased for consistent querying. Used for authentication debugging (verify signature headers), content-type validation, and source identification. Example: {content-type: application/json, x-flow-signature: abc123}.';

COMMENT ON COLUMN public.webhook_catches.query_params IS
'URL query parameters from webhook request stored as JSONB. Example: /webhook?source=flow&test=true becomes {source: flow, test: true}. Used for routing logic debugging and test vs production differentiation. NULL if no query params.';

COMMENT ON COLUMN public.webhook_catches.metadata IS
'Additional debug context added by Edge Function. Examples: {edge_function: document-metadata, processing_time_ms: 1234, error_occurred: false}. Schema determined by Edge Function implementation. Used for performance monitoring and error debugging.';

COMMENT ON COLUMN public.webhook_catches.created_at IS
'Timestamp when webhook was received. Set via DEFAULT now() on INSERT. Used for chronological ordering, debugging latency issues (compare to external webhook sent timestamp), and retention cleanup (delete catches older than 30 days).';

-- =====================================================================
-- SUMMARY
-- =====================================================================
-- Total tables documented: 12
-- Total columns documented: 177
--
-- Column count by table:
-- 1. organizations: 8 columns
-- 2. profiles: 9 columns
-- 3. submissions: 10 columns
-- 4. companies: 16 columns
-- 5. applications: 27 columns
-- 6. documents: 25 columns
-- 7. email_submissions: 9 columns
-- 8. accounts: 10 columns
-- 9. statements: 28 columns
-- 10. api_keys: 9 columns
-- 11. usage_logs: 6 columns
-- 12. webhook_catches: 6 columns
-- =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

/**
 * Edge Function: upload-documents
 *
 * Purpose: Orchestrates file upload → processing pipeline for manual document uploads
 *
 * Flow:
 * 1. Validate JWT and extract org_id from user profile
 * 2. Parse multipart form data (files array)
 * 3. Create submission record to track this upload batch
 * 4. For each file:
 *    a. Upload to Supabase Storage (incoming-documents bucket)
 *    b. Create document record with status='uploaded'
 *    c. Manually invoke document-metadata function for processing
 * 5. Return 202 Accepted with submission/document IDs
 *
 * Auth: JWT required (Authorization: Bearer {token})
 * Method: POST with multipart/form-data
 *
 * Response: 202 Accepted (async processing initiated)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

interface UploadResult {
  id: string;
  filename: string;
  status: 'uploaded' | 'failed';
  processing_initiated: boolean;
  error?: string;
}

interface ErrorResponse {
  code: string;
  message: string;
  status?: number;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Validate HTTP method
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({
        error: {
          code: 'method_not_allowed',
          message: 'Only POST method is allowed',
          details: { allowed_methods: ['POST'] }
        }
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  try {
    // =====================================================
    // STEP 1: JWT VALIDATION & ORG_ID EXTRACTION
    // =====================================================

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw {
        code: 'unauthorized',
        message: 'Missing Authorization header',
        status: 401
      } as ErrorResponse;
    }

    // Create Supabase client with JWT for RLS enforcement
    const supabaseJWT = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    // Extract user from JWT
    const { data: { user }, error: userError } = await supabaseJWT.auth.getUser();

    if (userError || !user) {
      console.error('JWT validation failed:', userError);
      throw {
        code: 'unauthorized',
        message: 'Invalid or expired JWT token',
        status: 401
      } as ErrorResponse;
    }

    // Get org_id from user profile (required for multi-tenant isolation)
    const { data: profile, error: profileError } = await supabaseJWT
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.org_id) {
      console.error('Profile lookup failed:', profileError);
      throw {
        code: 'unauthorized',
        message: 'User profile not found or missing org_id',
        status: 401
      } as ErrorResponse;
    }

    const orgId = profile.org_id;
    console.log(`Processing upload for org_id: ${orgId}, user_id: ${user.id}`);

    // =====================================================
    // STEP 2: PARSE MULTIPART FORM DATA
    // =====================================================

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (parseError: any) {
      console.error('Form data parsing failed:', parseError);
      throw {
        code: 'invalid_form_data',
        message: 'Failed to parse multipart form data',
        status: 400
      } as ErrorResponse;
    }

    // Extract files from form data
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      throw {
        code: 'no_files',
        message: 'No files provided in request',
        status: 400
      } as ErrorResponse;
    }

    console.log(`Received ${files.length} file(s) for upload`);

    // =====================================================
    // STEP 3: CREATE SUBMISSION RECORD
    // =====================================================

    // Use service_role_key for database writes (bypass RLS for admin operations)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { data: submission, error: submissionError } = await supabaseAdmin
      .from('submissions')
      .insert({
        org_id: orgId,
        user_id: user.id,
        ingestion_method: 'dashboard',
        metadata: {
          upload_timestamp: new Date().toISOString(),
          file_names: files.map(f => f.name)
        }
      })
      .select('id')
      .single();

    if (submissionError || !submission) {
      console.error('Submission creation failed:', submissionError);
      throw {
        code: 'submission_failed',
        message: 'Failed to create submission record',
        status: 500
      } as ErrorResponse;
    }

    const submissionId = submission.id;
    console.log(`Created submission: ${submissionId}`);

    // =====================================================
    // STEP 4: PROCESS EACH FILE
    // =====================================================

    const results: UploadResult[] = [];

    for (const file of files) {
      const fileStartTime = Date.now();

      try {
        console.log(`Processing file: ${file.name} (${file.size} bytes, ${file.type})`);

        // Generate unique storage path: org_id/submission_id/timestamp_filename
        const timestamp = Date.now();
        const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${orgId}/${submissionId}/${timestamp}_${safeFilename}`;

        // Upload file to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('incoming-documents')
          .upload(storagePath, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
          });

        if (uploadError) {
          console.error(`Storage upload failed for ${file.name}:`, uploadError);
          results.push({
            id: '',
            filename: file.name,
            status: 'failed',
            processing_initiated: false,
            error: uploadError.message
          });
          continue;
        }

        console.log(`Uploaded to storage: ${storagePath}`);

        // Create document record
        const { data: document, error: documentError } = await supabaseAdmin
          .from('documents')
          .insert({
            submission_id: submissionId,
            file_path: storagePath,
            filename: file.name,
            file_size_bytes: file.size,
            mime_type: file.type || 'application/octet-stream',
            status: 'uploaded',
            metadata: {
              original_filename: file.name,
              upload_timestamp: new Date().toISOString(),
              storage_path: storagePath
            }
          })
          .select('id')
          .single();

        if (documentError || !document) {
          console.error(`Document record creation failed for ${file.name}:`, documentError);
          results.push({
            id: '',
            filename: file.name,
            status: 'failed',
            processing_initiated: false,
            error: 'Failed to create document record'
          });
          continue;
        }

        const documentId = document.id;
        console.log(`Created document record: ${documentId}`);

        // =====================================================
        // STEP 5: INVOKE document-metadata FUNCTION
        // =====================================================

        // Build storage event payload (mimics trigger format)
        const metadataPayload = {
          type: 'INSERT',
          record: {
            name: storagePath,
            bucket_id: 'incoming-documents',
            created_at: new Date().toISOString(),
            metadata: {
              mimetype: file.type || 'application/pdf'
            }
          }
        };

        // Fire-and-forget webhook to document-metadata function
        // Don't await - processing happens asynchronously
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/document-metadata`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(metadataPayload)
        }).catch(err => {
          console.error(`document-metadata invocation failed for ${file.name}:`, err);
        });

        const fileProcessTime = Date.now() - fileStartTime;
        console.log(`File processed successfully in ${fileProcessTime}ms: ${file.name}`);

        results.push({
          id: documentId,
          filename: file.name,
          status: 'uploaded',
          processing_initiated: true
        });

      } catch (fileError: any) {
        console.error(`Unexpected error processing file ${file.name}:`, fileError);
        results.push({
          id: '',
          filename: file.name,
          status: 'failed',
          processing_initiated: false,
          error: fileError.message || 'Unknown error'
        });
      }
    }

    // =====================================================
    // STEP 6: RETURN 202 ACCEPTED
    // =====================================================

    const successCount = results.filter(r => r.status === 'uploaded').length;
    const failureCount = results.filter(r => r.status === 'failed').length;

    console.log(`Upload complete: ${successCount} succeeded, ${failureCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        submissions: [{
          id: submissionId,
          documents: results
        }],
        summary: {
          total_files: files.length,
          successful: successCount,
          failed: failureCount
        }
      }),
      {
        status: 202,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error: any) {
    console.error('upload-documents error:', error);

    const status = error.status || 500;
    const code = error.code || 'upload_failed';
    const message = error.message || 'Failed to upload documents';

    return new Response(
      JSON.stringify({
        error: {
          code,
          message,
          details: {}
        }
      }),
      {
        status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});

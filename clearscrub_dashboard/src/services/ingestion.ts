import { supabase } from '@/lib/supabaseClient';
import { withTimeout, fetchWithTimeout, TIMEOUT_MS } from '../lib/utils';

export interface PreparedSubmission {
  submission_id: string;
  org_id: string;
  files_total: number;
  file_maps: Array<{
    file_name: string;
    file_path: string;
    file_id: string;
  }>;
}

/**
 * Prepare a submission by calling the database RPC
 * Creates submission + files records in database
 */
export async function prepareSubmission(
  files: Array<{ name: string; size: number; type: string }>
): Promise<PreparedSubmission> {
  const { data, error } = await withTimeout(
    supabase.rpc('prepare_submission', {
      p_files: files,
    }),
    TIMEOUT_MS.SUPABASE_QUERY,
    'prepareSubmission'
  );

  if (error) throw new Error(`Failed to prepare submission: ${error.message}`);
  return data as PreparedSubmission;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

/**
 * Upload a file to Supabase Storage
 * Uses the 'documents' bucket
 */
export async function uploadFileToStorage(
  file: File,
  filePath: string,
  onProgress: (progress: UploadProgress) => void
): Promise<void> {
  // Get JWT token from session
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) {
    throw new Error('No authentication token available');
  }

  // Upload to Supabase Storage - using 'documents' bucket
  const { error } = await withTimeout(
    supabase.storage
      .from('documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      }),
    TIMEOUT_MS.STORAGE_UPLOAD,
    'uploadFileToStorage'
  );

  if (error) throw new Error(`Upload failed: ${error.message}`);

  // Simulate progress updates (Supabase client doesn't expose onUploadProgress in browser)
  onProgress({ loaded: file.size, total: file.size, percent: 100 });
}

/**
 * Trigger document processing via Edge Function
 * Calls 'process-document' which handles classification and extraction
 */
export async function triggerDocumentProcessing(fileId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) {
    throw new Error('No authentication token available');
  }

  const token = sessionData.session.access_token;

  const response = await fetchWithTimeout(
    'https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/process-document',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ file_id: fileId }),
    },
    TIMEOUT_MS.EDGE_FUNCTION
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to trigger processing: ${error.error || response.statusText}`);
  }

  return response.json();
}

// Keep old function name as alias for backwards compatibility
export const enqueueDocumentProcessing = triggerDocumentProcessing;

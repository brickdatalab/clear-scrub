import { supabase } from '@/lib/supabaseClient';
import { withTimeout, fetchWithTimeout, TIMEOUT_MS } from '../lib/utils';

export interface PreparedSubmission {
  submission_id: string;
  org_id: string;
  file_maps: Array<{
    file_name: string;
    file_path: string;
    doc_id: string;
  }>;
}

/**
 * Prepare a submission by calling the database RPC
 * Protected with timeout to prevent infinite loading
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
 * Protected with storage upload timeout
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

  // Upload to Supabase Storage with timeout protection
  const { error } = await withTimeout(
    supabase.storage
      .from('incoming-documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      }),
    TIMEOUT_MS.STORAGE_UPLOAD,
    'uploadFileToStorage'
  );

  if (error) throw new Error(`Upload failed: ${error.message}`);

  // Simulate progress updates (Supabase client doesn't expose onUploadProgress in browser)
  // For real progress tracking, we'd need to use XMLHttpRequest directly
  onProgress({ loaded: file.size, total: file.size, percent: 100 });
}

/**
 * Enqueue a document for processing via Edge Function
 * Protected with edge function timeout using fetchWithTimeout
 */
export async function enqueueDocumentProcessing(docId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) {
    throw new Error('No authentication token available');
  }

  const token = sessionData.session.access_token;

  const response = await fetchWithTimeout(
    'https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/enqueue-document-processing',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ doc_id: docId }),
    },
    TIMEOUT_MS.EDGE_FUNCTION
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to enqueue processing: ${error.error || response.statusText}`);
  }

  return response.json();
}

import { supabase } from '@/lib/supabaseClient';

export interface PreparedSubmission {
  submission_id: string;
  org_id: string;
  file_maps: Array<{
    file_name: string;
    file_path: string;
    doc_id: string;
  }>;
}

export async function prepareSubmission(
  files: Array<{ name: string; size: number; type: string }>
): Promise<PreparedSubmission> {
  const { data, error } = await supabase.rpc('prepare_submission', {
    p_files: files,
  });

  if (error) throw new Error(`Failed to prepare submission: ${error.message}`);
  return data as PreparedSubmission;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

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

  // Upload to Supabase Storage
  const { error } = await supabase.storage
    .from('incoming-documents')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  // Simulate progress updates (Supabase client doesn't expose onUploadProgress in browser)
  // For real progress tracking, we'd need to use XMLHttpRequest directly
  onProgress({ loaded: file.size, total: file.size, percent: 100 });
}

export async function enqueueDocumentProcessing(docId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) {
    throw new Error('No authentication token available');
  }

  const token = sessionData.session.access_token;

  const response = await fetch(
    'https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/enqueue-document-processing',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ doc_id: docId }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to enqueue processing: ${error.error || response.statusText}`);
  }

  return response.json();
}

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dropzone } from '@/components/ui/dropzone';
import { X, AlertCircle, CheckCircle, Upload } from 'lucide-react';
import { prepareSubmission, uploadFileToStorage, triggerDocumentProcessing, UploadProgress } from '@/services/ingestion';

interface FileWithProgress {
  file: File;
  fileId?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

interface AddCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddCompanyModal({ isOpen, onClose, onSuccess }: AddCompanyModalProps) {
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleFilesAdded = (newFiles: File[]) => {
    const filesWithProgress = newFiles.map(file => ({
      file,
      progress: 0,
      status: 'pending' as const,
    }));
    setFiles(prev => [...prev, ...filesWithProgress]);
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const resetModal = () => {
    setFiles([]);
    setCompanyName('');
    setSubmitError(null);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setSubmitError('Please select at least one file');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Step 1: Prepare submission and get file paths
      const fileMetadata = files.map(f => ({
        name: f.file.name,
        size: f.file.size,
        type: f.file.type,
      }));

      const prepared = await prepareSubmission(fileMetadata);
      console.log('[AddCompanyModal] Submission prepared:', prepared.submission_id);

      // Step 2: Upload each file and trigger processing
      const updatedFiles = [...files];
      
      for (let i = 0; i < files.length; i++) {
        try {
          // Mark as uploading
          updatedFiles[i].status = 'uploading';
          setFiles([...updatedFiles]);

          const fileMap = prepared.file_maps[i];
          updatedFiles[i].fileId = fileMap.file_id;

          // Upload file to storage
          await uploadFileToStorage(files[i].file, fileMap.file_path, (progress: UploadProgress) => {
            updatedFiles[i].progress = progress.percent;
            setFiles([...updatedFiles]);
          });

          // Mark as processing
          updatedFiles[i].status = 'processing';
          updatedFiles[i].progress = 100;
          setFiles([...updatedFiles]);

          // Step 3: Trigger document processing pipeline
          console.log(`[AddCompanyModal] Triggering processing for file: ${fileMap.file_id}`);
          await triggerDocumentProcessing(fileMap.file_id);

          // Mark as complete
          updatedFiles[i].status = 'complete';
          setFiles([...updatedFiles]);
          console.log(`[AddCompanyModal] File ${i + 1}/${files.length} complete`);

        } catch (err) {
          console.error(`[AddCompanyModal] Error processing file ${i}:`, err);
          updatedFiles[i].status = 'error';
          updatedFiles[i].error = err instanceof Error ? err.message : 'Unknown error';
          setFiles([...updatedFiles]);
        }
      }

      // Check if all files completed successfully
      const allComplete = updatedFiles.every(f => f.status === 'complete');
      const anyComplete = updatedFiles.some(f => f.status === 'complete');

      if (allComplete) {
        console.log('[AddCompanyModal] All files processed successfully');
        setTimeout(() => {
          onClose();
          resetModal();
          onSuccess?.();
        }, 1000);
      } else if (anyComplete) {
        console.log('[AddCompanyModal] Some files completed, some failed');
        // Keep modal open to show errors
      }

    } catch (err) {
      console.error('[AddCompanyModal] Upload error:', err);
      const message = err instanceof Error ? err.message : 'Upload failed';
      setSubmitError(message);
      setFiles(prev => prev.map(f => ({
        ...f,
        status: 'error' as const,
        error: message,
      })));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
      resetModal();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Error Alert */}
          {submitError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {/* Company Name (Optional) */}
          <div className="space-y-2">
            <label htmlFor="company-name" className="text-sm font-medium">
              Company Name (Optional)
            </label>
            <Input
              id="company-name"
              placeholder="Leave blank to auto-detect from documents"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={isSubmitting}
              aria-label="Company name"
            />
            <p className="text-xs text-slate-500">
              Company name will be extracted automatically from loan applications
            </p>
          </div>

          {/* Dropzone */}
          <div>
            <Dropzone
              onFilesAdded={handleFilesAdded}
              disabled={isSubmitting}
              accept={{ 'application/pdf': ['.pdf'] }}
              maxFiles={10}
              maxSize={50 * 1024 * 1024} // 50MB
              aria-label="Drop PDF files here or click to select"
            />
          </div>

          {/* File List with Progress */}
          {files.length > 0 && (
            <div className="space-y-3 border rounded-lg p-4 bg-slate-50">
              <p className="text-sm font-medium">Files to Upload ({files.length})</p>
              {files.map((fileItem, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm truncate flex-1">{fileItem.file.name}</span>
                    {fileItem.status === 'complete' && (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                    {fileItem.status === 'error' && (
                      <X className="h-4 w-4 text-red-600" />
                    )}
                    {!['complete', 'error'].includes(fileItem.status) && (
                      <button
                        onClick={() => handleRemoveFile(index)}
                        disabled={fileItem.status === 'uploading' || fileItem.status === 'processing'}
                        className="p-1 hover:bg-slate-200 rounded disabled:opacity-50"
                        aria-label={`Remove ${fileItem.file.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <Progress value={fileItem.progress} className="h-2" />
                  {fileItem.error && (
                    <p className="text-xs text-red-600">{fileItem.error}</p>
                  )}
                  {fileItem.status !== 'error' && (
                    <p className="text-xs text-slate-500">
                      {fileItem.status === 'uploading' && `Uploading... ${fileItem.progress}%`}
                      {fileItem.status === 'processing' && 'Processing document...'}
                      {fileItem.status === 'complete' && 'Complete'}
                      {fileItem.status === 'pending' && 'Ready to upload'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={files.length === 0 || isSubmitting}
              className="gap-2"
              aria-label="Upload files"
            >
              <Upload className="h-4 w-4" />
              {isSubmitting ? 'Processing...' : 'Upload & Process'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

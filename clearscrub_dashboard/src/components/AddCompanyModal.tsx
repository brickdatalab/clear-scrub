import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dropzone } from '@/components/ui/dropzone';
import { X, AlertCircle, CheckCircle, Upload } from 'lucide-react';
import { prepareSubmission, uploadFileToStorage, enqueueDocumentProcessing, UploadProgress } from '@/services/ingestion';

interface FileWithProgress {
  file: File;
  docId?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

export function AddCompanyModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
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

      // Step 2: Upload each file and enqueue processing
      const updatedFiles = [...files];
      for (let i = 0; i < files.length; i++) {
        try {
          updatedFiles[i].status = 'uploading';
          setFiles([...updatedFiles]);

          const fileMap = prepared.file_maps[i];
          updatedFiles[i].docId = fileMap.doc_id;

          // Upload file
          await uploadFileToStorage(files[i].file, fileMap.file_path, (progress: UploadProgress) => {
            updatedFiles[i].progress = progress.percent;
            setFiles([...updatedFiles]);
          });

          updatedFiles[i].status = 'processing';
          updatedFiles[i].progress = 100;
          setFiles([...updatedFiles]);

          // Step 3: Enqueue for processing
          await enqueueDocumentProcessing(fileMap.doc_id);

          updatedFiles[i].status = 'complete';
          setFiles([...updatedFiles]);
        } catch (err) {
          updatedFiles[i].status = 'error';
          updatedFiles[i].error = err instanceof Error ? err.message : 'Unknown error';
          setFiles([...updatedFiles]);
        }
      }

      // Close modal after successful upload
      if (updatedFiles.every(f => f.status === 'complete')) {
        setTimeout(() => {
          onClose();
          setFiles([]);
          setCompanyName('');
        }, 1000);
      }
    } catch (err) {
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Company Statement</DialogTitle>
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
              placeholder="Enter company name or leave blank to auto-detect from documents"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={isSubmitting}
              aria-label="Company name"
            />
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
                        className="p-1 hover:bg-slate-200 rounded"
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
                      {fileItem.status === 'processing' && 'Queuing for processing...'}
                      {fileItem.status === 'complete' && 'Upload complete'}
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
              onClick={onClose}
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
              {isSubmitting ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

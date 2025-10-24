import React, { useState, useCallback, useRef } from 'react'
import { Upload, X, FileText, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { api } from '../services/api'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

interface UploadedFile {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
}

export default function UploadDocuments() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Validate file is a PDF
  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Check file type
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return { valid: false, error: 'Only PDF files are allowed' }
    }

    // Check file size (max 50MB)
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      return { valid: false, error: 'File size must be less than 50MB' }
    }

    return { valid: true }
  }

  // Handle file selection
  const handleFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return

    const fileArray = Array.from(newFiles)
    const validatedFiles: UploadedFile[] = []

    fileArray.forEach((file) => {
      const validation = validateFile(file)

      validatedFiles.push({
        id: `${Date.now()}-${Math.random()}`,
        file,
        status: validation.valid ? 'pending' : 'error',
        progress: 0,
        error: validation.error
      })
    })

    setFiles((prev) => [...prev, ...validatedFiles])
  }, [])

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  // File input change handler
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files)
  }, [handleFiles])

  // Remove file from list
  const removeFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
  }, [])

  // Clear all files
  const clearAll = useCallback(() => {
    setFiles([])
  }, [])

  // Upload files to backend
  const uploadFiles = async () => {
    const filesToUpload = files.filter((f) => f.status === 'pending')

    if (filesToUpload.length === 0) return

    setIsUploading(true)

    // Update all pending files to uploading
    setFiles((prev) =>
      prev.map((f) =>
        f.status === 'pending' ? { ...f, status: 'uploading', progress: 0 } : f
      )
    )

    try {
      // Simulate progress (since Edge Function doesn't support streaming progress)
      const progressInterval = setInterval(() => {
        setFiles((prev) =>
          prev.map((f) =>
            f.status === 'uploading' && f.progress < 90
              ? { ...f, progress: Math.min(f.progress + 10, 90) }
              : f
          )
        )
      }, 200)

      // Call Edge Function
      const fileObjects = filesToUpload.map((f) => f.file)
      const response = await api.uploadDocumentsViaEdgeFunction(fileObjects)

      clearInterval(progressInterval)

      // Update file statuses based on response
      if (response.success) {
        setFiles((prev) =>
          prev.map((f) => {
            if (f.status === 'uploading') {
              const uploadResult = response.submissions[0]?.documents.find(
                (d: any) => d.filename === f.file.name
              )

              if (uploadResult?.status === 'uploaded') {
                return { ...f, status: 'success', progress: 100 }
              } else {
                return {
                  ...f,
                  status: 'error',
                  progress: 0,
                  error: uploadResult?.error || 'Upload failed'
                }
              }
            }
            return f
          })
        )
      }
    } catch (error) {
      console.error('Upload error:', error)

      // Mark all uploading files as error
      setFiles((prev) =>
        prev.map((f) =>
          f.status === 'uploading'
            ? {
                ...f,
                status: 'error',
                progress: 0,
                error: error instanceof Error ? error.message : 'Upload failed'
              }
            : f
        )
      )
    } finally {
      setIsUploading(false)
    }
  }

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const pendingFiles = files.filter((f) => f.status === 'pending' || f.status === 'uploading')
  const successFiles = files.filter((f) => f.status === 'success')
  const errorFiles = files.filter((f) => f.status === 'error')

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Upload Documents</h1>
        <p className="text-gray-600">
          Upload bank statements, loan applications, and other PDF documents for processing
        </p>
      </div>

      {/* Drop Zone Card */}
      <Card>
        <div
          className={`
            border-2 border-dashed rounded-lg p-12 text-center transition-colors
            ${isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400 bg-white'
            }
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Drop zone for file upload"
        >
          <Upload className={`mx-auto h-12 w-12 mb-4 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {isDragging ? 'Drop files here' : 'Drag and drop PDF files'}
          </h3>
          <p className="text-gray-600 mb-4">or</p>
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="default"
            
          >
            Browse Files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
            aria-label="File input for PDF uploads"
          />
          <p className="text-sm text-gray-500 mt-4">
            Maximum file size: 50MB per file
          </p>
        </div>
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <div className="space-y-6">
            {/* File List Header */}
            <div className="flex items-center justify-between border-b pb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Files ({files.length})
              </h2>
              <div className="flex gap-3">
                {files.length > 0 && (
                  <Button
                    onClick={clearAll}
                    disabled={isUploading}
                    variant="secondary"
                    
                  >
                    Clear All
                  </Button>
                )}
                {pendingFiles.length > 0 && (
                  <Button
                    onClick={uploadFiles}
                    disabled={isUploading}
                    variant="default"
                    
                    className="flex items-center gap-2"
                  >
                    {isUploading ? (
                      <>
                        <Loader className="h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Upload {pendingFiles.length} File{pendingFiles.length !== 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Summary Stats */}
            {(successFiles.length > 0 || errorFiles.length > 0) && (
              <div className="flex gap-4">
                {successFiles.length > 0 && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      {successFiles.length} successful
                    </span>
                  </div>
                )}
                {errorFiles.length > 0 && (
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      {errorFiles.length} failed
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Files List */}
            <ul className="space-y-3">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-lg"
                >
                  {/* Icon */}
                  <div className="flex-shrink-0">
                    {file.status === 'success' ? (
                      <CheckCircle className="h-8 w-8 text-green-500" />
                    ) : file.status === 'error' ? (
                      <AlertCircle className="h-8 w-8 text-red-500" />
                    ) : file.status === 'uploading' ? (
                      <Loader className="h-8 w-8 text-blue-500 animate-spin" />
                    ) : (
                      <FileText className="h-8 w-8 text-gray-400" />
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.file.name}
                      </p>
                      <span className="text-sm text-gray-500 ml-2">
                        {formatFileSize(file.file.size)}
                      </span>
                    </div>

                    {/* Progress Bar (only show when uploading) */}
                    {file.status === 'uploading' && (
                      <div className="mb-1">
                        <Progress value={file.progress} />
                      </div>
                    )}

                    {/* Status Text */}
                    <p className="text-xs text-gray-500">
                      {file.status === 'pending' && 'Ready to upload'}
                      {file.status === 'uploading' && `Uploading... ${file.progress}%`}
                      {file.status === 'success' && 'Upload complete'}
                      {file.status === 'error' && (
                        <span className="text-red-600">{file.error || 'Upload failed'}</span>
                      )}
                    </p>
                  </div>

                  {/* Remove Button */}
                  <Button
                    onClick={() => removeFile(file.id)}
                    disabled={file.status === 'uploading'}
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${file.file.name}`}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* Empty State */}
      {files.length === 0 && (
        <div className="mt-8 text-center text-gray-500">
          <p className="text-sm">No files selected</p>
        </div>
      )}
    </div>
  )
}

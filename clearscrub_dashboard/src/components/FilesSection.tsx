import React, { useState, useRef, useCallback } from 'react'
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import FilesTable from './FilesTable'
import { api } from '../services/api'

interface FilesSectionProps {
  companyId: string
}

interface UploadingFile {
  file: File
  progress: number
  status: 'uploading' | 'success' | 'error'
  error?: string
}

const FilesSection: React.FC<FilesSectionProps> = React.memo(({ companyId }) => {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return

    // Filter for PDF files only
    const pdfFiles = Array.from(files).filter(file => file.type === 'application/pdf')

    if (pdfFiles.length === 0) {
      alert('Please select PDF files only')
      return
    }

    // Add files to uploading state
    const newUploadingFiles: UploadingFile[] = pdfFiles.map(file => ({
      file,
      progress: 0,
      status: 'uploading'
    }))

    setUploadingFiles(prev => [...prev, ...newUploadingFiles])

    try {
      // Simulate progress (since Supabase doesn't provide real-time progress)
      const progressInterval = setInterval(() => {
        setUploadingFiles(prev => prev.map(uf => {
          if (uf.status === 'uploading' && uf.progress < 90) {
            return { ...uf, progress: uf.progress + 10 }
          }
          return uf
        }))
      }, 200)

      // Upload files
      await api.uploadDocuments(pdfFiles, companyId)

      clearInterval(progressInterval)

      // Mark all as success
      setUploadingFiles(prev => prev.map(uf => {
        if (newUploadingFiles.some(nuf => nuf.file === uf.file)) {
          return { ...uf, progress: 100, status: 'success' }
        }
        return uf
      }))

      // Clear success messages after 3 seconds and refresh table
      setTimeout(() => {
        setUploadingFiles(prev => prev.filter(uf => uf.status !== 'success'))
        setRefreshKey(prev => prev + 1)
      }, 3000)

    } catch (error) {
      console.error('Upload failed:', error)

      // Mark all as error
      setUploadingFiles(prev => prev.map(uf => {
        if (newUploadingFiles.some(nuf => nuf.file === uf.file)) {
          return {
            ...uf,
            progress: 0,
            status: 'error',
            error: error instanceof Error ? error.message : 'Upload failed'
          }
        }
        return uf
      }))
    }
  }, [companyId])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }, [handleFileSelect])

  const removeUploadingFile = useCallback((index: number) => {
    setUploadingFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  return (
    <Card title="Files">
      {/* Upload Zone */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-lg p-6 transition-colors duration-200 ${
            isDragging
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-300 bg-gray-50 hover:border-primary-400 hover:bg-primary-25'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            aria-label="Upload PDF files"
          />

          <div className="flex flex-col items-center justify-center text-center">
            <Upload className={`w-10 h-10 mb-3 ${isDragging ? 'text-primary-600' : 'text-gray-400'}`} />
            <p className="text-14 font-medium text-gray-700 mb-1">
              {isDragging ? 'Drop files here' : 'Drag and drop PDF files here'}
            </p>
            <p className="text-12 text-gray-500 mb-3">or</p>
            <Button
              type="button"
              variant="default"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse Files
            </Button>
            <p className="text-12 text-gray-500 mt-2">PDF files only, up to 10MB each</p>
          </div>
        </div>

        {/* Upload Progress */}
        {uploadingFiles.length > 0 && (
          <div className="mt-4 space-y-2">
            {uploadingFiles.map((uploadingFile, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg"
              >
                {uploadingFile.status === 'uploading' && (
                  <div className="flex-shrink-0">
                    <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {uploadingFile.status === 'success' && (
                  <CheckCircle className="flex-shrink-0 w-5 h-5 text-green-600" />
                )}
                {uploadingFile.status === 'error' && (
                  <AlertCircle className="flex-shrink-0 w-5 h-5 text-red-600" />
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-14 font-medium text-gray-900 truncate">
                    {uploadingFile.file.name}
                  </p>
                  {uploadingFile.status === 'uploading' && (
                    <div className="mt-1">
                      <Progress value={uploadingFile.progress} className="h-1.5" />
                    </div>
                  )}
                  {uploadingFile.status === 'success' && (
                    <p className="text-12 text-green-600 mt-0.5">Uploaded successfully</p>
                  )}
                  {uploadingFile.status === 'error' && (
                    <p className="text-12 text-red-600 mt-0.5">{uploadingFile.error}</p>
                  )}
                </div>

                {uploadingFile.status !== 'uploading' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeUploadingFile(index)}
                    className="flex-shrink-0 p-1"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <FilesTable companyId={companyId} refreshKey={refreshKey} />
    </Card>
  )
})

FilesSection.displayName = 'FilesSection'

export default FilesSection

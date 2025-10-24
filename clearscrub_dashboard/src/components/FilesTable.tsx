import React, { useState, useMemo, useEffect } from 'react'
import { MoreVertical, Download, Eye, RefreshCw, Trash2, ChevronUp, ChevronDown, Loader2, AlertCircle, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, type Document } from '../services/api'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'

interface FileRecord {
  id: string
  file_name: string
  category: 'Statement' | 'MTD' | 'Payoff' | 'Other'
  date_created: string
  processing_status: 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed' | 'archived'
  file_url: string
  file_size: number
}

interface FilesTableProps {
  companyId: string
  refreshKey?: number
}

type SortColumn = 'file_name' | 'category' | 'date_created' | 'processing_status'
type SortDirection = 'asc' | 'desc'

// Create date formatter singleton at module level for performance
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
})

export default function FilesTable({ companyId, refreshKey = 0 }: FilesTableProps) {
  const { authReady } = useAuth()
  const [files, setFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<SortColumn | null>('date_created')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [isFilesExpanded, setIsFilesExpanded] = useState(false)

  // Fetch documents from API
  useEffect(() => {
    async function fetchDocuments() {
      if (!authReady) {
        console.log('[FilesTable] Waiting for auth to be ready...')
        setLoading(false)
        return
      }

      if (!companyId) return

      console.log('[FilesTable] Auth ready, loading documents')
      setLoading(true)
      setError(null)

      try {
        const documents = await api.getDocuments(companyId)

        // Transform documents to FileRecord format
        const transformedFiles: FileRecord[] = documents.map(doc => {
          // Categorize based on filename (simple heuristic)
          let category: FileRecord['category'] = 'Other'
          const filename = doc.filename.toLowerCase()
          if (filename.includes('statement') || filename.includes('bank')) {
            category = 'Statement'
          } else if (filename.includes('mtd')) {
            category = 'MTD'
          } else if (filename.includes('payoff')) {
            category = 'Payoff'
          }

          // Generate signed URL for file access
          const { data } = supabase.storage
            .from('incoming-documents')
            .getPublicUrl(doc.file_path)

          return {
            id: doc.id,
            file_name: doc.filename,
            category,
            date_created: doc.created_at,
            processing_status: doc.status,
            file_url: data.publicUrl,
            file_size: doc.file_size_bytes
          }
        })

        setFiles(transformedFiles)
      } catch (err) {
        console.error('Failed to fetch documents:', err)
        setError(err instanceof Error ? err.message : 'Failed to load documents')
      } finally {
        setLoading(false)
      }
    }

    fetchDocuments()
  }, [companyId, refreshKey, authReady])

  const formatDate = (dateString: string) => {
    return dateFormatter.format(new Date(dateString))
  }

  const handleView = (file: FileRecord, event: React.MouseEvent) => {
    // If Ctrl/Cmd is held, open in background (default browser behavior)
    // Otherwise, open in new tab and focus it
    if (!event.ctrlKey && !event.metaKey) {
      window.open(file.file_url, '_blank')?.focus()
    } else {
      window.open(file.file_url, '_blank')
    }
    setOpenMenuId(null)
  }

  const handleDownload = (file: FileRecord) => {
    // Implement download logic
    console.log('Downloading file:', file.file_name)
    setOpenMenuId(null)
  }

  const handleRerun = (file: FileRecord) => {
    // Implement rerun logic
    console.log('Rerunning file:', file.file_name)
    setOpenMenuId(null)
  }

  const handleDelete = (file: FileRecord) => {
    // Implement delete logic
    console.log('Deleting file:', file.file_name)
    setOpenMenuId(null)
  }

  const toggleMenu = (fileId: string) => {
    setOpenMenuId(openMenuId === fileId ? null : fileId)
  }

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction if clicking same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to ascending
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const sortedFiles = useMemo(() => {
    if (!sortColumn) return files

    const sorted = [...files].sort((a, b) => {
      let aValue: any = a[sortColumn]
      let bValue: any = b[sortColumn]

      // Handle date sorting
      if (sortColumn === 'date_created') {
        aValue = new Date(aValue).getTime()
        bValue = new Date(bValue).getTime()
      }

      // Handle string sorting
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      // Handle number sorting (dates converted to timestamps)
      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
      }
    })

    return sorted
  }, [files, sortColumn, sortDirection])

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Show loading state
  if (loading) {
    return (
      <div className="table-container">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          <span className="ml-3 text-14 text-gray-600">Loading documents...</span>
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="table-container">
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="w-12 h-12 text-red-500 mb-3" />
          <p className="text-14 text-red-600 font-medium mb-2">Failed to load documents</p>
          <p className="text-12 text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  // Show empty state
  if (files.length === 0) {
    return (
      <div className="table-container">
        <div className="flex flex-col items-center justify-center py-12">
          <Upload className="w-12 h-12 text-gray-400 mb-3" />
          <p className="text-14 text-gray-600 font-medium">No documents uploaded yet</p>
          <p className="text-12 text-gray-500 mt-1">Upload PDF files using the form above</p>
        </div>
      </div>
    )
  }

  return (
    <div className="table-container">
      <table className="w-full">
        <thead>
          <tr>
            <th
              className="table-header text-left cursor-pointer hover:bg-gray-100 transition-colors duration-150"
              onClick={() => handleSort('file_name')}
            >
              <div className="flex items-center gap-2">
                <span>FILE NAME</span>
                {sortColumn === 'file_name' ? (
                  sortDirection === 'asc'
                    ? <ChevronUp className="w-3 h-3 text-primary-600" />
                    : <ChevronDown className="w-3 h-3 text-primary-600" />
                ) : (
                  <ChevronUp className="w-3 h-3 text-transparent" />
                )}
              </div>
            </th>
            <th
              className="table-header text-left cursor-pointer hover:bg-gray-100 transition-colors duration-150"
              onClick={() => handleSort('category')}
            >
              <div className="flex items-center gap-2">
                <span>CATEGORY</span>
                {sortColumn === 'category' ? (
                  sortDirection === 'asc'
                    ? <ChevronUp className="w-3 h-3 text-primary-600" />
                    : <ChevronDown className="w-3 h-3 text-primary-600" />
                ) : (
                  <ChevronUp className="w-3 h-3 text-transparent" />
                )}
              </div>
            </th>
            <th
              className="table-header text-left cursor-pointer hover:bg-gray-100 transition-colors duration-150"
              onClick={() => handleSort('date_created')}
            >
              <div className="flex items-center gap-2">
                <span>DATE CREATED</span>
                {sortColumn === 'date_created' ? (
                  sortDirection === 'asc'
                    ? <ChevronUp className="w-3 h-3 text-primary-600" />
                    : <ChevronDown className="w-3 h-3 text-primary-600" />
                ) : (
                  <ChevronUp className="w-3 h-3 text-transparent" />
                )}
              </div>
            </th>
            <th
              className="table-header text-left cursor-pointer hover:bg-gray-100 transition-colors duration-150"
              onClick={() => handleSort('processing_status')}
            >
              <div className="flex items-center gap-2">
                <span>PROCESSING STATUS</span>
                {sortColumn === 'processing_status' ? (
                  sortDirection === 'asc'
                    ? <ChevronUp className="w-3 h-3 text-primary-600" />
                    : <ChevronDown className="w-3 h-3 text-primary-600" />
                ) : (
                  <ChevronUp className="w-3 h-3 text-transparent" />
                )}
              </div>
            </th>
            <th className="table-header text-center w-20">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {sortedFiles.slice(0, isFilesExpanded ? sortedFiles.length : 10).map((file) => (
            <tr key={file.id} className="table-row">
              <td className="table-cell">
                <a
                  href={file.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-gray-900 hover:underline cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault()
                    if (!e.ctrlKey && !e.metaKey) {
                      window.open(file.file_url, '_blank')?.focus()
                    } else {
                      window.open(file.file_url, '_blank')
                    }
                  }}
                >
                  {file.file_name}
                </a>
              </td>
              <td className="table-cell">
                <span className="text-gray-700">{file.category}</span>
              </td>
              <td className="table-cell">
                <span className="text-gray-700">{formatDate(file.date_created)}</span>
              </td>
              <td className="table-cell">
                <Badge
                  variant={
                    file.processing_status === 'completed'
                      ? 'default'
                      : file.processing_status === 'uploaded'
                      ? 'secondary'
                      : file.processing_status === 'processing' || file.processing_status === 'queued'
                      ? 'secondary'
                      : file.processing_status === 'failed'
                      ? 'destructive'
                      : 'secondary'
                  }
                >
                  {file.processing_status.charAt(0).toUpperCase() + file.processing_status.slice(1)}
                </Badge>
              </td>
              <td className="table-cell text-center relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => toggleMenu(file.id)}
                  aria-label="File actions"
                >
                  <MoreVertical className="w-4 h-4 text-gray-500" />
                </Button>

                {openMenuId === file.id && (
                  <>
                    {/* Backdrop to close menu */}
                    <div
                      className="fixed inset-0 z-[100]"
                      onClick={() => setOpenMenuId(null)}
                    />
                    {/* Dropdown Menu */}
                    <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-6 shadow-lg z-[110]">
                      <div className="py-1">
                        <button
                          onClick={(e) => handleView(file, e)}
                          className="w-full px-4 py-2 text-left text-14 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                        <button
                          onClick={() => handleDownload(file)}
                          className="w-full px-4 py-2 text-left text-14 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </button>
                        <button
                          onClick={() => handleRerun(file)}
                          className="w-full px-4 py-2 text-left text-14 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Rerun
                        </button>
                        <button
                          onClick={() => handleDelete(file)}
                          className="w-full px-4 py-2 text-left text-14 text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Expand/Collapse Button for Files */}
      {sortedFiles.length > 10 && (
        <div className="flex justify-center border-t border-gray-200 bg-gray-50 px-4 py-0">
          <Button
            variant="ghost"
            onClick={() => setIsFilesExpanded(!isFilesExpanded)}
            className="py-3 px-6 text-14 font-medium flex items-center gap-2"
          >
            {isFilesExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                <span>Show Less</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                <span>Show More ({sortedFiles.length - 10} more)</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

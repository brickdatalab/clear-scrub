import React, { useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { api } from '../services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Upload, FileText, CheckCircle, XCircle, Clock, RefreshCw, Trash2 } from 'lucide-react'

/**
 * Submission tracking - groups documents by submission_id
 * This matches the exact structure returned by api.uploadDocumentsViaEdgeFunction()
 */
interface SubmissionUpload {
  submission_id: string
  documents: Array<{
    id: string
    filename: string
    status: 'uploaded' | 'failed' | 'processing' | 'completed'
    processing_initiated: boolean
    error?: string
  }>
  uploaded_at: Date
}

interface StatementResult {
  document_id: string
  filename: string
  statement_period_start: string
  statement_period_end: string
  company_name: string
  company_id: string
  account_number_display: string
  bank_name: string
  opening_balance: number
  closing_balance: number
  total_deposits: number
  total_withdrawals: number
  average_daily_balance: number
  true_revenue: number
  negative_balance_days: number
  nsf_count: number
  transaction_count: number
}

interface SubmissionResults {
  submission_id: string
  total_pdfs: number
  statements: StatementResult[]
  months_covered: string[]
}

/**
 * TestUpload - Uses EXACT same pipeline as main UploadDocuments page
 *
 * Pipeline flow:
 * 1. User selects files
 * 2. Calls api.uploadDocumentsViaEdgeFunction(files) - SAME as main upload
 * 3. Edge Function creates submission + documents + triggers processing
 * 4. This page polls for results and displays them
 */
export default function TestUpload() {
  const [submissions, setSubmissions] = useState<SubmissionUpload[]>([])
  const [results, setResults] = useState<SubmissionResults[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle file selection - just store files, don't upload yet
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter(f => f.type === 'application/pdf')
      setSelectedFiles(prev => [...prev, ...newFiles])
    }
  }

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf')
    if (droppedFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...droppedFiles])
    }
  }, [])

  // Remove a file from selection
  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  /**
   * Upload files using EXACT same function as main upload form
   * This calls api.uploadDocumentsViaEdgeFunction() which:
   * 1. Creates a submission record
   * 2. Uploads files to correct storage path: {org_id}/{submission_id}/{timestamp}_{filename}
   * 3. Creates document records linked to submission
   * 4. Triggers document-metadata for processing
   */
  const uploadFiles = async () => {
    if (selectedFiles.length === 0) return

    setIsUploading(true)
    setError(null)

    try {
      // EXACT SAME CALL as main UploadDocuments.tsx
      const response = await api.uploadDocumentsViaEdgeFunction(selectedFiles)

      if (!response.success) {
        throw new Error('Upload failed')
      }

      // Store submission info for tracking
      const newSubmissions: SubmissionUpload[] = response.submissions.map(sub => ({
        submission_id: sub.id,
        documents: sub.documents.map(doc => ({
          id: doc.id,
          filename: doc.filename,
          status: doc.status === 'uploaded' ? 'processing' : doc.status,
          processing_initiated: doc.processing_initiated,
          error: doc.error
        })),
        uploaded_at: new Date()
      }))

      setSubmissions(prev => [...prev, ...newSubmissions])
      setSelectedFiles([]) // Clear selected files after upload

      console.log('[TestUpload] Upload successful:', {
        total_files: response.summary.total_files,
        successful: response.summary.successful,
        failed: response.summary.failed,
        submissions: newSubmissions.map(s => s.submission_id)
      })

    } catch (err) {
      console.error('[TestUpload] Upload error:', err)
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  /**
   * Poll for processing status and fetch results
   */
  const pollStatus = async () => {
    setIsPolling(true)

    try {
      for (const submission of submissions) {
        const documentIds = submission.documents.map(d => d.id)

        // Check document status
        const { data: docs, error: docsError } = await supabase
          .from('documents')
          .select('id, filename, status')
          .in('id', documentIds)

        if (docsError) {
          console.error('[TestUpload] Poll error:', docsError)
          continue
        }

        // Update document statuses in submission
        const updatedDocs = submission.documents.map(doc => {
          const dbDoc = docs?.find(d => d.id === doc.id)
          if (dbDoc) {
            return {
              ...doc,
              status: dbDoc.status === 'processed' ? 'completed' as const :
                     dbDoc.status === 'failed' ? 'failed' as const :
                     'processing' as const
            }
          }
          return doc
        })

        setSubmissions(prev => prev.map(s =>
          s.submission_id === submission.submission_id
            ? { ...s, documents: updatedDocs }
            : s
        ))

        // Fetch results for completed documents
        const completedDocs = docs?.filter(d => d.status === 'processed') || []
        if (completedDocs.length > 0) {
          await fetchSubmissionResults(submission.submission_id, completedDocs)
        }
      }
    } catch (err) {
      console.error('[TestUpload] Poll error:', err)
    } finally {
      setIsPolling(false)
    }
  }

  /**
   * Fetch extraction results for a submission
   */
  const fetchSubmissionResults = async (submissionId: string, completedDocs: Array<{ id: string; filename: string }>) => {
    const statements: StatementResult[] = []

    for (const doc of completedDocs) {
      // Get statement linked to this document
      const { data: stmt, error: stmtError } = await supabase
        .from('statements')
        .select(`
          id,
          document_id,
          statement_period_start,
          statement_period_end,
          opening_balance,
          closing_balance,
          total_deposits,
          total_withdrawals,
          average_daily_balance,
          true_revenue,
          negative_balance_days,
          nsf_count,
          transaction_count,
          account_id,
          company_id
        `)
        .eq('document_id', doc.id)
        .single()

      if (stmtError && stmtError.code !== 'PGRST116') {
        console.error('[TestUpload] Statement fetch error:', stmtError)
        continue
      }

      if (!stmt) continue

      // Get company name
      const { data: company } = await supabase
        .from('companies')
        .select('id, legal_name')
        .eq('id', stmt.company_id)
        .single()

      // Get account info
      const { data: account } = await supabase
        .from('accounts')
        .select('id, account_number_display, bank_name')
        .eq('id', stmt.account_id)
        .single()

      statements.push({
        document_id: doc.id,
        filename: doc.filename,
        statement_period_start: stmt.statement_period_start,
        statement_period_end: stmt.statement_period_end,
        company_name: company?.legal_name || 'Unknown',
        company_id: stmt.company_id,
        account_number_display: account?.account_number_display || '****',
        bank_name: account?.bank_name || 'Unknown',
        opening_balance: stmt.opening_balance,
        closing_balance: stmt.closing_balance,
        total_deposits: stmt.total_deposits,
        total_withdrawals: stmt.total_withdrawals,
        average_daily_balance: stmt.average_daily_balance,
        true_revenue: stmt.true_revenue,
        negative_balance_days: stmt.negative_balance_days,
        nsf_count: stmt.nsf_count,
        transaction_count: stmt.transaction_count
      })
    }

    // Calculate months covered
    const months = [...new Set(statements.map(s => {
      const date = new Date(s.statement_period_start)
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    }))].sort()

    const submissionResult: SubmissionResults = {
      submission_id: submissionId,
      total_pdfs: completedDocs.length,
      statements,
      months_covered: months
    }

    setResults(prev => {
      const existing = prev.findIndex(r => r.submission_id === submissionId)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = submissionResult
        return updated
      }
      return [...prev, submissionResult]
    })
  }

  // Clear all
  const clearAll = () => {
    setSubmissions([])
    setResults([])
    setSelectedFiles([])
    setError(null)
  }

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0)
  }

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />
      case 'processing': return <Clock className="w-4 h-4 text-yellow-500 animate-pulse" />
      default: return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  const totalDocs = submissions.reduce((sum, s) => sum + s.documents.length, 0)
  const completedDocs = submissions.reduce((sum, s) =>
    sum + s.documents.filter(d => d.status === 'completed').length, 0)
  const processingDocs = submissions.reduce((sum, s) =>
    sum + s.documents.filter(d => d.status === 'processing').length, 0)

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Test Upload Pipeline</h1>
          <p className="text-muted-foreground mt-1">
            Uses EXACT same pipeline as main upload form
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={pollStatus} disabled={isPolling || submissions.length === 0}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isPolling ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>
          <Button variant="outline" onClick={clearAll}>
            <Trash2 className="w-4 h-4 mr-2" />
            Clear All
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Bank Statements</CardTitle>
          <CardDescription>
            Select multiple PDFs - they will be uploaded as a single submission
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-lg font-medium">Drop PDF files here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
            <input
              id="file-input"
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Selected Files */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="font-medium">Selected Files ({selectedFiles.length})</h4>
                <Button onClick={uploadFiles} disabled={isUploading}>
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload All as Submission
                    </>
                  )}
                </Button>
              </div>
              <div className="space-y-1">
                {selectedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <span className="text-sm">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeFile(idx)}>
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submission Status */}
      {submissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Submissions</CardTitle>
            <CardDescription>
              {totalDocs} documents | {completedDocs} completed | {processingDocs} processing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {submissions.map(submission => (
                <div key={submission.submission_id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-sm text-muted-foreground">Submission ID:</span>
                      <p className="font-mono text-sm">{submission.submission_id}</p>
                    </div>
                    <Badge variant="outline">
                      {submission.documents.length} PDFs
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {submission.documents.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between p-2 bg-muted rounded">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-500" />
                          <span className="text-sm">{doc.filename}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(doc.status)}
                          <Badge variant={
                            doc.status === 'completed' ? 'default' :
                            doc.status === 'failed' ? 'destructive' :
                            'secondary'
                          }>
                            {doc.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Extraction Results</h2>

          {results.map(result => (
            <Card key={result.submission_id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>Submission Results</CardTitle>
                    <CardDescription>
                      ID: {result.submission_id}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <Badge className="mb-1">{result.total_pdfs} PDFs</Badge>
                    <p className="text-sm text-muted-foreground">
                      {result.months_covered.length} months covered
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <span className="text-sm text-muted-foreground">Total PDFs</span>
                    <p className="text-2xl font-bold">{result.total_pdfs}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Months Covered</span>
                    <p className="text-2xl font-bold">{result.months_covered.length}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Total Deposits</span>
                    <p className="text-lg font-bold text-green-600">
                      {formatCurrency(result.statements.reduce((sum, s) => sum + s.total_deposits, 0))}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Total Withdrawals</span>
                    <p className="text-lg font-bold text-red-600">
                      {formatCurrency(result.statements.reduce((sum, s) => sum + s.total_withdrawals, 0))}
                    </p>
                  </div>
                </div>

                {/* Months Covered */}
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground mb-2">MONTHS COVERED</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.months_covered.map(month => (
                      <Badge key={month} variant="outline">{month}</Badge>
                    ))}
                  </div>
                </div>

                {/* Per-Month Breakdown */}
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground mb-2">MONTHLY BREAKDOWN</h4>
                  <div className="space-y-3">
                    {result.statements.map(stmt => (
                      <div key={stmt.document_id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-medium">{stmt.company_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {stmt.bank_name} - {stmt.account_number_display}
                            </p>
                          </div>
                          <Badge>{formatDate(stmt.statement_period_start)} - {formatDate(stmt.statement_period_end)}</Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                          <div className="p-2 bg-muted rounded">
                            <span className="text-muted-foreground">Opening</span>
                            <p className="font-medium">{formatCurrency(stmt.opening_balance)}</p>
                          </div>
                          <div className="p-2 bg-muted rounded">
                            <span className="text-muted-foreground">Closing</span>
                            <p className="font-medium">{formatCurrency(stmt.closing_balance)}</p>
                          </div>
                          <div className="p-2 bg-green-50 rounded">
                            <span className="text-green-600">Deposits</span>
                            <p className="font-medium text-green-700">{formatCurrency(stmt.total_deposits)}</p>
                          </div>
                          <div className="p-2 bg-red-50 rounded">
                            <span className="text-red-600">Withdrawals</span>
                            <p className="font-medium text-red-700">{formatCurrency(stmt.total_withdrawals)}</p>
                          </div>
                          <div className="p-2 bg-blue-50 rounded">
                            <span className="text-blue-600">True Revenue</span>
                            <p className="font-medium text-blue-700">{formatCurrency(stmt.true_revenue)}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-3 mt-2 text-sm">
                          <div className="p-2 bg-muted rounded">
                            <span className="text-muted-foreground">Avg Daily</span>
                            <p className="font-medium">{formatCurrency(stmt.average_daily_balance)}</p>
                          </div>
                          <div className="p-2 bg-muted rounded">
                            <span className="text-muted-foreground">Transactions</span>
                            <p className="font-medium">{stmt.transaction_count}</p>
                          </div>
                          <div className="p-2 bg-yellow-50 rounded">
                            <span className="text-yellow-600">Neg Days</span>
                            <p className="font-medium text-yellow-700">{stmt.negative_balance_days}</p>
                          </div>
                          <div className="p-2 bg-orange-50 rounded">
                            <span className="text-orange-600">NSF</span>
                            <p className="font-medium text-orange-700">{stmt.nsf_count}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {result.statements.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No extracted data found yet.</p>
                    <p className="text-sm mt-1">Processing may still be in progress. Click "Refresh Status".</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

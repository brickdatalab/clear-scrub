import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RefreshCw } from 'lucide-react'
import { api, invalidateCompaniesCache, type CompanyListItem } from '../services/api'
import { DataTable } from '@/components/data-table/data-table'
import { companyColumns } from '@/components/companies/columns'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { useCompanyPrefetch } from '@/hooks/useCompanyPrefetch'

// Lazy-load AddCompanyModal to reduce initial bundle size
const AddCompanyModal = lazy(() =>
  import('@/components/AddCompanyModal').then(module => ({ default: module.AddCompanyModal }))
)

export default function Companies() {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState<CompanyListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAddCompanyOpen, setIsAddCompanyOpen] = useState(false)

  // Ref to prevent StrictMode double-fetch
  const fetchStartedRef = useRef(false)

  // Prefetch hook for company details on hover
  const { prefetch, cancelPrefetch } = useCompanyPrefetch()

  // Load companies function
  const loadCompanies = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true)
      setError(null)
      const data = await api.getCompanies(1, 50)
      setCompanies(data.companies || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load companies')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  // Load companies on mount
  useEffect(() => {
    // Skip if already fetching (prevents StrictMode double-fetch)
    if (fetchStartedRef.current) {
      if (import.meta.env.DEV) {
        console.log('[Companies] Skipping duplicate fetch')
      }
      return
    }
    fetchStartedRef.current = true

    loadCompanies()

    return () => {
      // Reset on unmount so it loads fresh on next mount
    }
  }, [loadCompanies])

  // Handle row click to navigate to company detail
  const handleRowClick = useCallback((row: CompanyListItem) => {
    if (row.id) {
      // Cancel any pending prefetch before navigating
      cancelPrefetch()
      navigate(`/companies/${row.id}`)
    }
  }, [navigate, cancelPrefetch])

  // Handle row hover - prefetch company detail after 150ms debounce
  const handleRowHover = useCallback((row: CompanyListItem) => {
    if (row.id) {
      prefetch(row.id)
    }
  }, [prefetch])

  // Handle row hover end - cancel pending prefetch
  const handleRowHoverEnd = useCallback(() => {
    cancelPrefetch()
  }, [cancelPrefetch])

  // Handle refresh - invalidate cache to force fresh fetch
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    invalidateCompaniesCache()
    loadCompanies(false)
  }, [loadCompanies])

  // Handle successful upload - invalidate cache and refresh the list
  const handleUploadSuccess = useCallback(() => {
    console.log('[Companies] Upload successful, invalidating cache and refreshing list')
    invalidateCompaniesCache()
    loadCompanies(false)
  }, [loadCompanies])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-foreground">Companies</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Refresh companies"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            className="flex items-center gap-2"
            size="lg"
            aria-label="Add new company"
            onClick={() => setIsAddCompanyOpen(true)}
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Upload Documents</span>
            <span className="sm:hidden">Upload</span>
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription className="flex items-center justify-between">
            <span>Error loading data: {error}</span>
          </AlertDescription>
        </Alert>
      )}

      {/* Data Table */}
      <Card>
        <div className="p-6">
          <DataTable
            columns={companyColumns}
            data={companies}
            pageSize={20}
            onRowClick={handleRowClick}
            onRowHover={handleRowHover}
            onRowHoverEnd={handleRowHoverEnd}
            isLoading={isLoading}
            globalFilterColumn="name"
            emptyMessage="No submissions yet. Upload documents to get started."
            className="w-full"
          />
        </div>
      </Card>

      {/* Add Company Modal - lazy loaded */}
      <Suspense fallback={null}>
        <AddCompanyModal
          isOpen={isAddCompanyOpen}
          onClose={() => setIsAddCompanyOpen(false)}
          onSuccess={handleUploadSuccess}
        />
      </Suspense>
    </div>
  )
}

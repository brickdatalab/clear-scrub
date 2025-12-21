import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { api, type CompanyListItem } from '../services/api'
import { DataTable } from '@/components/data-table/data-table'
import { companyColumns } from '@/components/companies/columns'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { AddCompanyModal } from '@/components/AddCompanyModal'

export default function Companies() {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState<CompanyListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAddCompanyOpen, setIsAddCompanyOpen] = useState(false)
  const enableAddCompany = import.meta.env.VITE_ENABLE_ADD_COMPANY === 'true'

  // Ref to prevent StrictMode double-fetch
  const fetchStartedRef = useRef(false)

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

    let isMounted = true

    async function loadCompanies() {
      try {
        setIsLoading(true)
        setError(null)
        const data = await api.getCompanies(1, 50)

        if (isMounted) {
          setCompanies(data.companies || [])
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load companies')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadCompanies()

    return () => {
      isMounted = false
    }
  }, [])

  // Handle row click to navigate to company detail
  const handleRowClick = useCallback((row: any) => {
    if (row.id) {
      navigate(`/companies/${row.id}`)
    }
  }, [navigate])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-foreground">Companies</h1>
        {enableAddCompany && (
          <Button
            className="flex items-center gap-2"
            size="lg"
            aria-label="Add new company"
            onClick={() => setIsAddCompanyOpen(true)}
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Add Company</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}
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
            isLoading={isLoading}
            globalFilterColumn="legal_name"
            emptyMessage="No companies found"
            className="w-full"
          />
        </div>
      </Card>

      {/* Add Company Modal */}
      {enableAddCompany && (
        <AddCompanyModal
          isOpen={isAddCompanyOpen}
          onClose={() => setIsAddCompanyOpen(false)}
        />
      )}
    </div>
  )
}

import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { type CompanyListItem } from '@/services/api'

/**
 * Company type definition matching the API response
 * Used for DataTable column definitions
 */
export type CompanyColumn = CompanyListItem

/**
 * Status badge styling based on file_status
 * Maps status values to Badge variant colors
 */
const getStatusVariant = (
  status: 'completed' | 'processing' | 'failed'
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  const variants: Record<
    'completed' | 'processing' | 'failed',
    'default' | 'secondary' | 'destructive' | 'outline'
  > = {
    completed: 'default',
    processing: 'secondary',
    failed: 'destructive',
  }
  return variants[status]
}

/**
 * Format date to MM/DD/YYYY format
 */
const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    })
  } catch {
    return dateString
  }
}

/**
 * Company columns for DataTable
 * Includes: name, status, creation date, and last activity
 *
 * Features:
 * - Name column: sortable, searchable, globally filterable
 * - Status column: Badge with color coding (completed=default, processing=secondary, failed=destructive)
 * - Created column: date format, sortable
 * - Last Activity column: date format, sortable
 * - Row click navigation handled by DataTable's onRowClick prop
 *
 * @example
 * import { companyColumns } from '@/components/companies/columns'
 * import { DataTable } from '@/components/data-table'
 *
 * <DataTable
 *   columns={companyColumns}
 *   data={companies}
 *   pageSize={20}
 *   onRowClick={(company) => navigate(`/companies/${company.company_id}`)}
 *   isLoading={loading}
 *   globalFilterColumn="name"
 *   emptyMessage="No companies found"
 * />
 */
export const companyColumns: ColumnDef<CompanyColumn>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <button
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="flex items-center gap-2 font-medium hover:text-foreground/80 transition-colors"
        aria-label="Toggle sort by company name"
      >
        Company Name
        <span className="text-xs opacity-50">
          {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : '⇅'}
        </span>
      </button>
    ),
    cell: ({ row }) => {
      const name = row.original.name
      return (
        <div className="font-medium text-sm">
          {name}
        </div>
      )
    },
    enableSorting: true,
    enableGlobalFilter: true,
    filterFn: 'includesString',
  },
  {
    accessorKey: 'file_status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.original.file_status as 'completed' | 'processing' | 'failed'
      const variant = getStatusVariant(status)
      const label = status.charAt(0).toUpperCase() + status.slice(1)

      return (
        <Badge variant={variant}>
          {label}
        </Badge>
      )
    },
    enableSorting: true,
    enableColumnFilter: true,
    filterFn: 'equalsString',
  },
  {
    accessorKey: 'created',
    header: ({ column }) => (
      <button
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="flex items-center gap-2 font-medium hover:text-foreground/80 transition-colors"
        aria-label="Toggle sort by created date"
      >
        Created Date
        <span className="text-xs opacity-50">
          {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : '⇅'}
        </span>
      </button>
    ),
    cell: ({ row }) => {
      const date = row.original.created
      return (
        <span className="text-sm text-muted-foreground">
          {formatDate(date)}
        </span>
      )
    },
    enableSorting: true,
    enableColumnFilter: false,
  },
  {
    accessorKey: 'last_activity',
    header: ({ column }) => (
      <button
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="flex items-center gap-2 font-medium hover:text-foreground/80 transition-colors"
        aria-label="Toggle sort by last activity date"
      >
        Last Activity
        <span className="text-xs opacity-50">
          {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : '⇅'}
        </span>
      </button>
    ),
    cell: ({ row }) => {
      const date = row.original.last_activity
      return (
        <span className="text-sm text-muted-foreground">
          {formatDate(date)}
        </span>
      )
    },
    enableSorting: true,
    enableColumnFilter: false,
  },
]

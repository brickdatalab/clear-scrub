import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { type CompanyListItem } from '@/services/api'

/**
 * Company type definition matching the API response
 * Used for DataTable column definitions
 */
export type CompanyColumn = CompanyListItem

/**
 * Status badge styling based on submission status
 */
const getStatusVariant = (
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    completed: 'default',
    processing: 'secondary',
    received: 'outline',
    failed: 'destructive',
  }
  return variants[status] || 'outline'
}

/**
 * Format date to relative time or date format
 */
const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })
  } catch {
    return dateString
  }
}

/**
 * Company columns for DataTable
 * Displays submissions with company info, file processing status, and dates
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
        Company
        <span className="text-xs opacity-50">
          {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : '⇅'}
        </span>
      </button>
    ),
    cell: ({ row }) => {
      const name = row.original.name
      const submissionId = row.original.submission_id
      return (
        <div>
          <div className="font-medium text-sm">{name}</div>
          <div className="text-xs text-muted-foreground font-mono">
            {submissionId.slice(0, 8)}...
          </div>
        </div>
      )
    },
    enableSorting: true,
    enableGlobalFilter: true,
    filterFn: 'includesString',
  },
  {
    accessorKey: 'files',
    header: 'Files',
    cell: ({ row }) => {
      const processed = row.original.files_processed || 0
      const total = row.original.files_total || 0
      const isComplete = processed >= total && total > 0
      
      return (
        <div className="flex items-center gap-2">
          <span className={`text-sm ${isComplete ? 'text-green-600' : 'text-muted-foreground'}`}>
            {processed} / {total}
          </span>
          {isComplete && total > 0 && (
            <span className="text-green-600 text-xs">✓</span>
          )}
        </div>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.original.status || 'received'
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
    accessorKey: 'ingestion_method',
    header: 'Source',
    cell: ({ row }) => {
      const method = row.original.ingestion_method || 'dashboard'
      const labels: Record<string, string> = {
        dashboard: 'Dashboard',
        api: 'API',
        email: 'Email',
      }
      return (
        <span className="text-sm text-muted-foreground capitalize">
          {labels[method] || method}
        </span>
      )
    },
    enableSorting: true,
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <button
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="flex items-center gap-2 font-medium hover:text-foreground/80 transition-colors"
        aria-label="Toggle sort by received date"
      >
        Received
        <span className="text-xs opacity-50">
          {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : '⇅'}
        </span>
      </button>
    ),
    cell: ({ row }) => {
      const date = row.original.created_at
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

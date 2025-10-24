import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { type Document } from '@/hooks/useDocumentSubscription'

/**
 * Status badge styling based on document status
 * Maps status values to Badge variant colors
 */
const getStatusVariant = (
  status: 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed'
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  const variants: Record<
    'uploaded' | 'queued' | 'processing' | 'completed' | 'failed',
    'default' | 'secondary' | 'destructive' | 'outline'
  > = {
    uploaded: 'outline',
    queued: 'secondary',
    processing: 'secondary',
    completed: 'default',
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
 * Format file size to human-readable format
 */
const formatFileSize = (bytes?: number): string => {
  if (!bytes) return 'N/A'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

/**
 * Document columns for Processing tab
 * Shows documents that are pending or processing
 */
export const processingDocumentColumns: ColumnDef<Document>[] = [
  {
    accessorKey: 'filename',
    header: 'File Name',
    cell: ({ row }) => {
      const filename = row.original.filename
      return (
        <div className="font-medium text-sm truncate max-w-[300px]" title={filename}>
          {filename}
        </div>
      )
    },
    enableSorting: true,
    enableGlobalFilter: true,
    filterFn: 'includesString',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.original.status
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
    accessorKey: 'file_size_bytes',
    header: 'Size',
    cell: ({ row }) => {
      const size = row.original.file_size_bytes
      return (
        <span className="text-sm text-muted-foreground">
          {formatFileSize(size)}
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
        aria-label="Toggle sort by created date"
      >
        Started
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
  },
]

/**
 * Document columns for Failed tab
 * Shows documents with errors
 */
export const failedDocumentColumns: ColumnDef<Document>[] = [
  {
    accessorKey: 'filename',
    header: 'File Name',
    cell: ({ row }) => {
      const filename = row.original.filename
      return (
        <div className="font-medium text-sm truncate max-w-[250px]" title={filename}>
          {filename}
        </div>
      )
    },
    enableSorting: true,
    enableGlobalFilter: true,
    filterFn: 'includesString',
  },
  {
    accessorKey: 'error_message',
    header: 'Error',
    cell: ({ row }) => {
      const error = row.original.error_message
      return (
        <div className="text-sm text-red-600 truncate max-w-[400px]" title={error || 'Unknown error'}>
          {error || 'Unknown error'}
        </div>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: 'file_size_bytes',
    header: 'Size',
    cell: ({ row }) => {
      const size = row.original.file_size_bytes
      return (
        <span className="text-sm text-muted-foreground">
          {formatFileSize(size)}
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
        aria-label="Toggle sort by failed date"
      >
        Failed Date
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
  },
]

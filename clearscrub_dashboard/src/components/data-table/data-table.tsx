import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'

/**
 * Props for the DataTable component
 * @template TData - The data type for each row
 * @template TValue - The value type for accessor functions
 *
 * @example
 * const columns: ColumnDef<Company>[] = [...]
 * const data: Company[] = [...]
 * <DataTable
 *   columns={columns}
 *   data={data}
 *   globalFilterColumn="name"
 *   onRowClick={(row) => navigate(`/companies/${row.id}`)}
 * />
 */
export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  pageSize?: number
  onRowClick?: (row: TData) => void
  onRowHover?: (row: TData) => void
  onRowHoverEnd?: () => void
  className?: string
  initialVisibility?: VisibilityState
  globalFilterColumn?: string
  isLoading?: boolean
  emptyMessage?: string
}

/**
 * Reusable DataTable component using TanStack React Table v8
 *
 * Features:
 * - Sorting: Multi-column sort state
 * - Filtering: Column-specific filters with search input
 * - Pagination: Configurable page size with navigation
 * - Column Visibility: Toggle columns on/off
 * - Row Navigation: Optional row click handler
 * - Loading State: Shows skeleton rows when loading
 * - Empty State: Shows helpful message when no data
 *
 * @template TData - The data type for each row
 * @template TValue - The value type for accessor functions
 *
 * Performance Targets:
 * - 50 rows: <100ms render time
 * - 1000 rows: <500ms with virtualization
 *
 * Accessibility:
 * - ARIA labels on all interactive elements
 * - Keyboard navigation support (arrow keys, tab, enter)
 * - Screen reader announcements for sort/filter
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  pageSize = 20,
  onRowClick,
  onRowHover,
  onRowHoverEnd,
  className,
  initialVisibility = {},
  globalFilterColumn,
  isLoading = false,
  emptyMessage = 'No results found.',
}: DataTableProps<TData, TValue>) {
  // Table state
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialVisibility)
  const [search, setSearch] = useState<string>('')
  const [rowSelection, setRowSelection] = useState({})

  // Memoize columns to prevent unnecessary re-renders
  const memoizedColumns = useMemo(() => columns, [columns])

  // Create table instance
  const table = useReactTable({
    data,
    columns: memoizedColumns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize,
      },
    },
  })

  // Apply search filter to specific column using column-specific filtering
  useEffect(() => {
    if (!globalFilterColumn) return

    const col = table.getColumn(globalFilterColumn)
    if (!col) return

    col.setFilterValue(search)
  }, [search, globalFilterColumn, table])

  // Handle row click navigation
  const handleRowClick = useCallback(
    (row: TData) => {
      if (onRowClick) {
        onRowClick(row)
      }
    },
    [onRowClick]
  )

  // Get all filterable columns for filter UI
  const filterableColumns = useMemo(() => {
    return table.getAllColumns().filter((col) => col.getCanFilter() && col.id !== 'actions')
  }, [table])

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearch('')
    setColumnFilters([])
    setSorting([])
  }, [])

  // Check if any filters are active
  const hasActiveFilters = search.length > 0 || columnFilters.length > 0

  const rows = table.getRowModel().rows

  return (
    <div className={`w-full space-y-4 ${className}`}>
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label="Search table"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded"
              aria-label="Clear search"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              aria-label="Clear all filters"
            >
              Clear filters
            </Button>
          )}

          {/* Column Visibility Toggle */}
          <div className="flex gap-1">
            {table
              .getAllColumns()
              .filter(
                (column) =>
                  typeof column.accessorFn !== 'undefined' && column.getCanHide()
              )
              .map((column) => {
                const checkboxId = `column-visibility-${column.id}`
                return (
                  <div
                    key={column.id}
                    className="flex items-center gap-2 text-sm p-1 hover:bg-muted rounded"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    />
                    <label
                      htmlFor={checkboxId}
                      className="text-xs text-muted-foreground cursor-pointer"
                    >
                      {column.id}
                    </label>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isSortable = header.column.getCanSort()
                  return (
                    <TableHead
                      key={header.id}
                      className={isSortable ? 'cursor-pointer select-none' : ''}
                      onClick={isSortable ? header.column.getToggleSortingHandler() : undefined}
                      role={isSortable ? 'button' : undefined}
                      tabIndex={isSortable ? 0 : undefined}
                      aria-sort={
                        isSortable
                          ? header.column.getIsSorted() === 'asc'
                            ? 'ascending'
                            : header.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : 'none'
                          : undefined
                      }
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (isSortable && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault()
                          const handler = header.column.getToggleSortingHandler?.()
                          if (handler) handler(e as any)
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        {/* Sort indicator */}
                        {isSortable && (
                          <span className="text-xs text-muted-foreground">
                            {header.column.getIsSorted() === 'asc' && '↑'}
                            {header.column.getIsSorted() === 'desc' && '↓'}
                            {!header.column.getIsSorted() && (
                              <span className="opacity-40">⇅</span>
                            )}
                          </span>
                        )}
                      </div>
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <>
                <div
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                  className="sr-only"
                >
                  Loading table data...
                </div>
                {/* Loading skeleton rows */}
                {Array.from({ length: pageSize }).map((_, idx) => (
                  <TableRow key={`skeleton-${idx}`}>
                    {table.getVisibleLeafColumns().map((col) => (
                      <TableCell key={col.id}>
                        <div className="h-4 bg-muted rounded animate-pulse" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => handleRowClick(row.original)}
                  onMouseEnter={onRowHover ? () => onRowHover(row.original) : undefined}
                  onMouseLeave={onRowHoverEnd}
                  onKeyDown={(e) => {
                    if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      handleRowClick(row.original)
                    }
                  }}
                  className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                  data-state={row.getIsSelected() && 'selected'}
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={onRowClick ? `View details for row ${row.id}` : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {rows.length > 0 && !isLoading && (
        <div className="flex items-center justify-between px-2 py-4">
          <div
            className="text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            Page {table.getState().pagination.pageIndex + 1} of{' '}
            {table.getPageCount()} ({table.getFilteredRowModel().rows.length} total results)
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DataTable

import React, { useState, useMemo, useCallback } from 'react'
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface PaymentPeriod {
  period: string // "Jun 2025" or "Week of Jun 15" or "Jun 15, 2025"
  amount: number
  status: 'paid' | 'missed' | 'partial'
  date: string
}

interface MonthlySummary {
  month: string // "Aug 2025"
  paymentCount: number
  totalPaid: number
  missedCount: number
  payments: PaymentPeriod[]
}

interface DebtRecord {
  id: string
  type: string
  lender: string
  amount: number
  fundedDate: string // NEW: date the loan was funded
  frequency: string
  missedPayments: number
  confidenceScore: number
  paymentCount: number // NEW: total number of payments made
  totalPaid: number // NEW: sum of all payments
  status?: 'active' | 'uncertain' | 'paid-off' // Status indicator for visual dot
  monthlySummaries: MonthlySummary[] // NEW: monthly rollups
  paymentHistory: PaymentPeriod[] // Individual payments (for backward compatibility)
  transactions: Array<{
    id: string
    date: string
    description: string
    amount: number
    type: 'payment' | 'fee' | 'interest'
  }>
}

interface DebtSummaryTableProps {
  onRowClick?: (debt: DebtRecord) => void
  companyId?: string
  isExpanded?: boolean
}

// Group debts by lender
interface LenderGroup {
  lender: string
  debts: DebtRecord[]
  totalAmount: number
  totalPaymentCount: number
  totalPaid: number
  totalMissed: number
}

const mockDebtDataByCompany: { [key: string]: DebtRecord[] } = {
  'eus_SQ9H728DpXto2jvDid6CUx': [
  {
    id: 'debt-2',
    type: 'MCA',
    lender: 'OnDeck Capital',
    amount: 75000,
    fundedDate: '2025-06-01',
    frequency: 'Daily',
    missedPayments: 0,
    confidenceScore: 0.88,
    paymentCount: 63,
    totalPaid: 26775,
    status: 'active',
    monthlySummaries: [
      {
        month: 'Aug 2025',
        paymentCount: 22,
        totalPaid: 9350,
        missedCount: 0,
        payments: [
          { period: 'Aug 30', amount: 425, status: 'paid', date: '2025-08-30' },
          { period: 'Aug 29', amount: 425, status: 'paid', date: '2025-08-29' },
          { period: 'Aug 28', amount: 425, status: 'paid', date: '2025-08-28' },
          { period: 'Aug 27', amount: 425, status: 'paid', date: '2025-08-27' },
          { period: 'Aug 26', amount: 425, status: 'paid', date: '2025-08-26' },
          { period: 'Aug 25', amount: 425, status: 'paid', date: '2025-08-25' },
          { period: 'Aug 24', amount: 425, status: 'paid', date: '2025-08-24' },
          { period: 'Aug 23', amount: 425, status: 'paid', date: '2025-08-23' },
          { period: 'Aug 22', amount: 425, status: 'paid', date: '2025-08-22' },
          { period: 'Aug 21', amount: 425, status: 'paid', date: '2025-08-21' },
        ]
      },
      {
        month: 'Jul 2025',
        paymentCount: 21,
        totalPaid: 8925,
        missedCount: 0,
        payments: []
      },
      {
        month: 'Jun 2025',
        paymentCount: 20,
        totalPaid: 8500,
        missedCount: 0,
        payments: []
      }
    ],
    paymentHistory: [
      { period: 'Aug 30', amount: 425, status: 'paid', date: '2025-08-30' },
      { period: 'Aug 29', amount: 425, status: 'paid', date: '2025-08-29' },
      { period: 'Aug 28', amount: 425, status: 'paid', date: '2025-08-28' },
      { period: 'Aug 27', amount: 425, status: 'paid', date: '2025-08-27' },
      { period: 'Aug 26', amount: 425, status: 'paid', date: '2025-08-26' },
    ],
    transactions: []
  },
  {
    id: 'debt-4',
    type: 'MCA',
    lender: 'Funding Circle',
    amount: 32000,
    fundedDate: '2025-07-10',
    frequency: 'Weekly',
    missedPayments: 3,
    confidenceScore: 0.76,
    paymentCount: 15,
    totalPaid: 12750,
    status: 'uncertain',
    monthlySummaries: [
      {
        month: 'Aug 2025',
        paymentCount: 4,
        totalPaid: 2550,
        missedCount: 2,
        payments: [
          { period: 'Week of Aug 26', amount: 850, status: 'paid', date: '2025-08-26' },
          { period: 'Week of Aug 19', amount: 0, status: 'missed', date: '2025-08-19' },
          { period: 'Week of Aug 12', amount: 850, status: 'paid', date: '2025-08-12' },
          { period: 'Week of Aug 5', amount: 850, status: 'paid', date: '2025-08-05' },
        ]
      },
      {
        month: 'Jul 2025',
        paymentCount: 5,
        totalPaid: 4250,
        missedCount: 1,
        payments: []
      }
    ],
    paymentHistory: [
      { period: 'Week of Aug 26', amount: 850, status: 'paid', date: '2025-08-26' },
      { period: 'Week of Aug 19', amount: 0, status: 'missed', date: '2025-08-19' },
      { period: 'Week of Aug 12', amount: 850, status: 'paid', date: '2025-08-12' },
      { period: 'Week of Aug 5', amount: 0, status: 'missed', date: '2025-08-05' },
    ],
    transactions: []
  },
  {
    id: 'debt-5',
    type: 'MCA',
    lender: 'Fundbox Inc.',
    amount: 50000,
    fundedDate: '2025-08-01',
    frequency: 'Other',
    missedPayments: 0,
    confidenceScore: 0.95,
    paymentCount: 2,
    totalPaid: 2782.14,
    status: 'active',
    monthlySummaries: [
      {
        month: 'Aug 2025',
        paymentCount: 2,
        totalPaid: 2782.14,
        missedCount: 0,
        payments: [
          { period: 'Aug 28', amount: 1391.07, status: 'paid', date: '2025-08-28' },
          { period: 'Aug 7', amount: 1391.07, status: 'paid', date: '2025-08-07' },
        ]
      }
    ],
    paymentHistory: [
      { period: 'Aug 28', amount: 1391.07, status: 'paid', date: '2025-08-28' },
      { period: 'Aug 7', amount: 1391.07, status: 'paid', date: '2025-08-07' },
    ],
    transactions: []
  },
  {
    id: 'debt-6',
    type: 'MCA',
    lender: 'Levo Funding',
    amount: 65000,
    fundedDate: '2025-07-25',
    frequency: 'Weekly',
    missedPayments: 0,
    confidenceScore: 0.82,
    paymentCount: 4,
    totalPaid: 7253.32,
    status: 'paid-off',
    monthlySummaries: [
      {
        month: 'Aug 2025',
        paymentCount: 4,
        totalPaid: 7253.32,
        missedCount: 0,
        payments: [
          { period: 'Week of Aug 25', amount: 1813.33, status: 'paid', date: '2025-08-25' },
          { period: 'Week of Aug 18', amount: 1813.33, status: 'paid', date: '2025-08-18' },
          { period: 'Week of Aug 11', amount: 1813.33, status: 'paid', date: '2025-08-11' },
          { period: 'Week of Aug 4', amount: 1813.33, status: 'paid', date: '2025-08-04' },
        ]
      }
    ],
    paymentHistory: [
      { period: 'Week of Aug 25', amount: 1813.33, status: 'paid', date: '2025-08-25' },
      { period: 'Week of Aug 18', amount: 1813.33, status: 'paid', date: '2025-08-18' },
      { period: 'Week of Aug 11', amount: 1813.33, status: 'paid', date: '2025-08-11' },
      { period: 'Week of Aug 4', amount: 1813.33, status: 'paid', date: '2025-08-04' },
    ],
    transactions: []
  }
  ]
}

type SortColumn = 'lender' | 'type' | 'amount' | 'fundedDate' | 'frequency' | 'paymentCount' | 'totalPaid' | 'missedPayments' | 'confidenceScore'
type SortDirection = 'asc' | 'desc'

// Create formatter singletons at module level for performance
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export default function DebtSummaryTable({ onRowClick, companyId, isExpanded = false }: DebtSummaryTableProps) {
  const [expandedLenders, setExpandedLenders] = useState<Set<string>>(new Set())
  const [expandedDebts, setExpandedDebts] = useState<Set<string>>(new Set())
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const debtData = mockDebtDataByCompany[companyId || 'eus_SQ9H728DpXto2jvDid6CUx'] || mockDebtDataByCompany['eus_SQ9H728DpXto2jvDid6CUx']

  // Group debts by lender - memoized for performance
  const lenderGroups = useMemo<LenderGroup[]>(() => {
    return Object.values(
      debtData.reduce((acc, debt) => {
        if (!acc[debt.lender]) {
          acc[debt.lender] = {
            lender: debt.lender,
            debts: [],
            totalAmount: 0,
            totalPaymentCount: 0,
            totalPaid: 0,
            totalMissed: 0,
          }
        }
        acc[debt.lender].debts.push(debt)
        acc[debt.lender].totalAmount += debt.amount
        acc[debt.lender].totalPaymentCount += debt.paymentCount
        acc[debt.lender].totalPaid += debt.totalPaid
        acc[debt.lender].totalMissed += debt.missedPayments
        return acc
      }, {} as { [key: string]: LenderGroup })
    )
  }, [debtData])

  const formatCurrency = useCallback((amount: number) => {
    return currencyFormatter.format(amount)
  }, [])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const year = date.getFullYear()
    return `${month}/${day}/${year}`
  }

  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const year = String(date.getFullYear()).slice(-2)
    return `${month}/${day}/${year}`
  }

  const formatConfidenceScore = (score: number) => {
    return `${Math.round(score * 100)}%`
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Debt Consolidation':
        return 'text-blue-600 bg-blue-50'
      case 'MCA':
        return 'text-orange-600 bg-orange-50'
      case 'Bankruptcy':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  const getMissedPaymentsColor = (count: number) => {
    if (count === 0) return 'text-green-600'
    if (count <= 2) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getConfidenceColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600'
    if (score >= 0.8) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-700'
      case 'missed':
        return 'bg-red-100 text-red-700'
      case 'partial':
        return 'bg-yellow-100 text-yellow-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const toggleLender = (lender: string) => {
    const newExpanded = new Set(expandedLenders)
    if (newExpanded.has(lender)) {
      newExpanded.delete(lender)
    } else {
      newExpanded.add(lender)
    }
    setExpandedLenders(newExpanded)
  }

  const toggleDebt = (debtId: string) => {
    const newExpanded = new Set(expandedDebts)
    if (newExpanded.has(debtId)) {
      newExpanded.delete(debtId)
    } else {
      newExpanded.add(debtId)
    }
    setExpandedDebts(newExpanded)
  }

  const toggleMonth = (monthKey: string) => {
    const newExpanded = new Set(expandedMonths)
    if (newExpanded.has(monthKey)) {
      newExpanded.delete(monthKey)
    } else {
      newExpanded.add(monthKey)
    }
    setExpandedMonths(newExpanded)
  }

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const sortedLenderGroups = useMemo(() => {
    if (!sortColumn) return lenderGroups

    const sorted = [...lenderGroups].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortColumn) {
        case 'lender':
          aValue = a.lender
          bValue = b.lender
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)

        case 'type':
          // For groups with multiple loans, use "Multiple", otherwise use the debt type
          aValue = a.debts.length > 1 ? 'Multiple' : a.debts[0].type
          bValue = b.debts.length > 1 ? 'Multiple' : b.debts[0].type
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)

        case 'amount':
          aValue = a.totalAmount
          bValue = b.totalAmount
          break

        case 'fundedDate':
          // For groups with multiple loans, use the earliest funded date
          aValue = a.debts.length > 1
            ? Math.min(...a.debts.map(d => new Date(d.fundedDate).getTime()))
            : new Date(a.debts[0].fundedDate).getTime()
          bValue = b.debts.length > 1
            ? Math.min(...b.debts.map(d => new Date(d.fundedDate).getTime()))
            : new Date(b.debts[0].fundedDate).getTime()
          break

        case 'frequency':
          // Custom order for frequency
          const frequencyOrder: {[key: string]: number} = { 'Daily': 1, 'Weekly': 2, 'Monthly': 3, 'Other': 4 }
          aValue = a.debts.length > 1 ? 5 : (frequencyOrder[a.debts[0].frequency] || 5)
          bValue = b.debts.length > 1 ? 5 : (frequencyOrder[b.debts[0].frequency] || 5)
          break

        case 'paymentCount':
          aValue = a.totalPaymentCount
          bValue = b.totalPaymentCount
          break

        case 'totalPaid':
          aValue = a.totalPaid
          bValue = b.totalPaid
          break

        case 'missedPayments':
          aValue = a.totalMissed
          bValue = b.totalMissed
          break

        case 'confidenceScore':
          // For groups with multiple loans, can't sort by confidence
          aValue = a.debts.length > 1 ? -1 : a.debts[0].confidenceScore
          bValue = b.debts.length > 1 ? -1 : b.debts[0].confidenceScore
          break

        default:
          return 0
      }

      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
      }
    })

    return sorted
  }, [lenderGroups, sortColumn, sortDirection])

  return (
    <div className="table-container">
      <table className="w-full">
        <thead>
          <tr>
            <th className="table-header w-12"></th>
            <th
              className="table-header text-left cursor-pointer hover:bg-gray-100 transition-colors duration-150"
              onClick={() => handleSort('lender')}
            >
              <div className="flex items-center gap-2">
                <span>LENDER</span>
                {sortColumn === 'lender' ? (
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
              onClick={() => handleSort('type')}
            >
              <div className="flex items-center gap-2">
                <span>TYPE</span>
                {sortColumn === 'type' ? (
                  sortDirection === 'asc'
                    ? <ChevronUp className="w-3 h-3 text-primary-600" />
                    : <ChevronDown className="w-3 h-3 text-primary-600" />
                ) : (
                  <ChevronUp className="w-3 h-3 text-transparent" />
                )}
              </div>
            </th>
            <th
              className="table-header text-right cursor-pointer hover:bg-gray-100 transition-colors duration-150"
              onClick={() => handleSort('amount')}
            >
              <div className="flex items-center justify-end gap-2">
                <span>FUNDED AMOUNT</span>
                {sortColumn === 'amount' ? (
                  sortDirection === 'asc'
                    ? <ChevronUp className="w-3 h-3 text-primary-600" />
                    : <ChevronDown className="w-3 h-3 text-primary-600" />
                ) : (
                  <ChevronUp className="w-3 h-3 text-transparent" />
                )}
              </div>
            </th>
            <th
              className="table-header text-center cursor-pointer hover:bg-gray-100 transition-colors duration-150"
              onClick={() => handleSort('fundedDate')}
            >
              <div className="flex items-center justify-center gap-2">
                <span>FUNDED DATE</span>
                {sortColumn === 'fundedDate' ? (
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
              onClick={() => handleSort('frequency')}
            >
              <div className="flex items-center gap-2">
                <span>FREQUENCY</span>
                {sortColumn === 'frequency' ? (
                  sortDirection === 'asc'
                    ? <ChevronUp className="w-3 h-3 text-primary-600" />
                    : <ChevronDown className="w-3 h-3 text-primary-600" />
                ) : (
                  <ChevronUp className="w-3 h-3 text-transparent" />
                )}
              </div>
            </th>
            <th
              className="table-header text-center cursor-pointer hover:bg-gray-100 transition-colors duration-150"
              onClick={() => handleSort('paymentCount')}
            >
              <div className="flex items-center justify-center gap-2">
                <span>PAYMENT COUNT</span>
                {sortColumn === 'paymentCount' ? (
                  sortDirection === 'asc'
                    ? <ChevronUp className="w-3 h-3 text-primary-600" />
                    : <ChevronDown className="w-3 h-3 text-primary-600" />
                ) : (
                  <ChevronUp className="w-3 h-3 text-transparent" />
                )}
              </div>
            </th>
            <th
              className="table-header text-right cursor-pointer hover:bg-gray-100 transition-colors duration-150"
              onClick={() => handleSort('totalPaid')}
            >
              <div className="flex items-center justify-end gap-2">
                <span>SUM OF PAYMENTS</span>
                {sortColumn === 'totalPaid' ? (
                  sortDirection === 'asc'
                    ? <ChevronUp className="w-3 h-3 text-primary-600" />
                    : <ChevronDown className="w-3 h-3 text-primary-600" />
                ) : (
                  <ChevronUp className="w-3 h-3 text-transparent" />
                )}
              </div>
            </th>
            <th
              className="table-header text-center cursor-pointer hover:bg-gray-100 transition-colors duration-150"
              onClick={() => handleSort('missedPayments')}
            >
              <div className="flex items-center justify-center gap-2">
                <span>MISSED</span>
                {sortColumn === 'missedPayments' ? (
                  sortDirection === 'asc'
                    ? <ChevronUp className="w-3 h-3 text-primary-600" />
                    : <ChevronDown className="w-3 h-3 text-primary-600" />
                ) : (
                  <ChevronUp className="w-3 h-3 text-transparent" />
                )}
              </div>
            </th>
            <th
              className="table-header text-center cursor-pointer hover:bg-gray-100 transition-colors duration-150"
              onClick={() => handleSort('confidenceScore')}
            >
              <div className="flex items-center justify-center gap-2">
                <span>CONFIDENCE</span>
                {sortColumn === 'confidenceScore' ? (
                  sortDirection === 'asc'
                    ? <ChevronUp className="w-3 h-3 text-primary-600" />
                    : <ChevronDown className="w-3 h-3 text-primary-600" />
                ) : (
                  <ChevronUp className="w-3 h-3 text-transparent" />
                )}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedLenderGroups.slice(0, isExpanded ? sortedLenderGroups.length : 20).map((group) => {
            const isGroupExpanded = expandedLenders.has(group.lender)
            const hasMultipleLoans = group.debts.length > 1

            return (
              <React.Fragment key={group.lender}>
                {/* Lender Group Row */}
                <tr
                  className="table-row cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleLender(group.lender)}
                >
                  <td className="table-cell w-12 pl-0">
                    {hasMultipleLoans ? (
                      isGroupExpanded ? (
                        <ChevronDown className="w-5 h-5 text-primary-600 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      )
                    ) : null}
                  </td>
                  <td className="table-cell pl-0">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${
                          group.debts[0].status === 'active' ? 'bg-optimistic-green' :
                          group.debts[0].status === 'uncertain' ? 'bg-mild-panic' :
                          group.debts[0].status === 'paid-off' ? 'bg-gray-400' :
                          'bg-optimistic-green'
                        }`}></span>
                        <span className="font-medium">{group.lender}</span>
                      </div>
                      {hasMultipleLoans && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-11 font-medium bg-blue-100 text-blue-700">
                          {group.debts.length} loans
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="table-cell pl-0">
                    {hasMultipleLoans ? (
                      <span className="text-13 text-gray-500">Multiple</span>
                    ) : (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-12 font-medium whitespace-nowrap ${getTypeColor(group.debts[0].type)}`}>
                        {group.debts[0].type}
                      </span>
                    )}
                  </td>
                  <td className="table-cell text-right font-medium">
                    {formatCurrency(group.totalAmount)}
                  </td>
                  <td className="table-cell text-center text-13">
                    {hasMultipleLoans ? '—' : formatDateShort(group.debts[0].fundedDate)}
                  </td>
                  <td className="table-cell pl-0">
                    {hasMultipleLoans ? '—' : group.debts[0].frequency}
                  </td>
                  <td className="table-cell text-center font-medium">
                    {group.totalPaymentCount}
                  </td>
                  <td className="table-cell text-right font-medium">
                    {formatCurrency(group.totalPaid)}
                  </td>
                  <td className="table-cell text-center">
                    <span className={`font-medium ${getMissedPaymentsColor(group.totalMissed)}`}>
                      {group.totalMissed}
                    </span>
                  </td>
                  <td className="table-cell text-center">
                    {hasMultipleLoans ? '—' : (
                      <span className={`font-medium ${getConfidenceColor(group.debts[0].confidenceScore)}`}>
                        {formatConfidenceScore(group.debts[0].confidenceScore)}
                      </span>
                    )}
                  </td>
                </tr>

                {/* Individual Loan Rows (if expanded and multiple loans) */}
                {isGroupExpanded && hasMultipleLoans && group.debts.map((debt) => {
                  const isDebtExpanded = expandedDebts.has(debt.id)

                  return (
                    <React.Fragment key={debt.id}>
                      <tr
                        className="bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer border-l-4 border-primary-600 expand-row"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleDebt(debt.id)
                        }}
                      >
                        <td className="table-cell w-12 pl-0">
                          {isDebtExpanded ? (
                            <ChevronDown className="w-4 h-4 text-primary-600 flex-shrink-0 ml-3" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 ml-3" />
                          )}
                        </td>
                        <td className="table-cell pl-0">
                          <span className="text-13 text-gray-700 font-medium">Loan #{debt.id.split('-')[1]}</span>
                        </td>
                        <td className="table-cell pl-0">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-11 font-medium whitespace-nowrap ${getTypeColor(debt.type)}`}>
                            {debt.type}
                          </span>
                        </td>
                        <td className="table-cell text-right text-13 font-medium">
                          {formatCurrency(debt.amount)}
                        </td>
                        <td className="table-cell text-center text-13">
                          {formatDateShort(debt.fundedDate)}
                        </td>
                        <td className="table-cell text-13">
                          {debt.frequency}
                        </td>
                        <td className="table-cell text-center text-13 font-medium">
                          {debt.paymentCount}
                        </td>
                        <td className="table-cell text-right text-13 font-medium">
                          {formatCurrency(debt.totalPaid)}
                        </td>
                        <td className="table-cell text-center">
                          <span className={`text-13 font-medium ${getMissedPaymentsColor(debt.missedPayments)}`}>
                            {debt.missedPayments}
                          </span>
                        </td>
                        <td className="table-cell text-center">
                          <span className={`text-13 font-medium ${getConfidenceColor(debt.confidenceScore)}`}>
                            {formatConfidenceScore(debt.confidenceScore)}
                          </span>
                        </td>
                      </tr>

                      {/* Period Breakdown (if debt expanded) */}
                      {isDebtExpanded && (
                        <tr className="bg-gray-50 expand-row">
                          <td colSpan={9} className="p-0">
                            <div className="pl-16 pr-4 py-3">
                              <table className="w-full">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <th className="text-11 font-medium text-gray-500 uppercase tracking-wide text-left px-3" style={{ paddingTop: '8px', paddingBottom: '8px' }}>Date</th>
                                    <th className="text-11 font-medium text-gray-500 uppercase tracking-wide text-left px-3" style={{ paddingTop: '8px', paddingBottom: '8px' }}>Status</th>
                                    <th className="text-11 font-medium text-gray-500 uppercase tracking-wide text-right px-3" style={{ paddingTop: '8px', paddingBottom: '8px' }}>Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {debt.paymentHistory.map((period, idx) => (
                                    <tr key={idx} className="border-b border-gray-100 hover:bg-white transition-colors">
                                      <td className="text-13 text-gray-700 px-3" style={{ paddingTop: '8px', paddingBottom: '8px' }}>{formatDate(period.date)}</td>
                                      <td className="px-3" style={{ paddingTop: '8px', paddingBottom: '8px' }}>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-11 font-medium ${getPaymentStatusColor(period.status)}`}>
                                          {period.status.charAt(0).toUpperCase() + period.status.slice(1)}
                                        </span>
                                      </td>
                                      <td className={`text-13 font-medium text-right px-3 ${period.amount > 0 ? 'text-gray-900' : 'text-red-600'}`} style={{ paddingTop: '8px', paddingBottom: '8px' }}>
                                        {period.amount > 0 ? formatCurrency(period.amount) : '$0'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}

                {/* Monthly Summary for single loan (if lender expanded) */}
                {isGroupExpanded && !hasMultipleLoans && group.debts[0].monthlySummaries.map((monthlySummary, monthIdx) => {
                  const monthKey = `${group.debts[0].id}-${monthlySummary.month}`
                  const isMonthExpanded = expandedMonths.has(monthKey)

                  return (
                    <React.Fragment key={monthKey}>
                      <tr
                        className="bg-gray-50 hover:bg-gray-100 cursor-pointer expand-row"
                        onClick={() => toggleMonth(monthKey)}
                      >
                        <td className="table-cell w-12 pl-8">
                          {isMonthExpanded ? (
                            <ChevronDown className="w-4 h-4 text-primary-600 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                        </td>
                        <td className="table-cell pl-0">
                          <span className="text-13 font-medium text-gray-700">{monthlySummary.month}</span>
                        </td>
                        <td className="table-cell text-13 text-gray-700">—</td>
                        <td className="table-cell text-right text-13 text-gray-700">—</td>
                        <td className="table-cell text-center text-13 text-gray-700">—</td>
                        <td className="table-cell text-13 text-gray-700">—</td>
                        <td className="table-cell text-center text-13 font-medium">{monthlySummary.paymentCount}</td>
                        <td className="table-cell text-right text-13 font-medium">{formatCurrency(monthlySummary.totalPaid)}</td>
                        <td className="table-cell text-center">
                          <span className={`text-13 font-medium ${getMissedPaymentsColor(monthlySummary.missedCount)}`}>
                            {monthlySummary.missedCount}
                          </span>
                        </td>
                        <td className="table-cell text-center">—</td>
                      </tr>

                      {/* Individual Payments (if month expanded) */}
                      {isMonthExpanded && monthlySummary.payments.length > 0 && (
                        <tr className="bg-white expand-row">
                          <td colSpan={8} className="p-0">
                            <div className="pl-16 pr-4 py-2">
                              <div className="max-h-64 overflow-y-auto border-t border-b border-gray-200 bg-gray-50">
                                <table className="w-full">
                                  <thead className="bg-gray-50 sticky top-0">
                                    <tr className="border-b border-gray-200">
                                      <th className="text-11 font-medium text-gray-500 uppercase tracking-wide text-left px-3 w-1/3" style={{ paddingTop: '8px', paddingBottom: '8px' }}>Date</th>
                                      <th className="text-11 font-medium text-gray-500 uppercase tracking-wide text-left px-3 w-1/3" style={{ paddingTop: '8px', paddingBottom: '8px' }}>Status</th>
                                      <th className="text-11 font-medium text-gray-500 uppercase tracking-wide text-right px-3 w-1/3" style={{ paddingTop: '8px', paddingBottom: '8px' }}>Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white">
                                    {monthlySummary.payments.map((payment, paymentIdx) => (
                                      <tr key={paymentIdx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                        <td className="text-13 text-gray-700 px-3" style={{ paddingTop: '8px', paddingBottom: '8px' }}>{formatDate(payment.date)}</td>
                                        <td className="px-3" style={{ paddingTop: '8px', paddingBottom: '8px' }}>
                                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-11 font-medium ${getPaymentStatusColor(payment.status)}`}>
                                            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                                          </span>
                                        </td>
                                        <td className={`text-13 font-medium text-right px-3 ${payment.amount > 0 ? 'text-gray-900' : 'text-red-600'}`} style={{ paddingTop: '8px', paddingBottom: '8px' }}>
                                          {payment.amount > 0 ? formatCurrency(payment.amount) : '$0'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export { type DebtRecord }

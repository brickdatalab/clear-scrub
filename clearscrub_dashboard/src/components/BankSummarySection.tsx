import React, { useState, useMemo, useCallback } from 'react'
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, type StatementTransaction } from '../services/api'

interface Transaction {
  period: string
  deposits: number
  true_revenue: number
  avg_daily_balance: number
  deposit_count: number
  neg_ending_days: number
  statements?: Array<{
    statement_id?: string
    account_number: string
    deposits: number
    true_revenue: number
    avg_daily_balance: number
    deposit_count: number
    neg_ending_days: number
    transactions?: Array<{
      id: string
      date: string
      description: string
      amount: number
      type: 'deposit' | 'withdrawal' | 'fee'
      balance: number
    }>
  }>
}

interface BankSummarySectionProps {
  transactions: Transaction[]
  withholdingPercentage: number
  onStatementClick: (statement: any, period: string) => void
  selectedStatement?: any
  isPanelOpen: boolean
}

// Create formatter singletons at module level for performance
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
})

const BankSummarySection: React.FC<BankSummarySectionProps> = React.memo(({
  transactions,
  withholdingPercentage,
  onStatementClick,
  selectedStatement,
  isPanelOpen
}) => {
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null)
  const [bankSortColumn, setBankSortColumn] = useState<string | null>(null)
  const [bankSortDirection, setBankSortDirection] = useState<'asc' | 'desc'>('asc')
  const [isBankExpanded, setIsBankExpanded] = useState(false)

  // Lazy-loading state for transactions
  const [loadedTransactions, setLoadedTransactions] = useState<Record<string, StatementTransaction[]>>({})
  const [loadingStatements, setLoadingStatements] = useState<Record<string, boolean>>({})

  const formatCurrency = useCallback((amount: number) => {
    return currencyFormatter.format(amount)
  }, [])

  const formatPeriod = useCallback((period: string) => {
    const [month, year] = period.split(' ')
    const date = new Date(`${month} 1, ${year}`)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }, [])

  const handlePeriodClick = async (transaction: Transaction) => {
    const statements = transaction.statements || []

    if (statements.length === 1) {
      // Single statement - load transactions and open panel
      await loadStatementTransactions(statements[0], transaction.period)
      setExpandedPeriod(null)
    } else if (statements.length > 1) {
      // Multiple statements - show dropdown
      setExpandedPeriod(expandedPeriod === transaction.period ? null : transaction.period)
    }
  }

  const loadStatementTransactions = async (statement: any, period: string) => {
    const statementId = statement.statement_id

    // If no statement_id, fall back to existing transactions (mock data scenario)
    if (!statementId) {
      onStatementClick(statement, period)
      return
    }

    // Already loaded? Just open the panel
    const cacheKey = statementId
    if (loadedTransactions[cacheKey]) {
      const enrichedStatement = {
        ...statement,
        transactions: loadedTransactions[cacheKey]
      }
      onStatementClick(enrichedStatement, period)
      return
    }

    // Load transactions from API
    setLoadingStatements(prev => ({ ...prev, [cacheKey]: true }))
    try {
      const txs = await api.getStatementTransactions(statementId)
      setLoadedTransactions(prev => ({ ...prev, [cacheKey]: txs }))

      const enrichedStatement = {
        ...statement,
        transactions: txs
      }
      onStatementClick(enrichedStatement, period)
    } catch (error) {
      console.error('Failed to load transactions:', error)
      // Still open panel with empty transactions
      onStatementClick(statement, period)
    } finally {
      setLoadingStatements(prev => ({ ...prev, [cacheKey]: false }))
    }
  }

  const handleStatementClick = async (statement: any, period: string) => {
    await loadStatementTransactions(statement, period)
  }

  const handleBankSort = (column: string) => {
    if (bankSortColumn === column) {
      setBankSortDirection(bankSortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setBankSortColumn(column)
      setBankSortDirection('asc')
    }
  }

  const sortedTransactions = useMemo(() => {
    if (!bankSortColumn) return transactions

    const sorted = [...transactions].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (bankSortColumn) {
        case 'period':
          aValue = new Date(a.period).getTime()
          bValue = new Date(b.period).getTime()
          break
        case 'deposits':
          aValue = a.deposits
          bValue = b.deposits
          break
        case 'true_revenue':
          aValue = a.true_revenue
          bValue = b.true_revenue
          break
        case 'avg_daily_balance':
          aValue = a.avg_daily_balance
          bValue = b.avg_daily_balance
          break
        case 'deposit_count':
          aValue = a.deposit_count
          bValue = b.deposit_count
          break
        case 'neg_ending_days':
          aValue = a.neg_ending_days
          bValue = b.neg_ending_days
          break
        default:
          return 0
      }

      if (bankSortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
      }
    })

    return sorted
  }, [transactions, bankSortColumn, bankSortDirection])

  return (
    <Card title="Bank Summary">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header w-12"></th>
              <th
                className="table-header cursor-pointer hover:bg-gray-100 transition-colors duration-150"
                onClick={() => handleBankSort('period')}
              >
                <div className="flex items-center gap-2">
                  <span>PERIOD</span>
                  {bankSortColumn === 'period' ? (
                    bankSortDirection === 'asc'
                      ? <ChevronUp className="w-3 h-3 text-primary-600" />
                      : <ChevronDown className="w-3 h-3 text-primary-600" />
                  ) : (
                    <ChevronUp className="w-3 h-3 text-transparent" />
                  )}
                </div>
              </th>
              <th
                className="table-header cursor-pointer hover:bg-gray-100 transition-colors duration-150"
                onClick={() => handleBankSort('deposits')}
              >
                <div className="flex items-center gap-2">
                  <span>DEPOSITS</span>
                  {bankSortColumn === 'deposits' ? (
                    bankSortDirection === 'asc'
                      ? <ChevronUp className="w-3 h-3 text-primary-600" />
                      : <ChevronDown className="w-3 h-3 text-primary-600" />
                  ) : (
                    <ChevronUp className="w-3 h-3 text-transparent" />
                  )}
                </div>
              </th>
              <th
                className="table-header cursor-pointer hover:bg-gray-100 transition-colors duration-150"
                onClick={() => handleBankSort('true_revenue')}
              >
                <div className="flex items-center gap-2">
                  <span>TRUE REVENUE</span>
                  {bankSortColumn === 'true_revenue' ? (
                    bankSortDirection === 'asc'
                      ? <ChevronUp className="w-3 h-3 text-primary-600" />
                      : <ChevronDown className="w-3 h-3 text-primary-600" />
                  ) : (
                    <ChevronUp className="w-3 h-3 text-transparent" />
                  )}
                </div>
              </th>
              <th
                className="table-header cursor-pointer hover:bg-gray-100 transition-colors duration-150"
                onClick={() => handleBankSort('avg_daily_balance')}
              >
                <div className="flex items-center gap-2">
                  <span>AVERAGE DAILY BALANCE</span>
                  {bankSortColumn === 'avg_daily_balance' ? (
                    bankSortDirection === 'asc'
                      ? <ChevronUp className="w-3 h-3 text-primary-600" />
                      : <ChevronDown className="w-3 h-3 text-primary-600" />
                  ) : (
                    <ChevronUp className="w-3 h-3 text-transparent" />
                  )}
                </div>
              </th>
              <th
                className="table-header cursor-pointer hover:bg-gray-100 transition-colors duration-150"
                onClick={() => handleBankSort('deposit_count')}
              >
                <div className="flex items-center gap-2">
                  <span>DEPOSIT COUNT</span>
                  {bankSortColumn === 'deposit_count' ? (
                    bankSortDirection === 'asc'
                      ? <ChevronUp className="w-3 h-3 text-primary-600" />
                      : <ChevronDown className="w-3 h-3 text-primary-600" />
                  ) : (
                    <ChevronUp className="w-3 h-3 text-transparent" />
                  )}
                </div>
              </th>
              <th className="table-header">WITHHOLD %</th>
              <th
                className="table-header cursor-pointer hover:bg-gray-100 transition-colors duration-150"
                onClick={() => handleBankSort('neg_ending_days')}
              >
                <div className="flex items-center gap-2">
                  <span>NEGATIVE DAYS</span>
                  {bankSortColumn === 'neg_ending_days' ? (
                    bankSortDirection === 'asc'
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
            {sortedTransactions.slice(0, isBankExpanded ? sortedTransactions.length : 20).map((transaction, index) => {
              const statements = transaction.statements || []
              const isActive = statements.length === 1 &&
                              selectedStatement?.account_number === statements[0]?.account_number &&
                              isPanelOpen

              return (
                <React.Fragment key={index}>
                  <tr
                    className={`table-row cursor-pointer transition-colors ${isActive ? 'bg-primary-50 hover:bg-primary-50' : 'hover:bg-gray-50'}`}
                    onClick={() => handlePeriodClick(transaction)}
                  >
                    <td className="table-cell w-12 pl-0">
                      {transaction.statements && transaction.statements.length > 1 ? (
                        expandedPeriod === transaction.period ? (
                          <ChevronDown className="w-5 h-5 text-primary-600 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        )
                      ) : loadingStatements[statements[0]?.statement_id || ''] ? (
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                      ) : null}
                    </td>
                    <td className="table-cell pl-0">
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{formatPeriod(transaction.period)}</span>
                        {transaction.statements && transaction.statements.length > 1 && (
                          <Badge variant="secondary" className="text-11">
                            {transaction.statements.length} accounts
                          </Badge>
                        )}
                        {loadingStatements[statements[0]?.statement_id || ''] && statements.length === 1 && (
                          <span className="text-11 text-gray-500">Loading...</span>
                        )}
                      </div>
                    </td>
                    <td className="table-cell">{formatCurrency(transaction.deposits)}</td>
                    <td className="table-cell text-green-600 font-medium">{formatCurrency(transaction.true_revenue)}</td>
                    <td className="table-cell">{formatCurrency(transaction.avg_daily_balance)}</td>
                    <td className="table-cell">{transaction.deposit_count}</td>
                    <td className="table-cell">{withholdingPercentage}%</td>
                    <td className="table-cell">{transaction.neg_ending_days}</td>
                  </tr>

                  {/* Dropdown for multiple statements */}
                  {expandedPeriod === transaction.period && transaction.statements && transaction.statements.length > 1 && (
                    <>
                      {transaction.statements.map((statement, statementIndex) => {
                        const isStatementActive = selectedStatement?.account_number === statement.account_number && isPanelOpen
                        const isLoading = loadingStatements[statement.statement_id || '']

                        return (
                          <tr
                            key={statementIndex}
                            className={`transition-colors cursor-pointer border-l-4 border-primary-600 expand-row ${isStatementActive ? 'bg-primary-50 hover:bg-primary-50' : 'bg-gray-50 hover:bg-gray-100'}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStatementClick(statement, transaction.period)
                            }}
                          >
                            <td className="py-3 px-2 w-12">
                              {isLoading && (
                                <div className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-primary-600"></div>
                              )}
                            </td>
                            <td className="table-cell">
                              <div className="flex items-center gap-2">
                                <span className="text-13 text-gray-700 font-medium">{statement.account_number}</span>
                                {isLoading && (
                                  <span className="text-11 text-gray-500">Loading...</span>
                                )}
                              </div>
                            </td>
                            <td className="table-cell text-13">{formatCurrency(statement.deposits)}</td>
                            <td className="table-cell text-13 text-green-600">{formatCurrency(statement.true_revenue)}</td>
                            <td className="table-cell text-13">{formatCurrency(statement.avg_daily_balance)}</td>
                            <td className="table-cell text-13">{statement.deposit_count}</td>
                            <td className="table-cell text-13">{withholdingPercentage}%</td>
                            <td className="table-cell text-13">{statement.neg_ending_days}</td>
                          </tr>
                        )
                      })}
                    </>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Expand/Collapse Button */}
      {sortedTransactions.length > 20 && (
        <div className="flex justify-center border-t border-gray-200 bg-gray-50 px-4 py-0">
          <Button
            variant="ghost"
            onClick={() => setIsBankExpanded(!isBankExpanded)}
            className="py-3 px-6 text-14 font-medium flex items-center gap-2"
          >
            {isBankExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                <span>Show Less</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                <span>Show More ({sortedTransactions.length - 20} more)</span>
              </>
            )}
          </Button>
        </div>
      )}
    </Card>
  )
})

BankSummarySection.displayName = 'BankSummarySection'

export default BankSummarySection

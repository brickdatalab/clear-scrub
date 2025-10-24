import React from 'react'
import { X, Calendar, DollarSign, TrendingUp, Hash, AlertTriangle, BarChart3 } from 'lucide-react'

interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  type: 'deposit' | 'withdrawal' | 'fee'
}

interface StatementData {
  period: string
  account_number: string
  deposits: number
  true_revenue: number
  avg_daily_balance: number
  deposit_count: number
  neg_ending_days: number
  transactions: Transaction[]
}

interface BankStatementPanelProps {
  statement: StatementData | null
  isOpen: boolean
  onClose: () => void
}

const BankStatementPanel: React.FC<BankStatementPanelProps> = ({ statement, isOpen, onClose }) => {
  if (!isOpen || !statement) return null

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return <TrendingUp className="w-3 h-3 text-green-600" />
      case 'withdrawal':
        return <TrendingUp className="w-3 h-3 text-red-600 rotate-180" />
      case 'fee':
        return <AlertTriangle className="w-3 h-3 text-orange-600" />
      default:
        return <DollarSign className="w-3 h-3 text-gray-600" />
    }
  }

  const getAmountColor = (type: string) => {
    switch (type) {
      case 'deposit':
        return 'text-green-600'
      case 'withdrawal':
      case 'fee':
        return 'text-red-600'
      default:
        return 'text-gray-900'
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-xl z-50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-16 font-semibold text-gray-900">{statement.period}</h3>
            <p className="text-13 text-gray-500">Account: {statement.account_number}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-6 transition-colors duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-gray-200 rounded-6 p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              <div>
                <p className="text-11 text-gray-500 uppercase tracking-wide">Deposits</p>
                <p className="text-14 font-semibold text-gray-900">{formatCurrency(statement.deposits)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-6 p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <div>
                <p className="text-11 text-gray-500 uppercase tracking-wide">True Revenue</p>
                <p className="text-14 font-semibold text-green-600">{formatCurrency(statement.true_revenue)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-6 p-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <div>
                <p className="text-11 text-gray-500 uppercase tracking-wide">Avg Daily Balance</p>
                <p className="text-14 font-semibold text-gray-900">{formatCurrency(statement.avg_daily_balance)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-6 p-3">
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-purple-600" />
              <div>
                <p className="text-11 text-gray-500 uppercase tracking-wide">Deposit Count</p>
                <p className="text-14 font-semibold text-gray-900">{statement.deposit_count}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <h4 className="text-12 font-semibold text-gray-900">Transactions</h4>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-2">
            <div className="space-y-0.5">
              {statement.transactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between py-1 px-2 hover:bg-gray-50 rounded-3 transition-colors duration-150">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getTransactionIcon(transaction.type)}
                    <span className="text-11 text-gray-900 truncate flex-1">{transaction.description}</span>
                    <span className="text-10 text-gray-500 whitespace-nowrap">{formatDate(transaction.date)}</span>
                  </div>
                  <span className={`text-11 font-medium whitespace-nowrap ml-3 ${getAmountColor(transaction.type)}`}>
                    {transaction.type === 'deposit' ? '+' : ''}{formatCurrency(transaction.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BankStatementPanel

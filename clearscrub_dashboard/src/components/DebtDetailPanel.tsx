import React from 'react'
import { X, Calendar, DollarSign, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react'
import { DebtRecord } from './DebtSummaryTable'

interface DebtDetailPanelProps {
  debt: DebtRecord
  isOpen: boolean
  onClose: () => void
  panelIndex: number
}

export default function DebtDetailPanel({ debt, isOpen, onClose, panelIndex }: DebtDetailPanelProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Math.abs(amount))
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Debt Consolidation':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'MCA':
        return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'Bankruptcy':
        return 'text-red-600 bg-red-50 border-red-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getTransactionTypeIcon = (type: string) => {
    switch (type) {
      case 'payment':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'fee':
        return <AlertTriangle className="w-4 h-4 text-red-500" />
      case 'interest':
        return <TrendingDown className="w-4 h-4 text-yellow-500" />
      default:
        return <DollarSign className="w-4 h-4 text-gray-500" />
    }
  }

  const getMissedPaymentsStatus = (count: number) => {
    if (count === 0) return { text: 'Current', color: 'text-green-600 bg-green-50' }
    if (count <= 2) return { text: 'At Risk', color: 'text-yellow-600 bg-yellow-50' }
    return { text: 'Delinquent', color: 'text-red-600 bg-red-50' }
  }

  const getConfidenceLevel = (score: number) => {
    if (score >= 0.9) return { text: 'High', color: 'text-green-600 bg-green-50' }
    if (score >= 0.8) return { text: 'Medium', color: 'text-yellow-600 bg-yellow-50' }
    return { text: 'Low', color: 'text-red-600 bg-red-50' }
  }

  const status = getMissedPaymentsStatus(debt.missedPayments)
  const confidence = getConfidenceLevel(debt.confidenceScore)

  // Calculate panel position based on index
  const rightOffset = panelIndex * 400 // Each panel is 400px wide

  return (
    <div 
      className={`fixed top-0 right-0 h-full w-96 bg-white border-l border-gray-200 shadow-xl transform transition-transform duration-300 ease-in-out z-50 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{ 
        right: `${rightOffset}px`,
        zIndex: 50 - panelIndex // Higher panels have lower z-index
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50">
        <div className="flex-1">
          <h2 className="text-16 font-semibold text-gray-900 truncate">{debt.lender}</h2>
          <div className="mt-1">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-12 font-semibold border ${getTypeColor(debt.type)}`}>
              {debt.type}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-200 rounded-6 transition-colors duration-150"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Summary Stats */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-6 p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-gray-400" />
                <span className="text-12 text-gray-500 font-medium">Transaction Count</span>
              </div>
              <p className="text-16 font-semibold text-gray-900">{debt.transactions.length}</p>
            </div>
            <div className="bg-gray-50 rounded-6 p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-gray-400" />
                <span className="text-12 text-gray-500 font-medium">Sum of Payments</span>
              </div>
              <p className="text-16 font-semibold text-gray-900">
                {formatCurrency(debt.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0))}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-6 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-12 text-gray-500 font-medium">Frequency</span>
              </div>
              <p className="text-16 font-semibold text-gray-900">{debt.frequency}</p>
            </div>
            <div className="bg-gray-50 rounded-6 p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-gray-400" />
                <span className="text-12 text-gray-500 font-medium">Missed Payments</span>
              </div>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-12 font-semibold ${
                debt.missedPayments === 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
              }`}>
                {debt.missedPayments === 0 ? 'FALSE' : 'TRUE'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-6 p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-gray-400" />
                <span className="text-12 text-gray-500 font-medium">Confidence</span>
              </div>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-12 font-semibold ${confidence.color}`}>
                {confidence.text}
              </span>
            </div>
            <div className="bg-gray-50 rounded-6 p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-gray-400" />
                <span className="text-12 text-gray-500 font-medium">Status</span>
              </div>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-12 font-semibold text-green-600 bg-green-50">
                Current
              </span>
            </div>
          </div>
        </div>

        {/* Transactions */}
        <div className="border-t border-gray-200 flex-1 overflow-y-auto">
          <div className="p-5 pb-3">
            <h3 className="text-14 font-semibold text-gray-900 mb-4">Transactions</h3>
          </div>
          <div className="space-y-0 pb-5">
            {debt.transactions.map((transaction) => (
              <div key={transaction.id} className="px-5 py-3 hover:bg-gray-50 transition-colors duration-150">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {getTransactionTypeIcon(transaction.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-14 font-medium text-gray-900 truncate">
                        {transaction.description}
                      </p>
                      <p className="text-12 text-gray-500">
                        {formatDate(transaction.date)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-14 font-semibold ${
                      transaction.amount < 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {transaction.amount < 0 ? '-' : '+'}{formatCurrency(transaction.amount)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

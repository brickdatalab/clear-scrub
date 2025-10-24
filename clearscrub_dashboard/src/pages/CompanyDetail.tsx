import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, ChevronDown, X } from 'lucide-react'
import { List as FixedSizeList } from 'react-window'
import DebtSummaryContainer from '../components/DebtSummaryContainer'
import BankSummarySection from '../components/BankSummarySection'
import FilesSection from '../components/FilesSection'
import ApplicationDetailsSidebar from '../components/ApplicationDetailsSidebar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { api, type CompanyDetailResponse } from '../services/api'
import { useAuth } from '../hooks/useAuth'

interface Address {
  address_line_1: string
  address_line_2?: string
  city: string
  state: string
  zip: string
}

interface Business {
  address: Address
  annual_revenue: number | null
  dba: string
  ein: string
  email: string | null
  incorporated_state: string
  industry: string
  monthly_revenue: number | null
  company_name: string
  phone_number: string | null
  start_date: string
  type_of_business_entity: string
  website: string | null
}

interface Funding {
  amount_requested: number
  loan_purpose: string
}

interface Owner {
  address: Address
  cell_phone: string | null
  credit_score: number | null
  date_of_signature: string | null
  dob: string | null
  email: string | null
  first_name: string
  home_phone: string | null
  is_signed: boolean | null
  last_name: string
  ownership_percent: number | null
  ssn: string
}

interface CompanyData {
  id: string
  company_id: string
  name: string
  email: string
  status: 'processed' | 'pending' | 'failed'
  created_at: string
  processing_status: string
  lendsaas_synced: boolean
  crm_synced: boolean
  recent_spend: number
  avg_monthly_revenue: number
  total_transactions: number
  account_count: number
  business_temperature?: 'Very Good' | 'Good' | 'Decent' | 'Bad'
  fraud_reading?: 'Pass' | 'Fail' | 'Human Loop'
  payment_methods: Array<{
    type: string
    last_four: string
    expires: string
  }>
  transactions: Array<{
    period: string
    deposits: number
    true_revenue: number
    avg_daily_balance: number
    deposit_count: number
    neg_ending_days: number
    statements?: Array<{
      account_number: string
      deposits: number
      true_revenue: number
      avg_daily_balance: number
      deposit_count: number
      neg_ending_days: number
      transactions: Array<{
        id: string
        date: string
        description: string
        amount: number
        type: 'deposit' | 'withdrawal' | 'fee'
        balance: number
      }>
    }>
  }>
  statement_count: number
  debt_count: number
  monthly_debt_payments: number
  withholding_percentage: number
  activity: Array<{
    action: string
    timestamp: string
  }>
  business?: Business
  funding?: Funding
  owner?: Owner
  owner_2?: Owner
}

// Mock data removed - now using API

const mockCompaniesDataOLD: { [key: string]: CompanyData } = {
  'eus_SQ9H728DpXto2jvDid6CUx': {
    id: '1',
    company_id: 'eus_SQ9H728DpXto2jvDid6CUx',
    name: 'PARS CONSULTING ENGINEERS INC',
    email: 'info@parsconsulting.com',
    status: 'processed',
    created_at: '2024-07-15T10:30:00Z',
    processing_status: 'Processed',
    lendsaas_synced: true,
    crm_synced: true,
    recent_spend: 387654.32,
    avg_monthly_revenue: 129218.11,
    total_transactions: 47,
    account_count: 3,
    business_temperature: 'Good',
    fraud_reading: 'Pass',
    payment_methods: [
      {
        type: 'Visa Business',
        last_four: '4532',
        expires: 'Mar 2026'
      },
      {
        type: 'Mastercard Corporate',
        last_four: '8901',
        expires: 'Aug 2025'
      }
    ],
    transactions: [
      {
        period: 'Dec 2024',
        deposits: 312450.75,
        true_revenue: 104150.25,
        avg_daily_balance: 298450.30,
        deposit_count: 24,
        neg_ending_days: 1,
        statements: [
          {
            account_number: '****1234',
            deposits: 312450.75,
            true_revenue: 104150.25,
            avg_daily_balance: 298450.30,
            deposit_count: 24,
            neg_ending_days: 1,
            transactions: [
              { id: 'dec1', date: '2024-12-02', description: 'Year-End Project Payment', amount: 55000, type: 'deposit', balance: 298450.30 },
              { id: 'dec2', date: '2024-12-05', description: 'Holiday Bonus Distribution', amount: 28000, type: 'withdrawal', balance: 270450.30 },
              { id: 'dec3', date: '2024-12-10', description: 'Client Invoice Payment', amount: 72000, type: 'deposit', balance: 342450.30 },
              { id: 'dec4', date: '2024-12-15', description: 'Property Tax Payment', amount: 15000, type: 'withdrawal', balance: 327450.30 },
              { id: 'dec5', date: '2024-12-20', description: 'Emergency Project Advance', amount: 48000, type: 'deposit', balance: 375450.30 }
            ]
          }
        ]
      },
      {
        period: 'Jan 2025',
        deposits: 275890.50,
        true_revenue: 91963.50,
        avg_daily_balance: 285120.80,
        deposit_count: 20,
        neg_ending_days: 0,
        statements: [
          {
            account_number: '****1234',
            deposits: 275890.50,
            true_revenue: 91963.50,
            avg_daily_balance: 285120.80,
            deposit_count: 20,
            neg_ending_days: 0,
            transactions: [
              { id: 'jan1', date: '2025-01-03', description: 'New Year Contract Payment', amount: 60000, type: 'deposit', balance: 285120.80 },
              { id: 'jan2', date: '2025-01-08', description: 'January Payroll', amount: 32000, type: 'withdrawal', balance: 253120.80 },
              { id: 'jan3', date: '2025-01-12', description: 'Consulting Services Fee', amount: 45000, type: 'deposit', balance: 298120.80 },
              { id: 'jan4', date: '2025-01-18', description: 'Equipment Lease Payment', amount: 9500, type: 'withdrawal', balance: 288620.80 },
              { id: 'jan5', date: '2025-01-25', description: 'Project Milestone Revenue', amount: 68000, type: 'deposit', balance: 356620.80 }
            ]
          }
        ]
      },
      {
        period: 'Feb 2025',
        deposits: 295670.25,
        true_revenue: 98556.75,
        avg_daily_balance: 312450.60,
        deposit_count: 22,
        neg_ending_days: 2,
        statements: [
          {
            account_number: '****1234',
            deposits: 295670.25,
            true_revenue: 98556.75,
            avg_daily_balance: 312450.60,
            deposit_count: 22,
            neg_ending_days: 2,
            transactions: [
              { id: 'feb1', date: '2025-02-04', description: 'Monthly Maintenance Contract', amount: 52000, type: 'deposit', balance: 312450.60 },
              { id: 'feb2', date: '2025-02-07', description: 'Office Supplies & Equipment', amount: 14500, type: 'withdrawal', balance: 297950.60 },
              { id: 'feb3', date: '2025-02-11', description: 'Design Phase Completion', amount: 78000, type: 'deposit', balance: 375950.60 },
              { id: 'feb4', date: '2025-02-16', description: 'Insurance Annual Premium', amount: 22000, type: 'withdrawal', balance: 353950.60 },
              { id: 'feb5', date: '2025-02-22', description: 'Client Retainer Payment', amount: 41000, type: 'deposit', balance: 394950.60 }
            ]
          }
        ]
      },
      {
        period: 'Mar 2025',
        deposits: 328950.80,
        true_revenue: 109650.27,
        avg_daily_balance: 342780.45,
        deposit_count: 25,
        neg_ending_days: 1,
        statements: [
          {
            account_number: '****1234',
            deposits: 328950.80,
            true_revenue: 109650.27,
            avg_daily_balance: 342780.45,
            deposit_count: 25,
            neg_ending_days: 1,
            transactions: [
              { id: 'mar1', date: '2025-03-03', description: 'Q1 Project Completion Bonus', amount: 85000, type: 'deposit', balance: 342780.45 },
              { id: 'mar2', date: '2025-03-06', description: 'March Payroll & Benefits', amount: 38000, type: 'withdrawal', balance: 304780.45 },
              { id: 'mar3', date: '2025-03-10', description: 'Engineering Services Contract', amount: 62000, type: 'deposit', balance: 366780.45 },
              { id: 'mar4', date: '2025-03-15', description: 'Technology Upgrades', amount: 18500, type: 'withdrawal', balance: 348280.45 },
              { id: 'mar5', date: '2025-03-22', description: 'Additional Project Payment', amount: 72000, type: 'deposit', balance: 420280.45 }
            ]
          }
        ]
      },
      {
        period: 'Apr 2025',
        deposits: 354230.90,
        true_revenue: 118076.97,
        avg_daily_balance: 368920.55,
        deposit_count: 27,
        neg_ending_days: 0,
        statements: [
          {
            account_number: '****1234',
            deposits: 354230.90,
            true_revenue: 118076.97,
            avg_daily_balance: 368920.55,
            deposit_count: 27,
            neg_ending_days: 0,
            transactions: [
              { id: 'apr1', date: '2025-04-02', description: 'Spring Contract Renewal', amount: 92000, type: 'deposit', balance: 368920.55 },
              { id: 'apr2', date: '2025-04-07', description: 'Quarterly Tax Payment', amount: 42000, type: 'withdrawal', balance: 326920.55 },
              { id: 'apr3', date: '2025-04-12', description: 'Major Client Invoice', amount: 88000, type: 'deposit', balance: 414920.55 },
              { id: 'apr4', date: '2025-04-18', description: 'Employee Training & Development', amount: 12000, type: 'withdrawal', balance: 402920.55 },
              { id: 'apr5', date: '2025-04-25', description: 'Consulting Project Payment', amount: 54000, type: 'deposit', balance: 456920.55 }
            ]
          }
        ]
      },
      {
        period: 'May 2025',
        deposits: 368745.60,
        true_revenue: 122915.20,
        avg_daily_balance: 382560.75,
        deposit_count: 29,
        neg_ending_days: 1,
        statements: [
          {
            account_number: '****1234',
            deposits: 368745.60,
            true_revenue: 122915.20,
            avg_daily_balance: 382560.75,
            deposit_count: 29,
            neg_ending_days: 1,
            transactions: [
              { id: 'may1', date: '2025-05-05', description: 'Infrastructure Project Phase 2', amount: 98000, type: 'deposit', balance: 382560.75 },
              { id: 'may2', date: '2025-05-08', description: 'May Payroll & Bonuses', amount: 45000, type: 'withdrawal', balance: 337560.75 },
              { id: 'may3', date: '2025-05-13', description: 'Annual Maintenance Revenue', amount: 76000, type: 'deposit', balance: 413560.75 },
              { id: 'may4', date: '2025-05-19', description: 'Facility Expansion Costs', amount: 28000, type: 'withdrawal', balance: 385560.75 },
              { id: 'may5', date: '2025-05-27', description: 'Memorial Day Project Rush', amount: 82000, type: 'deposit', balance: 467560.75 }
            ]
          }
        ]
      },
      {
        period: 'Jun 2025',
        deposits: 387654.32,
        true_revenue: 129218.11,
        avg_daily_balance: 425789.45,
        deposit_count: 28,
        neg_ending_days: 2,
        statements: [
          {
            account_number: '****1234',
            deposits: 245000.00,
            true_revenue: 81666.67,
            avg_daily_balance: 285000.00,
            deposit_count: 18,
            neg_ending_days: 1,
            transactions: [
              { id: '1', date: '2025-06-02', description: 'Client Payment - Project Alpha', amount: 45000, type: 'deposit', balance: 285000.00 },
              { id: '2', date: '2025-06-05', description: 'Office Rent Payment', amount: 12000, type: 'withdrawal', balance: 273000.00 },
              { id: '3', date: '2025-06-08', description: 'Engineering Services Payment', amount: 65000, type: 'deposit', balance: 338000.00 },
              { id: '4', date: '2025-06-12', description: 'Equipment Purchase', amount: 25000, type: 'withdrawal', balance: 313000.00 },
              { id: '5', date: '2025-06-15', description: 'Consulting Fee Payment', amount: 35000, type: 'deposit', balance: 348000.00 }
            ]
          },
          {
            account_number: '****5678',
            deposits: 142654.32,
            true_revenue: 47551.44,
            avg_daily_balance: 140789.45,
            deposit_count: 10,
            neg_ending_days: 1,
            transactions: [
              { id: '6', date: '2025-06-03', description: 'Subcontractor Payment', amount: 28000, type: 'deposit', balance: 140789.45 },
              { id: '7', date: '2025-06-07', description: 'Insurance Premium', amount: 8500, type: 'withdrawal', balance: 132289.45 },
              { id: '8', date: '2025-06-10', description: 'Material Supplies Payment', amount: 42000, type: 'deposit', balance: 174289.45 },
              { id: '9', date: '2025-06-14', description: 'Utility Bills', amount: 3200, type: 'withdrawal', balance: 171089.45 },
              { id: '10', date: '2025-06-18', description: 'Project Milestone Payment', amount: 55000, type: 'deposit', balance: 226089.45 }
            ]
          }
        ]
      },
      {
        period: 'Jul 2025',
        deposits: 298450.25,
        true_revenue: 99483.42,
        avg_daily_balance: 325678.90,
        deposit_count: 22,
        neg_ending_days: 0,
        statements: [
          {
            account_number: '****1234',
            deposits: 298450.25,
            true_revenue: 99483.42,
            avg_daily_balance: 325678.90,
            deposit_count: 22,
            neg_ending_days: 0,
            transactions: [
              { id: '11', date: '2025-07-01', description: 'Monthly Retainer Payment', amount: 50000, type: 'deposit', balance: 325678.90 },
              { id: '12', date: '2025-07-05', description: 'Payroll Processing', amount: 35000, type: 'withdrawal', balance: 290678.90 },
              { id: '13', date: '2025-07-08', description: 'Design Services Payment', amount: 75000, type: 'deposit', balance: 365678.90 },
              { id: '14', date: '2025-07-12', description: 'Software Licensing', amount: 15000, type: 'withdrawal', balance: 350678.90 },
              { id: '15', date: '2025-07-15', description: 'Construction Management Fee', amount: 85000, type: 'deposit', balance: 435678.90 }
            ]
          }
        ]
      },
      {
        period: 'Aug 2025',
        deposits: 342180.60,
        true_revenue: 114060.20,
        avg_daily_balance: 369094.10,
        deposit_count: 26,
        neg_ending_days: 1,
        statements: [
          {
            account_number: '****1234',
            deposits: 342180.60,
            true_revenue: 114060.20,
            avg_daily_balance: 369094.10,
            deposit_count: 26,
            neg_ending_days: 1,
            transactions: [
              { id: '16', date: '2025-08-02', description: 'Infrastructure Project Payment', amount: 95000, type: 'deposit', balance: 369094.10 },
              { id: '17', date: '2025-08-06', description: 'Equipment Maintenance', amount: 18000, type: 'withdrawal', balance: 351094.10 },
              { id: '18', date: '2025-08-09', description: 'Consulting Services Payment', amount: 67000, type: 'deposit', balance: 418094.10 },
              { id: '19', date: '2025-08-13', description: 'Travel Expenses', amount: 8500, type: 'withdrawal', balance: 409594.10 },
              { id: '20', date: '2025-08-16', description: 'Project Completion Bonus', amount: 125000, type: 'deposit', balance: 534594.10 }
            ]
          }
        ]
      }
    ],
    statement_count: 9,
    debt_count: 5,
    monthly_debt_payments: 8750.00,
    withholding_percentage: 5.4,
    activity: [
      {
        action: 'Processing completed successfully',
        timestamp: '2024-07-15T14:22:00Z'
      },
      {
        action: 'Financial analysis generated',
        timestamp: '2024-07-15T14:18:00Z'
      },
      {
        action: 'Documents uploaded and verified',
        timestamp: '2024-07-15T14:10:00Z'
      }
    ],
    business: {
      address: {
        address_line_1: '123 Market Street',
        address_line_2: 'Suite 500',
        city: 'San Francisco',
        state: 'CA',
        zip: '94103'
      },
      annual_revenue: 1550617.32,
      dba: 'PARS Consulting',
      ein: '94-1234567',
      email: 'info@parsconsulting.com',
      incorporated_state: 'California',
      industry: 'Engineering Services',
      monthly_revenue: 129218.11,
      company_name: 'PARS CONSULTING ENGINEERS INC',
      phone_number: '4155551234',
      start_date: '2015-03-15',
      type_of_business_entity: 'Corporation',
      website: 'www.parsconsulting.com'
    },
    funding: {
      amount_requested: 250000,
      loan_purpose: 'Equipment purchase and working capital'
    },
    owner: {
      address: {
        address_line_1: '456 Oak Avenue',
        city: 'San Francisco',
        state: 'CA',
        zip: '94115'
      },
      cell_phone: '4155559876',
      credit_score: 740,
      date_of_signature: '2024-07-15',
      dob: '1978-05-22',
      email: 'john.smith@parsconsulting.com',
      first_name: 'John',
      home_phone: null,
      is_signed: true,
      last_name: 'Smith',
      ownership_percent: 60,
      ssn: '123456789'
    },
    owner_2: {
      address: {
        address_line_1: '789 Pine Street',
        address_line_2: 'Apt 12',
        city: 'Oakland',
        state: 'CA',
        zip: '94612'
      },
      cell_phone: '5105554321',
      credit_score: null,
      date_of_signature: '2024-07-15',
      dob: '1982-11-08',
      email: null,
      first_name: 'Jane',
      home_phone: null,
      is_signed: true,
      last_name: 'Doe',
      ownership_percent: 40,
      ssn: '987654321'
    }
  },
  'eus_MNO789PQR456': {
    id: '2',
    company_id: 'eus_MNO789PQR456',
    name: 'APEX MANUFACTURING CORP',
    email: 'finance@apexmanufacturing.com',
    status: 'processed',
    created_at: '2024-09-12T11:20:00Z',
    processing_status: 'Processed',
    lendsaas_synced: false,
    crm_synced: true,
    recent_spend: 325678.90,
    avg_monthly_revenue: 108559.63,
    total_transactions: 52,
    account_count: 2,
    payment_methods: [
      {
        type: 'Visa Business',
        last_four: '8742',
        expires: 'Dec 2026'
      }
    ],
    transactions: [
      {
        period: 'Jul 2025',
        deposits: 298450.25,
        true_revenue: 108559.63,
        avg_daily_balance: 325678.90,
        deposit_count: 22,
        neg_ending_days: 0
      },
      {
        period: 'Aug 2025',
        deposits: 342180.60,
        true_revenue: 114060.20,
        avg_daily_balance: 369094.10,
        deposit_count: 26,
        neg_ending_days: 1
      },
      {
        period: 'Sep 2025',
        deposits: 325678.90,
        true_revenue: 108559.63,
        avg_daily_balance: 405340.45,
        deposit_count: 24,
        neg_ending_days: 0
      }
    ],
    statement_count: 3,
    debt_count: 2,
    monthly_debt_payments: 3335.00,
    withholding_percentage: 3.1,
    activity: [
      {
        action: 'Financial analysis completed',
        timestamp: '2024-09-15T14:22:00Z'
      },
      {
        action: 'Debt assessment processed',
        timestamp: '2024-09-15T14:18:00Z'
      },
      {
        action: 'Account verification successful',
        timestamp: '2024-09-15T14:10:00Z'
      }
    ]
  }
}

// Create formatter singletons at module level for performance
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
})

export default function CompanyDetail() {
  const { companyId } = useParams<{ companyId: string }>()
  const { authReady } = useAuth()

  // State for API data
  const [companyData, setCompanyData] = useState<CompanyDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // State for panel and actions (minimal state in orchestrator)
  const [selectedStatement, setSelectedStatement] = useState<any>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showActionsMenu, setShowActionsMenu] = useState(false)

  // Load company data on mount or when companyId changes
  useEffect(() => {
    if (!authReady || !companyId) {
      console.log('[CompanyDetail] Waiting for auth or companyId...', { authReady, companyId })
      return
    }
    console.log('[CompanyDetail] Auth ready, loading company detail')
    loadCompanyData()
  }, [companyId, authReady])

  const loadCompanyData = async () => {
    if (!companyId) return

    try {
      setLoading(true)
      setError(null)
      const data = await api.getCompanyDetail(companyId)
      setCompanyData(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load company details'
      setError(errorMessage)
      console.error('Error loading company details:', err)
    } finally {
      setLoading(false)
    }
  }

  // Minimal helper functions for orchestrator
  const toProperCase = (str: string) => {
    return str.toLowerCase().split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  const formatCurrency = useCallback((amount: number) => {
    return currencyFormatter.format(amount)
  }, [])

  const handleStatementClick = (statement: any, period: string) => {
    setSelectedStatement(statement)
    setIsPanelOpen(true)
  }

  const closePanels = () => {
    setIsPanelOpen(false)
    setSelectedStatement(null)
  }

  // Memoized filtered and sorted transactions for virtualization
  const filteredTransactions = useMemo(() => {
    if (!selectedStatement) return []

    return selectedStatement.transactions
      .filter((transaction: any) =>
        transaction.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [selectedStatement, searchQuery])

  // Transaction Row Component for Virtualization
  const TransactionRow: React.FC<any> = ({ index, style }) => {
    const transaction = filteredTransactions[index]

    return (
      <div style={style}>
        <div className="border-b border-gray-100 hover:bg-gray-50 transition-colors py-3 px-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="text-13 font-medium text-gray-900">{transaction.description}</div>
              <div className="text-12 text-gray-500 mt-0.5">
                {new Date(transaction.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </div>
            </div>
            <div className={`text-13 font-medium ml-4 ${
              transaction.type === 'deposit' ? 'text-green-600' : 'text-red-600'
            }`}>
              {transaction.type === 'deposit' ? '+' : '-'}
              {formatCurrency(Math.abs(transaction.amount))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show loading state
  if (loading || !authReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-16 text-gray-500">
            {!authReady ? 'Initializing session...' : 'Loading company details...'}
          </p>
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen px-6">
        <div className="text-center max-w-md">
          <div className="bg-red-50 border border-red-200 rounded-6 p-6">
            <p className="text-red-800 text-16 mb-4">
              Error loading company details: {error}
            </p>
            <button
              onClick={loadCompanyData}
              className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-6 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show not found state
  if (!companyData) {
    return (
      <div className="flex items-center justify-center min-h-screen px-6">
        <div className="text-center">
          <p className="text-16 text-gray-500">Company not found</p>
        </div>
      </div>
    )
  }

  const { application, business, funding, owner, owner_2, bank_summary, payment_methods, activity } = companyData

  // Transform bank_summary data for BankSummarySection component
  const transactions = bank_summary?.periods?.map(period => ({
    period: period.period,
    deposits: period.deposits,
    true_revenue: period.true_revenue,
    avg_daily_balance: period.avg_daily_balance,
    deposit_count: period.deposit_count,
    neg_ending_days: period.neg_ending_days,
    statements: period.statements
  })) || []

  // Create company object for ApplicationDetailsSidebar
  const company = {
    id: application.id,
    company_id: application.company_id,
    name: application.name,
    email: application.email,
    status: application.status as 'processed' | 'pending' | 'failed',
    created_at: application.created_at,
    processing_status: application.processing_status,
    lendsaas_synced: application.lendsaas_synced,
    crm_synced: application.crm_synced,
    recent_spend: bank_summary?.recent_spend || 0,
    avg_monthly_revenue: bank_summary?.avg_monthly_revenue || 0,
    total_transactions: bank_summary?.total_transactions || 0,
    account_count: bank_summary?.account_count || 0,
    statement_count: bank_summary?.statement_count || 0,
    debt_count: 0,
    monthly_debt_payments: 0,
    withholding_percentage: bank_summary?.withholding_percentage || 0,
    payment_methods: payment_methods || [],
    transactions: transactions,
    activity: activity || [],
    business,
    funding,
    owner,
    owner_2
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8 px-6 pt-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-40 font-semibold text-gray-900">{toProperCase(application.name)}</h1>
            <Badge variant="default">{application.processing_status}</Badge>
            {application.lendsaas_synced && (
              <Badge variant="secondary">LendSaaS Sync</Badge>
            )}
            {application.crm_synced && (
              <Badge variant="secondary">CRM Sync</Badge>
            )}
          </div>
        </div>

        {/* Actions Dropdown */}
        <div className="relative">
          <Button
            variant="default"
            
            onClick={() => setShowActionsMenu(!showActionsMenu)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Actions</span>
            <ChevronDown className="w-4 h-4" />
          </Button>

          {showActionsMenu && (
            <>
              {/* Backdrop to close menu */}
              <div
                className="fixed inset-0 z-[100]"
                onClick={() => setShowActionsMenu(false)}
                role="presentation"
              />
              {/* Dropdown Menu */}
              <div
                className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-6 shadow-lg z-[110]"
                role="menu"
              >
                <div className="py-1">
                  <button
                    onClick={() => {
                      console.log('Data Enrichment clicked')
                      setShowActionsMenu(false)
                    }}
                    className="w-full px-4 py-2 text-left text-14 text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                    role="menuitem"
                  >
                    Data Enrichment
                  </button>
                  <button
                    onClick={() => {
                      console.log('Quantum Data clicked')
                      setShowActionsMenu(false)
                    }}
                    className="w-full px-4 py-2 text-left text-14 text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                    role="menuitem"
                  >
                    Quantum Data
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 px-6">
        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Bank Summary */}
          <BankSummarySection
            transactions={transactions}
            withholdingPercentage={bank_summary?.withholding_percentage || 0}
            onStatementClick={handleStatementClick}
            selectedStatement={selectedStatement}
            isPanelOpen={isPanelOpen}
          />

          {/* Debt Summary */}
          <DebtSummaryContainer companyId={application.company_id} />

          {/* Files */}
          <FilesSection companyId={application.company_id} />
        </div>

        {/* Sidebar */}
        <ApplicationDetailsSidebar company={company} />
      </div>

      {/* Bank Statement Panel */}
      {isPanelOpen && selectedStatement && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1" onClick={closePanels} />
          <div className="w-[480px] bg-white shadow-xl border-l border-gray-200 flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-16 font-medium text-gray-900">Transaction Details</h3>
                <p className="text-13 text-gray-600 mt-1">
                  {
                    transactions.find(t =>
                      t.statements?.some(s => s.account_number === selectedStatement.account_number)
                    )?.period || 'N/A'
                  } • {selectedStatement.account_number.slice(-4)}
                </p>
              </div>
              <button onClick={closePanels} className="p-2 hover:bg-gray-100 rounded-6">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Search Filter */}
            <div className="px-6 py-3 border-b border-gray-200">
              <input
                type="text"
                placeholder="Filter transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 text-13 border border-gray-300 rounded-6 focus:outline-none focus:ring-1 focus:ring-primary-600 focus:border-primary-600"
              />
            </div>

            {/* Transactions List - Virtualized */}
            <div className="flex-1">
              <FixedSizeList
                rowCount={filteredTransactions.length}
                rowHeight={78}
                rowComponent={TransactionRow}
                rowProps={{}}
                defaultHeight={window.innerHeight - 200}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

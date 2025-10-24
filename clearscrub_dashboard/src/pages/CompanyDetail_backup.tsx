import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronRight, Calendar, BarChart3, DollarSign, TrendingUp, Users, CreditCard, Plus, FileText, Hash, Percent, ChevronDown, ChevronUp, X, Edit3 } from 'lucide-react'
import DebtSummaryContainer from '../components/DebtSummaryContainer'
import FilesTable from '../components/FilesTable'
import { List as FixedSizeList } from 'react-window'

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

const mockCompaniesData: { [key: string]: CompanyData } = {
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
  const company = mockCompaniesData[companyId || 'eus_SQ9H728DpXto2jvDid6CUx'] || mockCompaniesData['eus_SQ9H728DpXto2jvDid6CUx']
  
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null)
  const [selectedStatement, setSelectedStatement] = useState<any>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [bankSortColumn, setBankSortColumn] = useState<string | null>(null)
  const [bankSortDirection, setBankSortDirection] = useState<'asc' | 'desc'>('asc')
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [isBankExpanded, setIsBankExpanded] = useState(false)
  const [isDebtExpanded, setIsDebtExpanded] = useState(false)
  const [isFilesExpanded, setIsFilesExpanded] = useState(false)

  // Auto-collapse Application Details sidebar below 1400px viewport width
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1400 && isDetailsExpanded) {
        setIsDetailsExpanded(false)
      }
    }

    // Check on mount
    handleResize()

    // Add event listener
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => window.removeEventListener('resize', handleResize)
  }, [isDetailsExpanded])

  // Memoized filtered and sorted transactions for virtualization
  const filteredTransactions = useMemo(() => {
    if (!selectedStatement) return []

    return selectedStatement.transactions
      .filter((transaction: any) =>
        transaction.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [selectedStatement, searchQuery])

  const handlePeriodClick = (transaction: any) => {
    const statements = transaction.statements || []

    if (statements.length === 1) {
      // Single statement - open panel directly (replace existing panel if open)
      setSelectedStatement(statements[0])
      setIsPanelOpen(true)
      setExpandedPeriod(null)
    } else if (statements.length > 1) {
      // Multiple statements - show dropdown (but keep panel open if it's already open)
      setExpandedPeriod(expandedPeriod === transaction.period ? null : transaction.period)
      // Don't close the panel - let user click a specific statement
    }
  }

  const handleStatementClick = (statement: any) => {
    // Always open/replace panel smoothly when clicking a statement
    // Keep the dropdown expanded so user can click other statements
    setSelectedStatement(statement)
    setIsPanelOpen(true)
  }

  const closePanels = () => {
    setIsPanelOpen(false)
    setExpandedPeriod(null)
    setSelectedStatement(null)
  }

  const formatCurrency = useCallback((amount: number) => {
    return currencyFormatter.format(amount)
  }, [])

  const formatPeriod = useCallback((period: string) => {
    // Convert "Jun 2025" format to "June 2025"
    const [month, year] = period.split(' ')
    const date = new Date(`${month} 1, ${year}`)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }, [])

  const formatDate = useCallback((dateString: string) => {
    return dateFormatter.format(new Date(dateString))
  }, [])

  const toProperCase = (str: string) => {
    return str.toLowerCase().split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
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
    if (!bankSortColumn) return company.transactions

    const sorted = [...company.transactions].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (bankSortColumn) {
        case 'period':
          // Parse period as date (assuming format like "Jun 2025")
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
  }, [company.transactions, bankSortColumn, bankSortDirection])

  const formatFieldName = (fieldName: string): string => {
    // Special cases for acronyms and specific terms
    const specialCases: { [key: string]: string } = {
      'ein': 'EIN',
      'ssn': 'SSN',
      'dba': 'DBA',
      'dob': 'Date of Birth',
      'zip': 'ZIP',
      'phone_number': 'Phone Number',
      'cell_phone': 'Cell Phone',
      'home_phone': 'Home Phone',
      'company_name': 'Company Name',
      'first_name': 'First Name',
      'last_name': 'Last Name',
      'annual_revenue': 'Annual Revenue',
      'monthly_revenue': 'Monthly Revenue',
      'incorporated_state': 'Incorporated State',
      'type_of_business_entity': 'Entity Type',
      'start_date': 'Business Start Date',
      'amount_requested': 'Amount Requested',
      'loan_purpose': 'Loan Purpose',
      'credit_score': 'Credit Score',
      'date_of_signature': 'Date of Signature',
      'is_signed': 'Signed',
      'ownership_percent': 'Ownership %',
      'address_line_1': 'Address',
      'address_line_2': 'Address Line 2'
    }

    if (specialCases[fieldName]) {
      return specialCases[fieldName]
    }

    // Convert snake_case to Title Case
    return fieldName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const formatPhone = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`
    }
    return phone
  }

  const formatSSN = (ssn: string): string => {
    const cleaned = ssn.replace(/\D/g, '')
    return `***-**-${cleaned.slice(-4)}`
  }

  const formatAddress = (address: Address): string => {
    const parts = [address.address_line_1]
    if (address.address_line_2) {
      parts.push(address.address_line_2)
    }
    parts.push(`${address.city}, ${address.state} ${address.zip}`)
    return parts.join(', ')
  }

  const formatValue = (key: string, value: any): string => {
    if (value === null || value === undefined) return ''

    // Currency fields
    if (key.includes('revenue') || key.includes('amount')) {
      return formatCurrency(value as number)
    }

    // Date fields
    if (key.includes('date') || key === 'dob') {
      return formatDate(value as string)
    }

    // Phone fields
    if (key.includes('phone')) {
      return formatPhone(value as string)
    }

    // SSN
    if (key === 'ssn') {
      return formatSSN(value as string)
    }

    // Boolean
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }

    // Percentage
    if (key.includes('percent')) {
      return `${value}%`
    }

    return String(value)
  }

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

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8 px-6 pt-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-40 font-semibold text-gray-900">{toProperCase(company.name)}</h1>
            <span className="badge-success">
              {company.processing_status}
            </span>
            {company.lendsaas_synced && (
              <span className="badge-sync">
                LendSaaS Sync
              </span>
            )}
            {company.crm_synced && (
              <span className="badge-sync">
                CRM Sync
              </span>
            )}
          </div>
        </div>

        {/* Actions Dropdown */}
        <div className="relative">
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => setShowActionsMenu(!showActionsMenu)}
          >
            <Plus className="w-4 h-4" />
            <span>Actions</span>
            <ChevronDown className="w-4 h-4" />
          </button>

          {showActionsMenu && (
            <>
              {/* Backdrop to close menu */}
              <div
                className="fixed inset-0 z-[100]"
                onClick={() => setShowActionsMenu(false)}
              />
              {/* Dropdown Menu */}
              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-6 shadow-lg z-[110]">
                <div className="py-1">
                  <button
                    onClick={() => {
                      console.log('Data Enrichment clicked')
                      setShowActionsMenu(false)
                    }}
                    className="w-full px-4 py-2 text-left text-14 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    Data Enrichment
                  </button>
                  <button
                    onClick={() => {
                      console.log('Quantum Data clicked')
                      setShowActionsMenu(false)
                    }}
                    className="w-full px-4 py-2 text-left text-14 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
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
          <div className="card">
            <div className="px-6 py-3 border-b border-gray-200">
              <h2 className="text-24 font-semibold text-gray-900">Bank Summary</h2>
            </div>
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
                    // Check if this transaction's statement is currently selected
                    const statements = transaction.statements || []
                    // For single-statement periods, check if THIS specific statement is selected
                    const isActive = statements.length === 1 &&
                                   selectedStatement?.account_number === statements[0]?.account_number &&
                                   isPanelOpen &&
                                   transaction.period === company.transactions.find(t =>
                                     t.statements?.some(s => s.account_number === selectedStatement?.account_number)
                                   )?.period

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
                          ) : null}
                        </td>
                        <td className="table-cell pl-0">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{formatPeriod(transaction.period)}</span>
                            {transaction.statements && transaction.statements.length > 1 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-11 font-medium bg-blue-100 text-blue-700">
                                {transaction.statements.length} accounts
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="table-cell">{formatCurrency(transaction.deposits)}</td>
                        <td className="table-cell text-green-600 font-medium">{formatCurrency(transaction.true_revenue)}</td>
                        <td className="table-cell">{formatCurrency(transaction.avg_daily_balance)}</td>
                        <td className="table-cell">{transaction.deposit_count}</td>
                        <td className="table-cell">{company.withholding_percentage}%</td>
                        <td className="table-cell">{transaction.neg_ending_days}</td>
                      </tr>

                      {/* Dropdown for multiple statements */}
                      {expandedPeriod === transaction.period && transaction.statements && transaction.statements.length > 1 && (
                        <>
                          {transaction.statements.map((statement, statementIndex) => {
                            const isStatementActive = selectedStatement?.account_number === statement.account_number && isPanelOpen

                            return (
                            <tr
                              key={statementIndex}
                              className={`transition-colors cursor-pointer border-l-4 border-primary-600 expand-row ${isStatementActive ? 'bg-primary-50 hover:bg-primary-50' : 'bg-gray-50 hover:bg-gray-100'}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleStatementClick(statement)
                              }}
                            >
                              <td className="py-3 px-2 w-12"></td>
                              <td className="table-cell">
                                <span className="text-13 text-gray-700 font-medium">{statement.account_number}</span>
                              </td>
                              <td className="table-cell text-13">{formatCurrency(statement.deposits)}</td>
                              <td className="table-cell text-13 text-green-600">{formatCurrency(statement.true_revenue)}</td>
                              <td className="table-cell text-13">{formatCurrency(statement.avg_daily_balance)}</td>
                              <td className="table-cell text-13">{statement.deposit_count}</td>
                              <td className="table-cell text-13">{company.withholding_percentage}%</td>
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

            {/* Expand/Collapse Button for Bank Summary */}
            {sortedTransactions.length > 20 && (
              <div className="flex justify-center border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setIsBankExpanded(!isBankExpanded)}
                  className="py-3 px-6 text-14 font-medium text-primary-600 hover:text-primary-700 hover:bg-gray-100 transition-all duration-150 flex items-center gap-2"
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
                </button>
              </div>
            )}
          </div>

          {/* Debt Summary */}
          <DebtSummaryContainer companyId={company.company_id} />

          {/* Files */}
          <div className="card">
            <div className="px-6 py-3 border-b border-gray-200">
              <h2 className="text-24 font-semibold text-gray-900">Files</h2>
            </div>
            <FilesTable companyId={company.company_id} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Meta Data */}
          <div className="card">
            <div className="px-6 py-3 border-b border-gray-200">
              <h3 className="text-24 font-semibold text-gray-900">Meta Data</h3>
            </div>
            <div className="card-body">
              <div className="space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-caption font-medium">Company ID</span>
                  <span className="text-body text-right">{company.company_id}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-caption font-medium">First Seen</span>
                  <span className="text-body text-right">{formatDate(company.created_at)}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-caption font-medium">Last Updated</span>
                  <span className="text-body text-right">{formatDate(company.created_at)}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-caption font-medium">Business Temperature</span>
                  <span className={`text-body text-right font-medium ${
                    company.business_temperature === 'Very Good' ? 'text-green-600' :
                    company.business_temperature === 'Good' ? 'text-optimistic-green' :
                    company.business_temperature === 'Decent' ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {company.business_temperature || 'Good'}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-caption font-medium">Fraud Reading</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-12 font-medium ${
                    company.fraud_reading === 'Pass' ? 'bg-green-100 text-green-700' :
                    company.fraud_reading === 'Fail' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {company.fraud_reading || 'Pass'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Application Details */}
          <div className="relative bg-white border border-gray-200 rounded-t-8 shadow-sm overflow-visible">
            <div className="card-body">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-24 font-semibold text-gray-900">Application Details</h3>
                <button
                  onClick={() => setIsEditingDetails(!isEditingDetails)}
                  className="p-1.5 hover:bg-gray-100 rounded-6 transition-colors duration-150"
                  title="Edit application details"
                >
                  <Edit3 className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className={`space-y-2 relative ${!isDetailsExpanded ? 'max-h-[600px] overflow-hidden' : ''}`}>
                {/* Business Fields */}
                {company.business && Object.entries(company.business).map(([key, value]) => {
                  if (key === 'address' && (value || isEditingDetails)) {
                    const addressStr = value ? formatAddress(value as Address) : '—'
                    return (
                      <div key={key} className="flex justify-between items-start gap-2">
                        <span className="text-caption font-medium">{formatFieldName(key)}</span>
                        <span className={`text-body text-right ${!value && isEditingDetails ? 'text-gray-400 italic' : ''}`}>{addressStr}</span>
                      </div>
                    )
                  }
                  if ((value !== null && value !== undefined && key !== 'address') || isEditingDetails) {
                    if (key === 'address') return null
                    const fieldId = `business.${key}`
                    const isEditing = editingField === fieldId

                    return (
                      <div key={key} className="flex justify-between items-center gap-2">
                        <span className="text-caption font-medium">{formatFieldName(key)}</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => {
                              setEditingField(null)
                              // Save logic here
                              console.log('Save:', fieldId, editValue)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setEditingField(null)
                                console.log('Save:', fieldId, editValue)
                              } else if (e.key === 'Escape') {
                                setEditingField(null)
                              }
                            }}
                            autoFocus
                            className="text-body text-right border border-primary-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-600/20 min-w-[120px]"
                          />
                        ) : (
                          <span
                            className={`text-body text-right ${(!value && value !== false && isEditingDetails) ? 'text-gray-400 italic' : ''} ${isEditingDetails ? 'cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors' : ''}`}
                            onDoubleClick={() => {
                              if (isEditingDetails) {
                                setEditingField(fieldId)
                                setEditValue(value?.toString() || '')
                              }
                            }}
                            title={isEditingDetails ? 'Double-click to edit' : ''}
                          >
                            {value || value === false ? formatValue(key, value) : '—'}
                          </span>
                        )}
                      </div>
                    )
                  }
                  return null
                })}

                {/* Funding Fields */}
                {company.funding && Object.entries(company.funding).map(([key, value]) => {
                  if (value !== null && value !== undefined || isEditingDetails) {
                    const fieldId = `funding.${key}`
                    const isEditing = editingField === fieldId

                    return (
                      <div key={key} className="flex justify-between items-center gap-2">
                        <span className="text-caption font-medium">{formatFieldName(key)}</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => {
                              setEditingField(null)
                              console.log('Save:', fieldId, editValue)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setEditingField(null)
                                console.log('Save:', fieldId, editValue)
                              } else if (e.key === 'Escape') {
                                setEditingField(null)
                              }
                            }}
                            autoFocus
                            className="text-body text-right border border-primary-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-600/20 min-w-[120px]"
                          />
                        ) : (
                          <span
                            className={`text-body text-right ${(!value && isEditingDetails) ? 'text-gray-400 italic' : ''} ${isEditingDetails ? 'cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors' : ''}`}
                            onDoubleClick={() => {
                              if (isEditingDetails) {
                                setEditingField(fieldId)
                                setEditValue(value?.toString() || '')
                              }
                            }}
                            title={isEditingDetails ? 'Double-click to edit' : ''}
                          >
                            {value ? formatValue(key, value) : '—'}
                          </span>
                        )}
                      </div>
                    )
                  }
                  return null
                })}

                {/* Owner 1 Fields */}
                {company.owner && (
                  <>
                    <div className="pt-2 pb-1">
                      <span className="text-12 font-semibold text-gray-700 uppercase tracking-wide">Owner 1</span>
                    </div>
                    {Object.entries(company.owner).map(([key, value]) => {
                      if (key === 'address' && (value || isEditingDetails)) {
                        const addressStr = value ? formatAddress(value as Address) : '—'
                        return (
                          <div key={key} className="flex justify-between items-start gap-2">
                            <span className="text-caption font-medium">{formatFieldName(key)}</span>
                            <span className={`text-body text-right ${!value && isEditingDetails ? 'text-gray-400 italic' : ''}`}>{addressStr}</span>
                          </div>
                        )
                      }
                      if ((value !== null && value !== undefined && key !== 'address') || isEditingDetails) {
                        if (key === 'address') return null
                        const fieldId = `owner.${key}`
                        const isEditing = editingField === fieldId

                        return (
                          <div key={key} className="flex justify-between items-center gap-2">
                            <span className="text-caption font-medium">{formatFieldName(key)}</span>
                            {isEditing ? (
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => {
                                  setEditingField(null)
                                  console.log('Save:', fieldId, editValue)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    setEditingField(null)
                                    console.log('Save:', fieldId, editValue)
                                  } else if (e.key === 'Escape') {
                                    setEditingField(null)
                                  }
                                }}
                                autoFocus
                                className="text-body text-right border border-primary-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-600/20 min-w-[120px]"
                              />
                            ) : (
                              <span
                                className={`text-body text-right ${(!value && value !== false && isEditingDetails) ? 'text-gray-400 italic' : ''} ${isEditingDetails ? 'cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors' : ''}`}
                                onDoubleClick={() => {
                                  if (isEditingDetails) {
                                    setEditingField(fieldId)
                                    setEditValue(value?.toString() || '')
                                  }
                                }}
                                title={isEditingDetails ? 'Double-click to edit' : ''}
                              >
                                {value || value === false ? formatValue(key, value) : '—'}
                              </span>
                            )}
                          </div>
                        )
                      }
                      return null
                    })}
                  </>
                )}

                {/* Owner 2 Fields */}
                {company.owner_2 && (
                  <>
                    <div className="pt-2 pb-1">
                      <span className="text-12 font-semibold text-gray-700 uppercase tracking-wide">Owner 2</span>
                    </div>
                    {Object.entries(company.owner_2).map(([key, value]) => {
                      if (key === 'address' && (value || isEditingDetails)) {
                        const addressStr = value ? formatAddress(value as Address) : '—'
                        return (
                          <div key={key} className="flex justify-between items-start gap-2">
                            <span className="text-caption font-medium">{formatFieldName(key)}</span>
                            <span className={`text-body text-right ${!value && isEditingDetails ? 'text-gray-400 italic' : ''}`}>{addressStr}</span>
                          </div>
                        )
                      }
                      if ((value !== null && value !== undefined && key !== 'address') || isEditingDetails) {
                        if (key === 'address') return null
                        const fieldId = `owner_2.${key}`
                        const isEditing = editingField === fieldId

                        return (
                          <div key={key} className="flex justify-between items-center gap-2">
                            <span className="text-caption font-medium">{formatFieldName(key)}</span>
                            {isEditing ? (
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => {
                                  setEditingField(null)
                                  console.log('Save:', fieldId, editValue)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    setEditingField(null)
                                    console.log('Save:', fieldId, editValue)
                                  } else if (e.key === 'Escape') {
                                    setEditingField(null)
                                  }
                                }}
                                autoFocus
                                className="text-body text-right border border-primary-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-600/20 min-w-[120px]"
                              />
                            ) : (
                              <span
                                className={`text-body text-right ${(!value && value !== false && isEditingDetails) ? 'text-gray-400 italic' : ''} ${isEditingDetails ? 'cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors' : ''}`}
                                onDoubleClick={() => {
                                  if (isEditingDetails) {
                                    setEditingField(fieldId)
                                    setEditValue(value?.toString() || '')
                                  }
                                }}
                                title={isEditingDetails ? 'Double-click to edit' : ''}
                              >
                                {value || value === false ? formatValue(key, value) : '—'}
                              </span>
                            )}
                          </div>
                        )
                      }
                      return null
                    })}
                  </>
                )}
              </div>

              {/* Gradient Fade Overlay with Expand Button */}
              {!isDetailsExpanded && (
                <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-white via-white/90 to-transparent pointer-events-none">
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-auto">
                    <button
                      onClick={() => setIsDetailsExpanded(true)}
                      className="flex flex-col items-center gap-1 text-gray-700 hover:text-primary-600 transition-colors duration-200"
                    >
                      <span className="text-16 font-semibold">Expand</span>
                      <ChevronDown className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Collapse Button - Only shows when expanded */}
            {isDetailsExpanded && (
              <div className="flex justify-center border-t border-gray-200 bg-white rounded-b-8">
                <button
                  onClick={() => setIsDetailsExpanded(false)}
                  className="py-3 px-6 text-13 font-medium text-primary-600 hover:text-primary-700 hover:bg-gray-50 transition-all duration-150 flex items-center gap-2"
                >
                  <ChevronUp className="w-4 h-4" />
                  <span>Show Less</span>
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Bank Statement Panel */}
      {isPanelOpen && selectedStatement && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1" onClick={closePanels} />
          <div className="w-96 bg-white shadow-xl border-l border-gray-200 flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-16 font-medium text-gray-900">Transaction Details</h3>
                <p className="text-13 text-gray-600 mt-1">
                  {
                    company.transactions.find(t =>
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

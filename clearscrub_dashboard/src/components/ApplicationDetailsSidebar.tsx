import React, { useState, useCallback, useEffect } from 'react'
import { Edit3, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
  company_id: string
  created_at: string
  business_temperature?: 'Very Good' | 'Good' | 'Decent' | 'Bad'
  fraud_reading?: 'Pass' | 'Fail' | 'Human Loop'
  business?: Business
  funding?: Funding
  owner?: Owner
  owner_2?: Owner
}

interface ApplicationDetailsSidebarProps {
  company: CompanyData
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

const ApplicationDetailsSidebar: React.FC<ApplicationDetailsSidebarProps> = React.memo(({ company }) => {
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')

  // Auto-collapse Application Details sidebar below 1400px viewport width
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1400 && isDetailsExpanded) {
        setIsDetailsExpanded(false)
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isDetailsExpanded])

  const formatDate = useCallback((dateString: string) => {
    return dateFormatter.format(new Date(dateString))
  }, [])

  const formatCurrency = useCallback((amount: number) => {
    return currencyFormatter.format(amount)
  }, [])

  const formatFieldName = (fieldName: string): string => {
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

    if (key.includes('revenue') || key.includes('amount')) {
      return formatCurrency(value as number)
    }

    if (key.includes('date') || key === 'dob') {
      return formatDate(value as string)
    }

    if (key.includes('phone')) {
      return formatPhone(value as string)
    }

    if (key === 'ssn') {
      return formatSSN(value as string)
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }

    if (key.includes('percent')) {
      return `${value}%`
    }

    return String(value)
  }

  return (
    <div className="space-y-6">
      {/* Meta Data */}
      <Card title="Meta Data">
        <div className="space-y-2 p-4">
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
            <Badge
              variant={
                company.fraud_reading === 'Pass' ? 'default' :
                company.fraud_reading === 'Fail' ? 'destructive' :
                'secondary'
              }
            >
              {company.fraud_reading || 'Pass'}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Application Details */}
      <Card>
        <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-24 font-semibold text-gray-900">Application Details</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsEditingDetails(!isEditingDetails)}
            title="Edit application details"
            aria-label="Edit application details"
          >
            <Edit3 className="w-4 h-4 text-gray-500" />
          </Button>
        </div>
        <div className="px-6 py-4">
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
          <div className="flex justify-center border-t border-gray-200 bg-white px-4 py-0">
            <Button
              variant="ghost"
              onClick={() => setIsDetailsExpanded(false)}
              className="py-3 px-6 text-13 font-medium flex items-center gap-2"
            >
              <ChevronUp className="w-4 h-4" />
              <span>Show Less</span>
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
})

ApplicationDetailsSidebar.displayName = 'ApplicationDetailsSidebar'

export default ApplicationDetailsSidebar

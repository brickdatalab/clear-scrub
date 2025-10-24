import React, { useState } from 'react'
import { Plus, Settings, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardHeader, CardContent, CardFooter } from '../components/ui/card'

interface Integration {
  id: string
  name: string
  description: string
  category: string
  status: 'connected' | 'available' | 'error'
  icon: string
  features: string[]
  lastSync?: string
  connectionCount?: number
}

const mockIntegrations: Integration[] = [
  // Storage
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: '',
    category: 'Storage',
    status: 'available',
    icon: '/integrations-optimized/googledrive.webp',
    features: []
  },
  {
    id: 'microsoft-onedrive',
    name: 'Microsoft OneDrive',
    description: '',
    category: 'Storage',
    status: 'available',
    icon: '/integrations-optimized/onedrive.webp',
    features: []
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: '',
    category: 'Storage',
    status: 'available',
    icon: '/integrations-optimized/dropbox.png',
    features: []
  },
  {
    id: 'aws-s3',
    name: 'AWS S3',
    description: '',
    category: 'Storage',
    status: 'available',
    icon: '/integrations-optimized/s3.webp',
    features: []
  },
  {
    id: 'google-storage-bucket',
    name: 'Google Storage Bucket',
    description: '',
    category: 'Storage',
    status: 'available',
    icon: '/integrations-optimized/cloudbucket.webp',
    features: []
  },
  // CRM
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: '',
    category: 'CRM',
    status: 'available',
    icon: '/integrations-optimized/sflogo.webp',
    features: []
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: '',
    category: 'CRM',
    status: 'available',
    icon: '/integrations-optimized/hubspot.webp',
    features: []
  },
  {
    id: 'zoho',
    name: 'Zoho',
    description: '',
    category: 'CRM',
    status: 'available',
    icon: '/integrations-optimized/zoho.webp',
    features: []
  },
  {
    id: 'centrix',
    name: 'Centrix',
    description: '',
    category: 'CRM',
    status: 'available',
    icon: '/integrations-optimized/centrix.png',
    features: []
  },
  // Workflow Platforms
  {
    id: 'zapier',
    name: 'Zapier',
    description: '',
    category: 'Workflow Platforms',
    status: 'available',
    icon: '/integrations-optimized/zapier.webp',
    features: []
  },
  {
    id: 'n8n',
    name: 'n8n',
    description: '',
    category: 'Workflow Platforms',
    status: 'available',
    icon: '/integrations-optimized/n8n.webp',
    features: []
  },
  // Relay
  {
    id: 'lendsaas',
    name: 'LendSaaS',
    description: '',
    category: 'Relay',
    status: 'available',
    icon: '/integrations-optimized/lendsaas.png',
    features: []
  }
]

const categories = [
  'All Integrations',
  'Storage',
  'CRM',
  'Workflow Platforms',
  'Relay'
]

export default function Integrations() {
  const [selectedCategory, setSelectedCategory] = useState('All Integrations')
  const [integrations, setIntegrations] = useState(mockIntegrations)

  const filteredIntegrations = integrations.filter(integration => {
    const matchesCategory = selectedCategory === 'All Integrations' || integration.category === selectedCategory
    return matchesCategory
  })

  const handleConnect = (integrationId: string) => {
    setIntegrations(prev => prev.map(integration => 
      integration.id === integrationId 
        ? { 
            ...integration, 
            status: integration.status === 'connected' ? 'available' : 'connected',
            lastSync: integration.status === 'available' ? 'Just now' : undefined
          }
        : integration
    ))
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      default:
        return <Plus className="w-5 h-5 text-gray-400" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected':
        return 'Connected'
      case 'error':
        return 'Error'
      default:
        return 'Connect'
    }
  }

  const getStatusButtonClass = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-optimistic-green hover:bg-optimistic-green/90 text-white'
      case 'error':
        return 'bg-oh-no hover:bg-oh-no/90 text-white'
      default:
        return 'bg-corporate-purple hover:bg-corporate-purple/90 text-white'
    }
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-32 font-bold text-gray-900 mb-2">Integrations</h1>
          <p className="text-16 text-gray-600">
            Connect your favorite tools and services to streamline your financial data processing
          </p>
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex gap-2 overflow-x-auto">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-4 py-2 rounded-6 text-14 font-medium whitespace-nowrap transition-colors duration-150 ${
              selectedCategory === category
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Integration Sections */}
      {selectedCategory === 'All Integrations' ? (
        <div className="space-y-4">
          {categories.slice(1).map((category) => {
            const categoryIntegrations = integrations.filter(integration => integration.category === category)
            if (categoryIntegrations.length === 0) return null

            return (
              <div key={category}>
                <h2 className="text-20 font-semibold text-gray-900 mb-3">{category}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {categoryIntegrations.map((integration) => (
                    <Card key={integration.id} className="p-4">
                      {/* Logo Container */}
                      <div className="flex justify-center mb-3">
                        <img
                          src={integration.icon}
                          alt={integration.name}
                          className={integration.id === 'lendsaas' || integration.id === 'centrix' ? 'w-32 h-16 object-contain' : 'w-16 h-16 object-contain'}
                        />
                      </div>

                      {/* Name */}
                      <h3 className="text-14 font-semibold text-gray-900 mb-3 text-center truncate">{integration.name}</h3>

                      {/* Action Button */}
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleConnect(integration.id)}
                          className={`flex items-center justify-center gap-2 px-5 py-2 rounded-6 text-14 font-medium transition-all duration-200 ${getStatusButtonClass(integration.status)}`}
                        >
                          {getStatusIcon(integration.status)}
                          <span>{getStatusText(integration.status)}</span>
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredIntegrations.map((integration) => (
            <Card key={integration.id} className="p-4">
              {/* Logo Container */}
              <div className="flex justify-center mb-3">
                <img
                  src={integration.icon}
                  alt={integration.name}
                  className={integration.id === 'lendsaas' || integration.id === 'centrix' ? 'w-32 h-16 object-contain' : 'w-16 h-16 object-contain'}
                />
              </div>

              {/* Name */}
              <h3 className="text-14 font-semibold text-gray-900 mb-3 text-center truncate">{integration.name}</h3>

              {/* Action Button */}
              <div className="flex justify-center">
                <button
                  onClick={() => handleConnect(integration.id)}
                  className={`flex items-center justify-center gap-2 px-5 py-2 rounded-6 text-14 font-medium transition-all duration-200 ${getStatusButtonClass(integration.status)}`}
                >
                  {getStatusIcon(integration.status)}
                  <span>{getStatusText(integration.status)}</span>
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {filteredIntegrations.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Settings className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-16 font-medium text-gray-900 mb-2">No integrations found</h3>
          <p className="text-14 text-gray-600">
            Try selecting a different category
          </p>
        </div>
      )}
    </div>
  )
}

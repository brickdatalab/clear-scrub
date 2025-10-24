import React, { useState } from 'react'
import { Building2, Shield, Route, Database, Zap, Flag, Navigation } from 'lucide-react'
import { Card, CardHeader, CardContent, CardFooter } from '../components/ui/card'
import { Switch } from '../components/ui/switch'

interface Extension {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  enabled: boolean
}

const Extensions: React.FC = () => {
  const [extensions, setExtensions] = useState<Extension[]>([
    {
      id: 'secretary-of-state',
      name: 'Secretary of State Lookup',
      description: 'Automatically verify business registration and entity status',
      icon: <Building2 className="w-5 h-5 text-blue-600" />,
      enabled: false
    },
    {
      id: 'identity-verify',
      name: 'Identity Verify',
      description: 'Omni channel phone+email verification and appending',
      icon: <Shield className="w-5 h-5 text-green-600" />,
      enabled: false
    },
    {
      id: 'submission-profiler',
      name: 'Submission Profiler',
      description: 'Track matching submissions across all lenders and ISO\'s',
      icon: <Route className="w-5 h-5 text-purple-600" />,
      enabled: false
    },
    {
      id: 'loan-default-finder',
      name: 'Loan Default Finder',
      description: 'Determine if business or owner has a past business loan default',
      icon: <Database className="w-5 h-5 text-orange-600" />,
      enabled: false
    },
    {
      id: 'quantum-data',
      name: 'Quantum Data',
      description: 'Receive guaranteed verifiable contact information',
      icon: <Zap className="w-5 h-5 text-indigo-600" />,
      enabled: false
    },
    {
      id: 'seed-litigator-flag',
      name: 'Seed + Litigator Flag',
      description: 'Flag contact information for seeded numbers and litigators',
      icon: <Flag className="w-5 h-5 text-red-600" />,
      enabled: false
    },
    {
      id: 'lender-router',
      name: 'Lender Router',
      description: 'Intelligent routing and matching to optimal lenders',
      icon: <Navigation className="w-5 h-5 text-cyan-600" />,
      enabled: false
    }
  ])

  const toggleExtension = (id: string) => {
    const updatedExtensions = extensions.map(ext =>
      ext.id === id ? { ...ext, enabled: !ext.enabled } : ext
    )
    setExtensions(updatedExtensions)

    // Save to localStorage and trigger sidebar update
    localStorage.setItem('extensions', JSON.stringify(updatedExtensions))
    window.dispatchEvent(new Event('extensionsChanged'))
  }

  const enabledCount = extensions.filter(ext => ext.enabled).length

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-32 font-bold text-gray-900 mb-2">Extensions</h1>
          <p className="text-16 text-gray-600">
            Enable additional features and data enrichment capabilities for your processing workflow
          </p>
        </div>
      </div>

      {/* Extensions List */}
      <Card>
        <div className="p-4">
          <div className="space-y-2">
            {extensions.map((extension) => (
              <div key={extension.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {extension.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-13 font-medium text-gray-900">{extension.name}</h3>
                    <p className="text-11 text-gray-500 mt-0.5">{extension.description}</p>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <Switch
                    checked={extension.enabled}
                    onCheckedChange={() => toggleExtension(extension.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

export default Extensions

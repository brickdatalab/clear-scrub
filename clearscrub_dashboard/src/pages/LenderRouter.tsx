import React from 'react'
import { Navigation } from 'lucide-react'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

const LenderRouter: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Navigation className="w-6 h-6 text-cyan-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Lender Router</h1>
              <p className="text-sm text-gray-500 mt-1">
                Intelligent routing and matching to optimal lenders
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Coming Soon Content */}
      <Card>
        <CardContent className="p-12 text-center">
          <Navigation className="w-16 h-16 text-cyan-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Lender Router Dashboard</h2>
          <p className="text-sm text-gray-500 mb-6">
            This feature is currently in development. Automatically route submissions to the most suitable lenders based on business profiles and lending criteria.
          </p>
          <Alert className="max-w-md mx-auto">
            <AlertDescription>
              AI-powered lender matching, routing optimization, and approval rate analytics.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}

export default LenderRouter

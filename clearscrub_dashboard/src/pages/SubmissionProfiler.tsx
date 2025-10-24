import React from 'react'
import { Route } from 'lucide-react'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

const SubmissionProfiler: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Route className="w-6 h-6 text-purple-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Submission Profiler</h1>
              <p className="text-sm text-gray-500 mt-1">
                Track matching submissions across all lenders and ISO's
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Coming Soon Content */}
      <Card>
        <CardContent className="p-12 text-center">
          <Route className="w-16 h-16 text-purple-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Submission Profiler Dashboard</h2>
          <p className="text-sm text-gray-500 mb-6">
            This feature is currently in development. Track and analyze submission patterns across multiple lenders and ISO partners.
          </p>
          <Alert className="max-w-md mx-auto">
            <AlertDescription>
              Advanced submission tracking, duplicate detection, and cross-lender analytics.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}

export default SubmissionProfiler

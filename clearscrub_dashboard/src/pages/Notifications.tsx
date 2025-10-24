import React from 'react'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '../components/ui/alert'

/**
 * Notifications Page - Placeholder
 *
 * This page will allow users to manage email notifications and webhooks.
 * Full implementation coming soon.
 */
const Notifications: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-32 font-bold text-gray-900">Notifications</h1>
          <p className="text-14 text-gray-600 mt-1">
            Manage email notifications and webhooks for your organization.
          </p>
        </div>

        {/* Coming Soon Notice */}
        <div className="bg-white rounded-8 shadow-sm p-8">
          <div className="bg-blue-50 border border-blue-200 rounded-8 p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="text-16 font-semibold text-gray-900 mb-2">
                  Notification Management Coming Soon
                </h3>
                <p className="text-14 text-gray-700 mb-4">
                  We're building comprehensive notification management including:
                </p>
                <ul className="space-y-1 text-14 text-gray-700">
                  <li>• Email notifications for key events</li>
                  <li>• Webhook endpoints for system integrations</li>
                  <li>• Event filtering and custom triggers</li>
                  <li>• Notification history and delivery status</li>
                </ul>
                <p className="text-14 text-gray-700 mt-4">
                  For immediate assistance with notifications, contact{' '}
                  <a
                    href="mailto:support@clearscrub.io"
                    className="text-primary-600 hover:text-primary-700 font-medium"
                  >
                    support@clearscrub.io
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Notifications

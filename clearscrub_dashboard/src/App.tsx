import React, { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { AuthProvider } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import AppShell from './layouts/AppShell'
import Login from './pages/Login' // Keep Login eager for fast first load
import SignUp from './pages/SignUp' // Keep SignUp eager for fast first load

// Lazy load all other routes for optimal code splitting
const Companies = lazy(() => import('./pages/Companies'))
const CompanyDetail = lazy(() => import('./pages/CompanyDetail'))
const UploadDocuments = lazy(() => import('./pages/UploadDocuments'))
const Integrations = lazy(() => import('./pages/Integrations'))
const Extensions = lazy(() => import('./pages/Extensions'))
const SubmissionProfiler = lazy(() => import('./pages/SubmissionProfiler'))
const LenderRouter = lazy(() => import('./pages/LenderRouter'))
const Notifications = lazy(() => import('./pages/Notifications'))
const ApiKeys = lazy(() => import('./pages/ApiKeys'))
const Settings = lazy(() => import('./pages/Settings'))
const Triggers = lazy(() => import('./pages/Triggers'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const TestUpload = lazy(() => import('./pages/TestUpload'))

function App() {
  return (
    <AuthProvider>
      <SpeedInsights />
      <Router>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-gray-500 text-16">Loading...</div>
          </div>
        }>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Protected Routes */}
            <Route path="/" element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/companies" replace />} />
              <Route path="dashboard" element={<Navigate to="/companies" replace />} />
              <Route path="companies" element={<Companies />} />
              <Route path="companies/:companyId" element={<CompanyDetail />} />
              <Route path="upload" element={<UploadDocuments />} />
              <Route path="integrations" element={<Integrations />} />
              <Route path="extensions" element={<Extensions />} />
              <Route path="submission-profiler" element={<SubmissionProfiler />} />
              <Route path="lender-router" element={<LenderRouter />} />
              <Route path="api-keys" element={<ApiKeys />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="settings" element={<Settings />} />
              <Route path="settings/quota" element={<Settings />} />
              <Route path="settings/suppressions" element={<Settings />} />
              <Route path="settings/billing" element={<Settings />} />
              <Route path="triggers" element={<Triggers />} />
              <Route path="triggers/emails" element={<Triggers />} />
              <Route path="triggers/webhooks" element={<Triggers />} />
              <Route path="test-upload" element={<TestUpload />} />
              <Route path="api-docs" element={<div className="p-8"><h1 className="text-2xl font-bold">API Documentation</h1><p>Coming soon...</p></div>} />
              <Route path="payments" element={<div className="p-8"><h1 className="text-2xl font-bold">Payments</h1><p>Coming soon...</p></div>} />
              <Route path="customers" element={<div className="p-8"><h1 className="text-2xl font-bold">Customers</h1><p>Coming soon...</p></div>} />
              <Route path="analytics" element={<div className="p-8"><h1 className="text-2xl font-bold">Analytics</h1><p>Coming soon...</p></div>} />
            </Route>

            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/companies" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </AuthProvider>
  )
}

export default App

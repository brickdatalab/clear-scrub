import React, { useState } from 'react'
import { Search, Bell, ChevronDown, LogOut, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { SidebarTrigger } from '@/components/ui/sidebar'

// TODO: Replace with real notifications API call
// const getFailedCompanies = async () => {
//   const response = await api.getCompanies({ status: 'failed' })
//   return response.companies
// }

export default function TopBar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  // Handle logout with navigation
  const handleLogout = async () => {
    setShowProfileMenu(false)
    // Navigate immediately, don't wait for signOut to complete
    // This prevents the loading state from blocking navigation
    navigate('/login', { replace: true })
    try {
      await signOut()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  // TODO: Replace with real failed companies count from API
  const failedCompanies: never[] = []
  const unreadCount = failedCompanies.length

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
      {/* Left Section: Sidebar Toggle + Brand */}
      <div className="flex items-center gap-3">
        {/* Sidebar Toggle - Works on both mobile and desktop */}
        <SidebarTrigger />

        <div className="flex items-center gap-2">
          <img
            src="/assets/logos/logo-small.png"
            alt="ClearScrub"
            className="h-8 w-auto"
          />
          <span className="text-sm font-semibold text-foreground hidden sm:block">ClearScrub</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground hidden sm:block" />
        </div>
      </div>

      {/* Center Section: Search */}
      <div className="hidden md:flex flex-1 max-w-md mx-4 lg:mx-8">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="w-full h-9 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 focus:bg-white transition-all duration-200"
            placeholder="Search companies, transactions..."
          />
        </div>
      </div>

      {/* Right Section: Controls */}
      <div className="flex items-center gap-2 lg:gap-4">
        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors duration-150"
          >
            <Bell className="w-6 h-6" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 bg-oh-no text-white text-xs font-bold rounded-full">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotifications(false)}
              />
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                </div>
                <div className="px-4 py-8 text-center text-xs text-gray-500">
                  No new notifications
                </div>
              </div>
            </>
          )}
        </div>

        {/* User Avatar */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="w-10 h-10 bg-primary-600 text-white text-base font-semibold rounded-full flex items-center justify-center hover:bg-primary-700 transition-colors duration-150"
            title={`${user?.email || 'User'} - Click for options`}
          >
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </button>
          {showProfileMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowProfileMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                {/* User Info Section */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user?.email}
                  </p>
                  {user?.org_id && (
                    <p className="text-xs text-gray-500 mt-1 font-mono truncate" title={user.org_id}>
                      Org: {user.org_id.substring(0, 12)}...
                    </p>
                  )}
                </div>

                <button
                  onClick={() => {
                    setShowProfileMenu(false)
                    window.location.href = '/settings'
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <hr className="my-1 border-gray-100" />
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

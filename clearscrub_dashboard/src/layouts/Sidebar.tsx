import React, { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Building2,
  Plug,
  Key,
  Bell,
  Settings,
  BookOpen,
  X,
  Puzzle,
  Menu,
  Route,
  Navigation,
  Zap
} from 'lucide-react'

const baseNavigationItems = [
  { name: 'Companies', href: '/companies', icon: Building2 },
  { name: 'Integrations', href: '/integrations', icon: Plug },
  { name: 'Extensions', href: '/extensions', icon: Puzzle },
  { name: 'Triggers', href: '/triggers', icon: Zap },
  { name: 'API Keys', href: '/api-keys', icon: Key },
  { name: 'Notifications', href: '/notifications', icon: Bell },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'API Docs', href: '/api-docs', icon: BookOpen },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}
export default function Sidebar({ isOpen = false, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const [navigationItems, setNavigationItems] = useState(baseNavigationItems)

  useEffect(() => {
    // Check extension states from localStorage
    const checkExtensionStates = () => {
      const extensionsData = localStorage.getItem('extensions')
      let extensions = []
      
      if (extensionsData) {
        try {
          extensions = JSON.parse(extensionsData)
        } catch (e) {
          extensions = []
        }
      }

      const submissionProfilerEnabled = extensions.find((ext: any) => ext.id === 'submission-profiler')?.enabled || false
      const lenderRouterEnabled = extensions.find((ext: any) => ext.id === 'lender-router')?.enabled || false

      // Build navigation items with conditional extensions
      const dynamicItems = [...baseNavigationItems]
      
      // Insert extension items after Extensions but before API Keys
      const extensionsIndex = dynamicItems.findIndex(item => item.name === 'Extensions')
      let insertIndex = extensionsIndex + 1

      if (submissionProfilerEnabled) {
        dynamicItems.splice(insertIndex, 0, { 
          name: 'Submission Profiler', 
          href: '/submission-profiler', 
          icon: Route 
        })
        insertIndex++
      }

      if (lenderRouterEnabled) {
        dynamicItems.splice(insertIndex, 0, { 
          name: 'Lender Router', 
          href: '/lender-router', 
          icon: Navigation 
        })
      }

      setNavigationItems(dynamicItems)
    }

    checkExtensionStates()
    
    // Listen for extension changes
    const handleStorageChange = () => {
      checkExtensionStates()
    }
    
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('extensionsChanged', handleStorageChange)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('extensionsChanged', handleStorageChange)
    }
  }, [])

  return (
    <aside className={`fixed top-60 lg:top-60 left-0 bottom-0 bg-gray-50 border-r border-gray-200 overflow-y-auto z-50 transform transition-all duration-300 ease-in-out ${
      isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
    } ${isCollapsed ? 'lg:w-16' : 'lg:w-220'}`}>
      {/* Mobile Close Button */}
      <div className="lg:hidden flex justify-end p-4">
        <button
          onClick={onClose}
          className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors duration-150"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="py-4">
        {/* Main Navigation */}
        <div className={`space-y-1 ${isCollapsed ? 'px-2' : 'px-3'}`}>
          {navigationItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                isCollapsed
                  ? `flex items-center justify-center p-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all duration-150 rounded-md ${isActive ? 'bg-primary-50 text-primary-600 font-semibold' : ''}`
                  : `flex items-center gap-3 px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all duration-150 rounded-md ${isActive ? 'bg-primary-50 text-primary-600 font-semibold' : ''}`
              }
              title={isCollapsed ? item.name : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!isCollapsed && <span className="text-sm">{item.name}</span>}
            </NavLink>
          ))}
        </div>
      </nav>
    </aside>
  )
}

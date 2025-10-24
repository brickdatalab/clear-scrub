import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Building2,
  Plug,
  Key,
  Bell,
  Settings,
  BookOpen,
  Puzzle,
  Route,
  Navigation,
  Zap
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import { Link } from 'react-router-dom'

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

export function AppSidebar() {
  const location = useLocation()
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
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                      <Link to={item.href}>
                        <item.icon />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

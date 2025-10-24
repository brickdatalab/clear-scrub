import React from 'react'
import { Outlet } from 'react-router-dom'
import TopBar from './TopBar'
import { AppSidebar } from './AppSidebar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'

export default function AppShell() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        {/* Sidebar - handles mobile/desktop automatically */}
        <AppSidebar />

        {/* Main content area */}
        <SidebarInset className="flex flex-col">
          {/* Fixed Top Navigation */}
          <TopBar />

          {/* Main Content */}
          <main className="flex-1 overflow-auto bg-background">
            <div className="p-4 sm:p-6 lg:p-8">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

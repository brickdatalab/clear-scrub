import React, { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import DebtSummaryTable, { DebtRecord } from './DebtSummaryTable'
import DebtDetailPanel from './DebtDetailPanel'

interface OpenPanel {
  debt: DebtRecord
  id: string
}

interface DebtSummaryContainerProps {
  companyId?: string
}

export default function DebtSummaryContainer({ companyId }: DebtSummaryContainerProps) {
  const [openPanels, setOpenPanels] = useState<OpenPanel[]>([])
  const [isDebtExpanded, setIsDebtExpanded] = useState(false)

  const handleRowClick = (debt: DebtRecord) => {
    // Check if panel is already open
    const existingPanelIndex = openPanels.findIndex(panel => panel.debt.id === debt.id)
    
    if (existingPanelIndex !== -1) {
      // Panel is already open, close it
      setOpenPanels(prev => prev.filter((_, index) => index !== existingPanelIndex))
    } else {
      // Open new panel
      const newPanel: OpenPanel = {
        debt,
        id: `panel-${debt.id}-${Date.now()}`
      }
      setOpenPanels(prev => [...prev, newPanel])
    }
  }

  const handleClosePanel = (panelId: string) => {
    setOpenPanels(prev => prev.filter(panel => panel.id !== panelId))
  }

  const handleCloseAllPanels = () => {
    setOpenPanels([])
  }

  return (
    <div className="relative">
      {/* Main Content */}
      <Card>
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200">
          <h2 className="text-24 font-semibold text-gray-900">Debt Summary</h2>
          {openPanels.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-13 text-gray-500">
                {openPanels.length} panel{openPanels.length > 1 ? 's' : ''} open
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseAllPanels}
                className="text-13 font-medium"
              >
                Close All
              </Button>
            </div>
          )}
        </div>
        <DebtSummaryTable onRowClick={handleRowClick} companyId={companyId} isExpanded={isDebtExpanded} />

        {/* Expand/Collapse Button for Debt Summary */}
        {/* Note: This will only show if there are more than 20 lender groups */}
        {4 > 20 && (
          <div className="flex justify-center border-t border-gray-200 bg-gray-50 px-4 py-0">
            <Button
              variant="ghost"
              onClick={() => setIsDebtExpanded(!isDebtExpanded)}
              className="py-3 px-6 text-14 font-medium flex items-center gap-2"
            >
              {isDebtExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  <span>Show Less</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  <span>Show More ({4 - 20} more)</span>
                </>
              )}
            </Button>
          </div>
        )}
      </Card>

      {/* Sliding Panels */}
      {openPanels.map((panel, index) => (
        <DebtDetailPanel
          key={panel.id}
          debt={panel.debt}
          isOpen={true}
          onClose={() => handleClosePanel(panel.id)}
          panelIndex={index}
        />
      ))}

      {/* Overlay for multiple panels */}
      {openPanels.length > 0 && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-25 z-40"
          onClick={handleCloseAllPanels}
        />
      )}
    </div>
  )
}

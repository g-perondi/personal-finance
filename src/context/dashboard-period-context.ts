import { createContext, useContext } from 'react'
import type { DashboardPeriod, DashboardScope } from '../lib/dashboard-period'

export type DashboardPeriodContextValue = {
  scope: DashboardScope
  period: DashboardPeriod
  earliestYear: number
  setScope: (scope: DashboardScope) => void
  setPeriod: (period: DashboardPeriod) => void
}

export const DashboardPeriodContext = createContext<DashboardPeriodContextValue | null>(
  null,
)

export function useDashboardPeriodContext(): DashboardPeriodContextValue {
  const context = useContext(DashboardPeriodContext)
  if (!context) {
    throw new Error(
      'useDashboardPeriodContext must be used within DashboardPeriodProvider',
    )
  }
  return context
}

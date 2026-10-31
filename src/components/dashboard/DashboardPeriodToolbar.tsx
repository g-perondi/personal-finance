import type { DashboardPeriod, DashboardScope } from '../../lib/dashboard-period'
import { DashboardPeriodNavigator } from './DashboardPeriodNavigator'

type DashboardPeriodToolbarProps = {
  scope: DashboardScope
  period: DashboardPeriod
  earliestYear: number
  onPeriodChange: (period: DashboardPeriod) => void
}

export function DashboardPeriodToolbar({
  scope,
  period,
  earliestYear,
  onPeriodChange,
}: DashboardPeriodToolbarProps) {
  if (scope === 'global') {
    return null
  }

  return (
    <DashboardPeriodNavigator
      scope={scope}
      period={period}
      earliestYear={earliestYear}
      onPeriodChange={onPeriodChange}
    />
  )
}

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { getEarliestAccountYearInRome } from '../db/repositories/account'
import {
  clampPeriodForDashboard,
  coercePeriodForScope,
  defaultDashboardPeriod,
  type DashboardPeriod,
  type DashboardScope,
} from '../lib/dashboard-period'
import { useDatabase } from '../hooks/useDatabase'
import {
  DashboardPeriodContext,
  type DashboardPeriodContextValue,
} from './dashboard-period-context'

type DashboardPeriodProviderProps = {
  children: ReactNode
}

export function DashboardPeriodProvider({ children }: DashboardPeriodProviderProps) {
  const db = useDatabase()
  const earliestYear = useMemo(() => getEarliestAccountYearInRome(db), [db])
  const [scope, setScopeState] = useState<DashboardScope>('global')
  const [period, setPeriodState] = useState<DashboardPeriod>(() =>
    defaultDashboardPeriod(),
  )

  const periodClamped = useMemo(
    () => clampPeriodForDashboard(period, earliestYear),
    [period, earliestYear],
  )

  const setScope = useCallback(
    (next: DashboardScope) => {
      setScopeState(next)
      setPeriodState((current) => coercePeriodForScope(next, current, earliestYear))
    },
    [earliestYear],
  )

  const setPeriod = useCallback(
    (next: DashboardPeriod) => {
      setPeriodState(clampPeriodForDashboard(next, earliestYear))
    },
    [earliestYear],
  )

  const value = useMemo<DashboardPeriodContextValue>(
    () => ({
      scope,
      period: periodClamped,
      earliestYear,
      setScope,
      setPeriod,
    }),
    [scope, periodClamped, earliestYear, setScope, setPeriod],
  )

  return (
    <DashboardPeriodContext.Provider value={value}>
      {children}
    </DashboardPeriodContext.Provider>
  )
}

import { createContext, useContext } from 'react'

export type SettingsLeaveGuardRegistration = {
  isDirty: boolean
  saveSettings: () => Promise<boolean>
  discardSettings: () => Promise<void>
}

export type SettingsLeaveGuardContextValue = {
  registration: SettingsLeaveGuardRegistration | null
  setRegistration: (value: SettingsLeaveGuardRegistration | null) => void
  pendingLeave: (() => void) | null
  requestLeave: (proceedNavigation: () => void) => void
  clearPendingLeave: () => void
}

export const SettingsLeaveGuardContext =
  createContext<SettingsLeaveGuardContextValue | null>(null)

const noopSettingsLeaveGuard: SettingsLeaveGuardContextValue = {
  registration: null,
  setRegistration: () => {},
  pendingLeave: null,
  requestLeave: (proceedNavigation) => {
    proceedNavigation()
  },
  clearPendingLeave: () => {},
}

export function useSettingsLeaveGuard(): SettingsLeaveGuardContextValue {
  return useContext(SettingsLeaveGuardContext) ?? noopSettingsLeaveGuard
}

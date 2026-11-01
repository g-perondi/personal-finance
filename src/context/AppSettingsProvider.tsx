import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getDatabase, schedulePersist } from '../db/database'
import {
  loadAppSettings,
  patchAppSettings,
  type AppSettings,
  type AppSettingPatch,
} from '../db/repositories/app_setting'
import { countDocuments } from '../db/repositories/document'
import { countOpenHoldings } from '../db/repositories/holding'
import { setDisplayTimeZone } from '../lib/datetime'
import { applyDateDisplayFormat, applyNumberLocale } from '../lib/locale-format'
import {
  SettingsLeaveGuardContext,
  type SettingsLeaveGuardRegistration,
} from './settings-leave-guard-context'
import {
  canUseBrowserDataDirectory,
  disconnectDataDirectory,
  getDataDirectoryDisplayPath,
  initDataDirectoryFromSettings,
  isDataDirectoryAvailable,
  isEmbeddedAppFrame,
  pickDataDirectoryFromUserGesture,
  resolveDataDirectoryDisplayPath,
} from '../lib/data-directory/storage'
import {
  seedDataDirectoryIfEmpty,
  syncFromDataDirectory,
  syncToDataDirectory,
} from '../lib/data-directory/sync'

export type AppSettingsContextValue = {
  settings: AppSettings
  settingsRevision: number
  loading: boolean
  syncMessage: string | null
  dataDirectoryReady: boolean
  dataDirectoryDisplayPath: string | null
  supportsDataDirectory: boolean
  dataDirectoryEmbeddedFrame: boolean
  updateSettings: (patch: AppSettingPatch) => Promise<AppSettings>
  /** Run after {@link pickDataDirectoryFromUserGesture} returns a folder label. */
  commitDataDirectorySelection: (displayPath: string) => Promise<void>
  pickDataDirectory: () => Promise<string | null>
  syncNow: () => Promise<void>
  disconnectDataFolder: () => Promise<void>
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null)

function applyLocaleSettings(settings: AppSettings): void {
  setDisplayTimeZone(settings.displayTimeZone)
  applyNumberLocale(settings.numberFormat)
  applyDateDisplayFormat(settings.dateFormat)
}

type AppSettingsProviderProps = {
  children: ReactNode
}

export function AppSettingsProvider({ children }: AppSettingsProviderProps) {
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadAppSettings(getDatabase()),
  )
  const [settingsRevision, setSettingsRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [dataDirectoryReady, setDataDirectoryReady] = useState(false)
  const [dataDirectoryDisplayPath, setDataDirectoryDisplayPath] = useState<
    string | null
  >(() => getDataDirectoryDisplayPath(loadAppSettings(getDatabase()).dataDirectoryPath))
  const [settingsLeaveRegistration, setSettingsLeaveRegistration] =
    useState<SettingsLeaveGuardRegistration | null>(null)
  const [settingsPendingLeave, setSettingsPendingLeave] = useState<(() => void) | null>(
    null,
  )

  const syncDataDirectoryDisplayPath = useCallback((settingsPath: string | null) => {
    void resolveDataDirectoryDisplayPath(settingsPath).then((resolved) => {
      setDataDirectoryDisplayPath(resolved)
    })
  }, [])

  const bumpRevision = useCallback(() => {
    setSettingsRevision((value) => value + 1)
  }, [])

  const refreshDataDirectoryState = useCallback(
    (nextSettings: AppSettings) => {
      setDataDirectoryReady(isDataDirectoryAvailable())
      syncDataDirectoryDisplayPath(nextSettings.dataDirectoryPath)
    },
    [syncDataDirectoryDisplayPath],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const initial = loadAppSettings(getDatabase())
      applyLocaleSettings(initial)
      try {
        await initDataDirectoryFromSettings(initial.dataDirectoryPath)
      } catch (error: unknown) {
        console.error('Data directory init failed:', error)
      }
      if (!cancelled) {
        setSettings(initial)
        refreshDataDirectoryState(initial)
        setLoading(false)
      }

      try {
        if (!isDataDirectoryAvailable()) {
          return
        }
        const folderLabel = await resolveDataDirectoryDisplayPath(
          initial.dataDirectoryPath,
        )
        if (!cancelled) {
          setSyncMessage('Syncing data…')
        }
        const result = await syncFromDataDirectory()
        if (result === 'empty') {
          await seedDataDirectoryIfEmpty(loadAppSettings(getDatabase()))
        }
        if (folderLabel) {
          const merged = patchAppSettings(getDatabase(), {
            dataDirectoryPath: folderLabel,
          })
          await syncToDataDirectory(merged)
          schedulePersist()
          if (!cancelled) {
            setSettings(merged)
            refreshDataDirectoryState(merged)
          }
        }
      } catch (error: unknown) {
        if (!cancelled) {
          console.error('Data folder sync on startup failed:', error)
        }
      } finally {
        if (!cancelled) {
          setSyncMessage(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshDataDirectoryState])

  useEffect(() => {
    const onPageHide = () => {
      if (!isDataDirectoryAvailable()) {
        return
      }
      const current = loadAppSettings(getDatabase())
      if (!current.dataDirectoryPath) {
        return
      }
      void syncToDataDirectory(current)
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  const updateSettings = useCallback(
    async (patch: AppSettingPatch): Promise<AppSettings> => {
      const db = getDatabase()
      const effectivePatch: AppSettingPatch = { ...patch }
      if (effectivePatch.investmentsEnabled === false && countOpenHoldings(db) > 0) {
        delete effectivePatch.investmentsEnabled
      }
      if (effectivePatch.documentsEnabled === false && countDocuments(db) > 0) {
        delete effectivePatch.documentsEnabled
      }
      const next = patchAppSettings(db, effectivePatch)
      applyLocaleSettings(next)
      setSettings(next)
      bumpRevision()
      refreshDataDirectoryState(next)
      return next
    },
    [bumpRevision, refreshDataDirectoryState],
  )

  const commitDataDirectorySelection = useCallback(
    async (displayPath: string): Promise<void> => {
      const merged = patchAppSettings(getDatabase(), { dataDirectoryPath: displayPath })
      applyLocaleSettings(merged)
      setSettings(merged)
      bumpRevision()
      refreshDataDirectoryState(merged)
      schedulePersist()

      const resolvedPath = await resolveDataDirectoryDisplayPath(displayPath)
      if (resolvedPath && resolvedPath !== displayPath) {
        const normalized = patchAppSettings(getDatabase(), {
          dataDirectoryPath: resolvedPath,
        })
        setSettings(normalized)
        setDataDirectoryDisplayPath(resolvedPath)
        refreshDataDirectoryState(normalized)
        schedulePersist()
      } else {
        setDataDirectoryDisplayPath(resolvedPath ?? displayPath)
      }

      setSyncMessage('Syncing data…')
      try {
        await syncToDataDirectory(loadAppSettings(getDatabase()))
        schedulePersist()
      } finally {
        setSyncMessage(null)
        refreshDataDirectoryState(loadAppSettings(getDatabase()))
      }
    },
    [bumpRevision, refreshDataDirectoryState],
  )

  const pickDataDirectoryAction = useCallback(async (): Promise<string | null> => {
    const displayPath = await pickDataDirectoryFromUserGesture()
    if (!displayPath) {
      return null
    }
    await commitDataDirectorySelection(displayPath)
    return displayPath
  }, [commitDataDirectorySelection])

  const syncNow = useCallback(async () => {
    const current = loadAppSettings(getDatabase())
    await syncToDataDirectory(current)
    schedulePersist()
  }, [])

  const disconnectDataFolder = useCallback(async () => {
    await disconnectDataDirectory()
    await updateSettings({ dataDirectoryPath: null })
    setDataDirectoryDisplayPath(null)
  }, [updateSettings])

  const requestSettingsLeave = useCallback((proceedNavigation: () => void) => {
    setSettingsPendingLeave(() => proceedNavigation)
  }, [])

  const clearSettingsPendingLeave = useCallback(() => {
    setSettingsPendingLeave(null)
  }, [])

  const settingsLeaveGuardValue = useMemo(
    () => ({
      registration: settingsLeaveRegistration,
      setRegistration: setSettingsLeaveRegistration,
      pendingLeave: settingsPendingLeave,
      requestLeave: requestSettingsLeave,
      clearPendingLeave: clearSettingsPendingLeave,
    }),
    [
      clearSettingsPendingLeave,
      requestSettingsLeave,
      settingsLeaveRegistration,
      settingsPendingLeave,
    ],
  )

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      settings,
      settingsRevision,
      loading,
      syncMessage,
      dataDirectoryReady,
      dataDirectoryDisplayPath,
      supportsDataDirectory:
        canUseBrowserDataDirectory() || Boolean(window.electronDesktop?.isElectron),
      dataDirectoryEmbeddedFrame:
        isEmbeddedAppFrame() && !window.electronDesktop?.isElectron,
      updateSettings,
      commitDataDirectorySelection,
      pickDataDirectory: pickDataDirectoryAction,
      syncNow,
      disconnectDataFolder,
    }),
    [
      commitDataDirectorySelection,
      dataDirectoryDisplayPath,
      dataDirectoryReady,
      disconnectDataFolder,
      loading,
      pickDataDirectoryAction,
      settings,
      settingsRevision,
      syncMessage,
      syncNow,
      updateSettings,
    ],
  )

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-slate-950 text-slate-300">
        <p>{syncMessage ?? 'Loading settings…'}</p>
      </div>
    )
  }

  return (
    <AppSettingsContext.Provider value={value}>
      <SettingsLeaveGuardContext.Provider value={settingsLeaveGuardValue}>
        {children}
      </SettingsLeaveGuardContext.Provider>
    </AppSettingsContext.Provider>
  )
}

export function useAppSettings(): AppSettingsContextValue {
  const ctx = useContext(AppSettingsContext)
  if (!ctx) {
    throw new Error('useAppSettings must be used within AppSettingsProvider')
  }
  return ctx
}

/** @deprecated use useAppSettings */
export function useDataDirectory(): Pick<
  AppSettingsContextValue,
  | 'dataDirectoryReady'
  | 'dataDirectoryDisplayPath'
  | 'pickDataDirectory'
  | 'syncNow'
  | 'disconnectDataFolder'
  | 'supportsDataDirectory'
> {
  const ctx = useAppSettings()
  return {
    dataDirectoryReady: ctx.dataDirectoryReady,
    dataDirectoryDisplayPath: ctx.dataDirectoryDisplayPath,
    pickDataDirectory: ctx.pickDataDirectory,
    syncNow: ctx.syncNow,
    disconnectDataFolder: ctx.disconnectDataFolder,
    supportsDataDirectory: ctx.supportsDataDirectory,
  }
}

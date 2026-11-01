import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Globe2,
  HardDrive,
  LayoutGrid,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { FormSelect } from '../components/ui/FormSelect'
import { SettingsSwitch } from '../components/ui/SettingsSwitch'
import { LocalDataSection } from '../components/settings/LocalDataSection'
import { Modal } from '../components/ui/Modal'
import { useAppSettings } from '../context/AppSettingsProvider'
import { useSettingsLeaveGuard } from '../context/settings-leave-guard-context'
import type {
  AppSettings,
  DateFormatKey,
  NumberFormatKey,
} from '../db/repositories/app_setting'
import { formatCents } from '../lib/money'
import { DATE_FORMAT_OPTIONS, NUMBER_FORMAT_OPTIONS } from '../lib/locale-format'
import { APP_SCROLLBAR_CLASS } from '../lib/scroll-ui'
import { countDocuments } from '../db/repositories/document'
import { countOpenHoldings } from '../db/repositories/holding'
import { useDatabase } from '../hooks/useDatabase'
import {
  getDataDirectoryDisplayPath,
  pickDataDirectoryFromUserGesture,
  restoreDataDirectoryFromSettings,
  stageDataDirectoryPath,
} from '../lib/data-directory/storage'
import { syncToDataDirectory } from '../lib/data-directory/sync'
import { schedulePersist } from '../db/database'

const COMMON_TIME_ZONES = [
  'Europe/Rome',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'UTC',
] as const

const SETTINGS_SECTIONS = [
  {
    id: 'data',
    label: 'Data',
    icon: HardDrive,
    description:
      'Choose a folder for sync and document files, export or restore backups, or clear this device.',
  },
  {
    id: 'display',
    label: 'Display',
    icon: Globe2,
    description:
      'How amounts and dates appear across the app. All amounts are stored and shown in EUR.',
  },
  {
    id: 'app-sections',
    label: 'Sections',
    icon: LayoutGrid,
    description:
      'Hide areas you do not use. Data stays in your database; only navigation and dashboards change.',
  },
] as const

type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']

type SettingsFormState = Pick<
  AppSettings,
  | 'dateFormat'
  | 'numberFormat'
  | 'displayTimeZone'
  | 'investmentsEnabled'
  | 'documentsEnabled'
  | 'dataDirectoryPath'
>

function pickSettingsFormState(settings: AppSettings): SettingsFormState {
  return {
    dateFormat: settings.dateFormat,
    numberFormat: settings.numberFormat,
    displayTimeZone: settings.displayTimeZone,
    investmentsEnabled: settings.investmentsEnabled,
    documentsEnabled: settings.documentsEnabled,
    dataDirectoryPath: settings.dataDirectoryPath,
  }
}

function resolveDraftTimeZone(
  draft: SettingsFormState,
  timeZoneMode: 'preset' | 'custom',
  customTimeZone: string,
): string {
  if (timeZoneMode === 'custom') {
    return customTimeZone.trim()
  }
  return draft.displayTimeZone
}

function isSettingsFormDirty(
  persisted: AppSettings,
  draft: SettingsFormState,
  timeZoneMode: 'preset' | 'custom',
  customTimeZone: string,
): boolean {
  const resolvedZone = resolveDraftTimeZone(draft, timeZoneMode, customTimeZone)
  const base = pickSettingsFormState(persisted)
  return (
    draft.dateFormat !== base.dateFormat ||
    draft.numberFormat !== base.numberFormat ||
    resolvedZone !== base.displayTimeZone ||
    draft.investmentsEnabled !== base.investmentsEnabled ||
    draft.documentsEnabled !== base.documentsEnabled ||
    draft.dataDirectoryPath !== base.dataDirectoryPath
  )
}

const BTN_PRIMARY =
  'rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50'

const BTN_SECONDARY =
  'rounded-lg border border-slate-600 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50'

const BTN_GHOST =
  'rounded-lg border border-slate-700/80 px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:border-slate-600 hover:bg-slate-800/60 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50'

function SettingsSectionNav({
  active,
  onChange,
}: {
  active: SettingsSectionId
  onChange: (id: SettingsSectionId) => void
}) {
  return (
    <div
      className="flex w-full flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1"
      role="tablist"
      aria-label="Settings sections"
    >
      {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => {
        const selected = active === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`settings-tab-${id}`}
            aria-selected={selected}
            aria-controls={`settings-panel-${id}`}
            className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 ${
              selected
                ? 'bg-slate-800 text-white shadow-sm shadow-black/20'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
            onClick={() => onChange(id)}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

function SettingsSectionPanel({
  sectionId,
  title,
  icon: Icon,
  description,
  children,
}: {
  sectionId: SettingsSectionId
  title: string
  icon: LucideIcon
  description: string
  children: ReactNode
}) {
  return (
    <section
      id={`settings-panel-${sectionId}`}
      role="tabpanel"
      aria-labelledby={`settings-tab-${sectionId}`}
      className="rounded-xl border border-slate-800 bg-slate-900/30 p-5 shadow-sm shadow-black/10"
    >
      <div className="flex items-start gap-3 border-b border-slate-800/80 pb-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 text-slate-300">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function SettingsField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium tracking-wide text-slate-400 uppercase">
        {label}
      </span>
      {children}
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function SettingsPage() {
  const { settings, updateSettings, supportsDataDirectory } = useAppSettings()
  const { setRegistration, pendingLeave, clearPendingLeave } = useSettingsLeaveGuard()
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('data')
  const [draft, setDraft] = useState<SettingsFormState>(() =>
    pickSettingsFormState(settings),
  )
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null)
  const [folderError, setFolderError] = useState<string | null>(null)
  const pickingFolderRef = useRef(false)
  const [customTimeZone, setCustomTimeZone] = useState(() => settings.displayTimeZone)
  const [timeZoneMode, setTimeZoneMode] = useState<'preset' | 'custom'>(() =>
    COMMON_TIME_ZONES.includes(
      settings.displayTimeZone as (typeof COMMON_TIME_ZONES)[number],
    )
      ? 'preset'
      : 'custom',
  )

  const db = useDatabase()
  const openHoldingsCount = countOpenHoldings(db)
  const documentCount = countDocuments(db)
  const investmentsSectionLocked = settings.investmentsEnabled && openHoldingsCount > 0
  const documentsSectionLocked = settings.documentsEnabled && documentCount > 0

  const isDirty = useMemo(
    () => isSettingsFormDirty(settings, draft, timeZoneMode, customTimeZone),
    [customTimeZone, draft, settings, timeZoneMode],
  )

  const currentFolderPath = useMemo(
    () => getDataDirectoryDisplayPath(draft.dataDirectoryPath),
    [draft.dataDirectoryPath],
  )

  const exampleAmount = formatCents(123456)

  const dateFormatExample = useMemo(
    () =>
      DATE_FORMAT_OPTIONS.find((option) => option.value === draft.dateFormat)
        ?.example ?? '',
    [draft.dateFormat],
  )

  async function handleRevertSettings(): Promise<void> {
    setDraft(pickSettingsFormState(settings))
    setCustomTimeZone(settings.displayTimeZone)
    setTimeZoneMode(
      COMMON_TIME_ZONES.includes(
        settings.displayTimeZone as (typeof COMMON_TIME_ZONES)[number],
      )
        ? 'preset'
        : 'custom',
    )
    setSettingsSaveError(null)
    setFolderError(null)
    try {
      await restoreDataDirectoryFromSettings(settings.dataDirectoryPath)
    } catch (error: unknown) {
      setFolderError(
        error instanceof Error ? error.message : 'Unable to restore data folder.',
      )
    }
  }

  async function handleSaveSettings(): Promise<boolean> {
    const displayTimeZone = resolveDraftTimeZone(draft, timeZoneMode, customTimeZone)
    if (!displayTimeZone) {
      setSettingsSaveError('Enter a valid time zone.')
      return false
    }
    setSettingsSaveError(null)
    setFolderError(null)
    setSavingSettings(true)
    const previous = settings
    const folderChanged = draft.dataDirectoryPath !== settings.dataDirectoryPath
    try {
      const saved = await updateSettings({
        dateFormat: draft.dateFormat,
        numberFormat: draft.numberFormat,
        displayTimeZone,
        investmentsEnabled: draft.investmentsEnabled,
        documentsEnabled: draft.documentsEnabled,
        dataDirectoryPath: draft.dataDirectoryPath,
      })
      if (folderChanged && saved.dataDirectoryPath) {
        try {
          await syncToDataDirectory(saved)
          schedulePersist()
        } catch (syncError: unknown) {
          await updateSettings(pickSettingsFormState(previous))
          await restoreDataDirectoryFromSettings(previous.dataDirectoryPath)
          setDraft(pickSettingsFormState(previous))
          setCustomTimeZone(previous.displayTimeZone)
          setTimeZoneMode(
            COMMON_TIME_ZONES.includes(
              previous.displayTimeZone as (typeof COMMON_TIME_ZONES)[number],
            )
              ? 'preset'
              : 'custom',
          )
          setSettingsSaveError(
            syncError instanceof Error
              ? syncError.message
              : 'Saved folder could not be synced.',
          )
          return false
        }
      }
      setDraft(pickSettingsFormState(saved))
      setCustomTimeZone(saved.displayTimeZone)
      setTimeZoneMode(
        COMMON_TIME_ZONES.includes(
          saved.displayTimeZone as (typeof COMMON_TIME_ZONES)[number],
        )
          ? 'preset'
          : 'custom',
      )
      return true
    } catch (error: unknown) {
      setSettingsSaveError(
        error instanceof Error ? error.message : 'Unable to save settings.',
      )
      return false
    } finally {
      setSavingSettings(false)
    }
  }

  const saveSettingsRef = useRef(handleSaveSettings)
  const discardSettingsRef = useRef(handleRevertSettings)

  useEffect(() => {
    saveSettingsRef.current = handleSaveSettings
    discardSettingsRef.current = handleRevertSettings
  })

  useEffect(() => {
    setRegistration({
      isDirty,
      saveSettings: () => saveSettingsRef.current(),
      discardSettings: () => discardSettingsRef.current(),
    })
    return () => {
      setRegistration(null)
    }
  }, [isDirty, setRegistration])

  function handleChooseFolderClick() {
    if (pickingFolderRef.current) {
      return
    }
    pickingFolderRef.current = true
    const pickPromise = pickDataDirectoryFromUserGesture()
    void pickPromise
      .then(async (displayPath) => {
        if (!displayPath?.trim()) {
          return
        }
        const stagedPath = await stageDataDirectoryPath(displayPath)
        setDraft((current) => ({
          ...current,
          dataDirectoryPath: stagedPath,
        }))
        setFolderError(null)
      })
      .catch((error: unknown) => {
        setFolderError(
          error instanceof Error ? error.message : 'Unable to choose folder.',
        )
      })
      .finally(() => {
        pickingFolderRef.current = false
      })
  }

  const sectionMeta = SETTINGS_SECTIONS.find((item) => item.id === activeSection)!

  return (
    <div className="app-page p-8">
      <header className="mb-6 shrink-0 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-slate-800/80 text-slate-200">
            <SlidersHorizontal className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-2xl font-semibold text-white">Settings</h2>
            <p className="mt-0.5 text-sm text-slate-400">
              Pick a section to configure data, backups, display, or navigation.
            </p>
          </div>
        </div>
      </header>

      <div className="app-page-scroll-ceiling">
        <div className={`data-table-scroll-body ${APP_SCROLLBAR_CLASS}`}>
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-2">
            <SettingsSectionNav active={activeSection} onChange={setActiveSection} />

            {activeSection === 'data' ? (
              <SettingsSectionPanel
                sectionId="data"
                title={sectionMeta.label}
                icon={sectionMeta.icon}
                description={sectionMeta.description}
              >
                {!supportsDataDirectory ? (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
                    Folder sync needs Chrome, Edge, or the desktop app. Without a
                    folder, backups still use a save dialog when your browser supports
                    it.
                  </p>
                ) : null}

                <SettingsField label="Current folder">
                  <p
                    className="rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2.5 font-mono text-xs leading-relaxed break-all text-slate-300"
                    title={currentFolderPath ?? undefined}
                  >
                    {currentFolderPath ?? 'Not configured'}
                  </p>
                </SettingsField>

                {folderError ? (
                  <p className="text-sm text-red-400" role="alert">
                    {folderError}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    className={BTN_PRIMARY}
                    disabled={!supportsDataDirectory}
                    onClickCapture={handleChooseFolderClick}
                  >
                    Choose folder
                  </button>
                </div>

                <div className="border-t border-slate-800/80 pt-4">
                  <p className="mb-3 text-xs font-medium tracking-wide text-slate-400 uppercase">
                    Backup & reset
                  </p>
                  <LocalDataSection />
                </div>
              </SettingsSectionPanel>
            ) : null}

            {activeSection === 'display' ? (
              <SettingsSectionPanel
                sectionId="display"
                title={sectionMeta.label}
                icon={sectionMeta.icon}
                description={sectionMeta.description}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <SettingsField
                    label="Number format"
                    hint={`Example: ${exampleAmount}`}
                  >
                    <FormSelect
                      value={draft.numberFormat}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          numberFormat: value as NumberFormatKey,
                        }))
                      }
                      options={NUMBER_FORMAT_OPTIONS.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                      aria-label="Number format"
                    />
                  </SettingsField>

                  <SettingsField
                    label="Date format"
                    hint={
                      dateFormatExample ? `Example: ${dateFormatExample}` : undefined
                    }
                  >
                    <FormSelect
                      value={draft.dateFormat}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          dateFormat: value as DateFormatKey,
                        }))
                      }
                      options={DATE_FORMAT_OPTIONS.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                      aria-label="Date format"
                    />
                  </SettingsField>

                  <SettingsField label="Time zone">
                    <FormSelect
                      value={
                        timeZoneMode === 'preset' ? draft.displayTimeZone : '__custom__'
                      }
                      onChange={(value) => {
                        if (value === '__custom__') {
                          setTimeZoneMode('custom')
                          setCustomTimeZone(draft.displayTimeZone)
                          return
                        }
                        setTimeZoneMode('preset')
                        setDraft((current) => ({
                          ...current,
                          displayTimeZone: value,
                        }))
                      }}
                      options={[
                        ...COMMON_TIME_ZONES.map((zone) => ({
                          value: zone,
                          label: zone,
                        })),
                        { value: '__custom__', label: 'Other…' },
                      ]}
                      aria-label="Time zone"
                    />
                  </SettingsField>
                </div>

                {timeZoneMode === 'custom' ? (
                  <input
                    type="text"
                    className="form-field w-full min-w-0"
                    value={customTimeZone}
                    onChange={(event) => setCustomTimeZone(event.target.value)}
                    placeholder="IANA time zone, e.g. Europe/Rome"
                  />
                ) : null}
              </SettingsSectionPanel>
            ) : null}

            {activeSection === 'app-sections' ? (
              <SettingsSectionPanel
                sectionId="app-sections"
                title={sectionMeta.label}
                icon={sectionMeta.icon}
                description={sectionMeta.description}
              >
                <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800/60 bg-slate-950/40 px-4">
                  <div className="py-3">
                    <SettingsSwitch
                      label="Investments"
                      description={
                        investmentsSectionLocked
                          ? 'Turn off after you close or remove all open holdings.'
                          : 'Portfolio, holdings, and investment metrics on the dashboard.'
                      }
                      checked={draft.investmentsEnabled}
                      disabled={investmentsSectionLocked}
                      onChange={(checked) =>
                        setDraft((current) => ({
                          ...current,
                          investmentsEnabled: checked,
                        }))
                      }
                    />
                  </div>
                  <div className="py-3">
                    <SettingsSwitch
                      label="Documents"
                      description={
                        documentsSectionLocked
                          ? 'Remove all documents before hiding this section.'
                          : 'Document files are stored in your data folder.'
                      }
                      checked={draft.documentsEnabled}
                      disabled={documentsSectionLocked}
                      onChange={(checked) =>
                        setDraft((current) => ({
                          ...current,
                          documentsEnabled: checked,
                        }))
                      }
                    />
                  </div>
                </div>
              </SettingsSectionPanel>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-slate-800/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-slate-300">
                  {isDirty ? 'You have unsaved changes.' : 'All settings are saved.'}
                </p>
                {settingsSaveError ? (
                  <p className="mt-1 text-sm text-red-400" role="alert">
                    {settingsSaveError}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  className={BTN_GHOST}
                  disabled={!isDirty || savingSettings}
                  onClick={() => void handleRevertSettings()}
                >
                  Revert
                </button>
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={!isDirty || savingSettings}
                  onClick={() =>
                    void handleSaveSettings().then((saved) => {
                      if (saved) {
                        setSettingsSaveError(null)
                      }
                    })
                  }
                >
                  {savingSettings ? 'Saving…' : 'Save settings'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        title="Leave settings?"
        open={pendingLeave !== null}
        onClose={() => {
          if (savingSettings) {
            return
          }
          clearPendingLeave()
          setSettingsSaveError(null)
        }}
      >
        <p className="text-sm text-slate-300">
          You have unsaved changes. If you leave this page, they will be lost.
        </p>
        {settingsSaveError ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {settingsSaveError}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className={BTN_GHOST}
            disabled={savingSettings}
            onClick={() => {
              clearPendingLeave()
              setSettingsSaveError(null)
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={savingSettings}
            onClick={() => {
              void discardSettingsRef.current().then(() => {
                pendingLeave?.()
                clearPendingLeave()
                setSettingsSaveError(null)
              })
            }}
          >
            Discard
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={savingSettings}
            onClick={() => {
              void saveSettingsRef.current().then((saved) => {
                if (!saved) {
                  return
                }
                pendingLeave?.()
                clearPendingLeave()
                setSettingsSaveError(null)
              })
            }}
          >
            {savingSettings ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

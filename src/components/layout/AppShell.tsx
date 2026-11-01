import { NavLink, Outlet, useLocation, useNavigate, type To } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import {
  ArrowLeftRight,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Tag,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useAppSettings } from '../../context/AppSettingsProvider'
import { useSettingsLeaveGuard } from '../../context/settings-leave-guard-context'
import { syncToDataDirectory } from '../../lib/data-directory/sync'

const baseNavItems: Array<{
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
  feature?: 'investments' | 'documents'
}> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  {
    to: '/investments',
    label: 'Investments',
    icon: TrendingUp,
    feature: 'investments',
  },
  { to: '/categories', label: 'Categories', icon: Tag },
  { to: '/documents', label: 'Documents', icon: FolderOpen, feature: 'documents' },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
]

function navLinkClass(isActive: boolean): string {
  const base =
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors'
  return isActive
    ? `${base} bg-slate-800 text-white`
    : `${base} text-slate-300 hover:bg-slate-800/60 hover:text-white`
}

export function AppShell() {
  const { settings, dataDirectoryDisplayPath } = useAppSettings()
  const location = useLocation()
  const navigate = useNavigate()
  const { registration, requestLeave } = useSettingsLeaveGuard()
  const [exitOpen, setExitOpen] = useState(false)
  const [exitWorking, setExitWorking] = useState(false)
  const [exitError, setExitError] = useState<string | null>(null)

  const tryNavigateFromSettings = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, to: To) => {
      if (location.pathname !== '/settings') {
        return
      }
      if (!registration?.isDirty) {
        return
      }
      const targetPath = typeof to === 'string' ? to : (to.pathname ?? '')
      if (targetPath === '/settings') {
        return
      }
      event.preventDefault()
      requestLeave(() => {
        navigate(to)
      })
    },
    [location.pathname, navigate, registration?.isDirty, requestLeave],
  )

  const navItems = useMemo(
    () =>
      baseNavItems.filter((item) => {
        if (item.feature === 'investments' && !settings.investmentsEnabled) {
          return false
        }
        if (item.feature === 'documents' && !settings.documentsEnabled) {
          return false
        }
        return true
      }),
    [settings.documentsEnabled, settings.investmentsEnabled],
  )

  useEffect(() => {
    const desktop = window.electronDesktop
    if (!desktop?.onRequestClose) {
      return
    }
    return desktop.onRequestClose(() => {
      setExitError(null)
      setExitOpen(true)
    })
  }, [])

  async function confirmExit() {
    setExitWorking(true)
    setExitError(null)
    try {
      if (dataDirectoryDisplayPath) {
        await syncToDataDirectory(settings)
      }
      window.electronDesktop?.quit?.()
      setExitOpen(false)
    } catch (error: unknown) {
      setExitError(
        error instanceof Error ? error.message : 'Unable to sync before exit.',
      )
      setExitWorking(false)
    }
  }

  return (
    <>
      <div className="flex h-dvh max-h-dvh overflow-hidden bg-slate-950 font-sans text-slate-100">
        <aside className="app-sidebar flex w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900 px-4 py-6">
          <div className="mb-8 px-2">
            <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
              Personal
            </p>
            <h1 className="text-lg font-semibold text-white">Finance</h1>
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                draggable={false}
                className={({ isActive }) => navLinkClass(isActive)}
                onClick={(event) => tryNavigateFromSettings(event, to)}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto shrink-0 border-t border-slate-800 pt-3">
            <NavLink
              to="/settings"
              draggable={false}
              className={({ isActive }) => navLinkClass(isActive)}
              onClick={(event) => tryNavigateFromSettings(event, '/settings')}
            >
              <Settings className="size-4 shrink-0" aria-hidden />
              Settings
            </NavLink>
          </div>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>

      <Modal
        title="Exit application?"
        open={exitOpen}
        onClose={() => !exitWorking && setExitOpen(false)}
      >
        <p className="text-sm text-slate-300">
          {dataDirectoryDisplayPath
            ? 'Sync to your data folder and exit?'
            : 'Close the application?'}
        </p>
        {exitError ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {exitError}
          </p>
        ) : null}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
            disabled={exitWorking}
            onClick={() => setExitOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white disabled:opacity-50"
            disabled={exitWorking}
            onClick={() => void confirmExit()}
          >
            {exitWorking ? 'Syncing…' : 'Exit'}
          </button>
        </div>
      </Modal>
    </>
  )
}

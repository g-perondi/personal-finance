import { NavLink, Outlet } from 'react-router-dom'
import {
  ArrowLeftRight,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Tag,
  Wallet,
} from 'lucide-react'

const navItems: Array<{
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/movimenti', label: 'Movimenti', icon: ArrowLeftRight },
  { to: '/conti', label: 'Conti', icon: Wallet },
  { to: '/categorie', label: 'Categorie', icon: Tag },
  { to: '/documenti', label: 'Documenti', icon: FolderOpen },
  { to: '/impostazioni', label: 'Impostazioni', icon: Settings },
]

function navLinkClass(isActive: boolean): string {
  const base =
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors'
  return isActive
    ? `${base} bg-slate-800 text-white`
    : `${base} text-slate-300 hover:bg-slate-800/60 hover:text-white`
}

export function AppShell() {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900 px-4 py-6">
        <div className="mb-8 px-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Personal
          </p>
          <h1 className="text-lg font-semibold text-white">Finanze</h1>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => navLinkClass(isActive)}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}

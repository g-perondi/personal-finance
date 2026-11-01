import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDbContext } from '../context/db-context'

type DbGateProps = {
  children: ReactNode
}

export function DbGate({ children }: DbGateProps) {
  const { status, errorMessage, retry } = useDbContext()

  if (status === 'loading') {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-slate-950 text-slate-200">
        <Loader2 className="size-10 animate-spin text-slate-400" aria-hidden />
        <p className="text-sm text-slate-400">Loading local database…</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-slate-200">
        <p className="max-w-md text-sm text-red-300">{errorMessage}</p>
        <button
          type="button"
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          onClick={retry}
        >
          Retry
        </button>
      </div>
    )
  }

  return children
}

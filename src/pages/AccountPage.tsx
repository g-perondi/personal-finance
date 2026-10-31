import { useCallback, useMemo, useState } from 'react'
import { Archive, Pencil, Plus } from 'lucide-react'
import { Modal } from '../components/ui/Modal'
import {
  archiveAccount,
  countAccountTransactions,
  createAccount,
  listAccounts,
  updateAccount,
  type AccountWithBalance,
} from '../db/repositories/account'
import { useDatabase } from '../hooks/useDatabase'
import {
  currentRomeYear,
  todayRomeDateInputValue,
  utcIsoToRomeDateInputValue,
} from '../lib/datetime'
import { centsToInputValue, formatCents, parseInputToCents } from '../lib/money'

type AccountFormState = {
  name: string
  openingBalance: string
  openingDate: string
  note: string
}

const emptyForm = (): AccountFormState => ({
  name: '',
  openingBalance: '0.00',
  openingDate: todayRomeDateInputValue(),
  note: '',
})

export function AccountPage() {
  const db = useDatabase()
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AccountWithBalance | null>(null)
  const [form, setForm] = useState<AccountFormState>(() => emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [txCount, setTxCount] = useState(0)

  const calendarYear = currentRomeYear()

  const accounts = useMemo(() => {
    void refreshKey
    return listAccounts(db, {
      orderBy: 'balanceDesc',
      includeAverageDailyBalanceYtd: true,
    })
  }, [db, refreshKey])

  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setFormError(null)
    setTxCount(0)
    setModalOpen(true)
  }

  function openEdit(account: AccountWithBalance) {
    setEditing(account)
    setForm({
      name: account.name,
      openingBalance: centsToInputValue(account.openingBalanceCents),
      openingDate: utcIsoToRomeDateInputValue(account.openedAt),
      note: account.note ?? '',
    })
    setFormError(null)
    setTxCount(countAccountTransactions(db, account.id))
    setModalOpen(true)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const openingCents = parseInputToCents(form.openingBalance)
    if (!form.name.trim()) {
      setFormError('Name is required.')
      return
    }
    if (openingCents === null) {
      setFormError('Enter a valid opening balance.')
      return
    }
    try {
      if (editing) {
        updateAccount(db, editing.id, {
          name: form.name,
          note: form.note,
          openingBalanceCents: txCount === 0 ? openingCents : undefined,
          openingDate: txCount === 0 ? form.openingDate : undefined,
        })
      } else {
        createAccount(db, {
          name: form.name,
          openingBalanceCents: openingCents,
          note: form.note,
          openingDate: form.openingDate,
        })
      }
      setModalOpen(false)
      bump()
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : 'Save failed.')
    }
  }

  function handleArchive(account: AccountWithBalance) {
    if (!window.confirm(`Archive account "${account.name}"?`)) {
      return
    }
    archiveAccount(db, account.id)
    bump()
  }

  const openingLocked = editing !== null && txCount > 0

  return (
    <div className="flex flex-1 flex-col p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <h2 className="text-2xl font-semibold text-white">Accounts</h2>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white"
          onClick={openCreate}
        >
          <Plus className="size-4" aria-hidden />
          Add account
        </button>
      </header>

      {accounts.length === 0 ? (
        <p className="text-sm text-slate-500">
          No accounts yet. Add your first account.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="accounts-table data-table text-sm">
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th>Name</th>
                <th className="money-cell">Balance</th>
                <th className="money-cell">Average balance ({calendarYear})</th>
                <th className="money-cell">Invested</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {accounts.map((account) => (
                <tr key={account.id} className="text-slate-200">
                  <td className="truncate font-medium text-white">{account.name}</td>
                  <td className="money-cell">{formatCents(account.balanceCents)}</td>
                  <td className="money-cell">
                    {formatCents(account.averageDailyBalanceYtdCents ?? 0)}
                  </td>
                  <td className="money-cell">
                    {formatCents(account.investedYtdCents ?? 0)}
                  </td>
                  <td className="truncate text-slate-400">{account.note ?? '—'}</td>
                  <td>
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                        aria-label={`Edit ${account.name}`}
                        onClick={() => openEdit(account)}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-amber-300"
                        aria-label={`Archive ${account.name}`}
                        onClick={() => handleArchive(account)}
                      >
                        <Archive className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        title={editing ? 'Edit account' : 'Add account'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Name</span>
            <input
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Opening balance (EUR)</span>
            <input
              value={form.openingBalance}
              disabled={openingLocked}
              onChange={(event) =>
                setForm({ ...form, openingBalance: event.target.value })
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-50"
            />
            {openingLocked ? (
              <span className="text-xs text-slate-500">
                Opening balance cannot change after transactions exist on this account.
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Opening date</span>
            <input
              type="date"
              required
              value={form.openingDate}
              disabled={openingLocked}
              onChange={(event) =>
                setForm({ ...form, openingDate: event.target.value })
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-50"
            />
            {openingLocked ? (
              <span className="text-xs text-slate-500">
                Opening date cannot change after transactions exist on this account.
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Note</span>
            <textarea
              value={form.note}
              rows={2}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
          {formError ? <p className="text-sm text-red-400">{formError}</p> : null}
          <button
            type="submit"
            className="rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-900 hover:bg-white"
          >
            Save
          </button>
        </form>
      </Modal>
    </div>
  )
}

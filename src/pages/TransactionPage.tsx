import { useCallback, useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { DashboardPeriodToolbar } from '../components/dashboard/DashboardPeriodToolbar'
import { DashboardScopeBar } from '../components/dashboard/DashboardScopeBar'
import {
  EntryKindPicker,
  type EntryKind,
} from '../components/transactions/EntryKindPicker'
import { Modal } from '../components/ui/Modal'
import { getEarliestAccountYearInRome, listAccounts } from '../db/repositories/account'
import { listCategories } from '../db/repositories/category'
import type { TransactionListItem } from '../db/repositories/model'
import {
  createSimpleTransaction,
  deleteSimpleTransaction,
  listTransactions,
  updateSimpleTransaction,
} from '../db/repositories/transaction'
import {
  createTransfer,
  deleteTransfer,
  updateTransfer,
} from '../db/repositories/transfer'
import { recurrenceKindLabel } from '../db/recurrence'
import type { RecurrenceKind } from '../db/types'
import { useDatabase } from '../hooks/useDatabase'
import {
  clampPeriodForDashboard,
  coercePeriodForScope,
  defaultDashboardPeriod,
  periodBounds,
  type DashboardPeriod,
  type DashboardScope,
} from '../lib/dashboard-period'
import {
  formatCalendarDateInRome,
  todayRomeDateInputValue,
  utcIsoToRomeDateInputValue,
} from '../lib/datetime'
import { centsToInputValue, formatCents, parseInputToCents } from '../lib/money'

type FormState = {
  kind: EntryKind
  accountId: string
  fromAccountId: string
  toAccountId: string
  amount: string
  date: string
  description: string
  categoryId: string
  recurrenceKind: RecurrenceKind | ''
}

function entryKindNeedsRecurrence(kind: EntryKind): boolean {
  return kind === 'income' || kind === 'expense' || kind === 'investment'
}

const emptyForm = (): FormState => ({
  kind: 'expense',
  accountId: '',
  fromAccountId: '',
  toAccountId: '',
  amount: '',
  date: todayRomeDateInputValue(),
  description: '',
  categoryId: '',
  recurrenceKind: 'variable',
})

function addEntryModalTitle(
  editingTxId: string | null,
  editingTransferId: string | null,
): string {
  if (editingTxId || editingTransferId) {
    return 'Edit entry'
  }
  return 'Add entry'
}

function kindLabel(
  kind: TransactionListItem['kind'],
  transferLeg: TransactionListItem['transferLeg'],
): string {
  if (kind === 'transfer') {
    return transferLeg === 'out' ? 'Transfer out' : 'Transfer in'
  }
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

export function TransactionPage() {
  const db = useDatabase()
  const [scope, setScope] = useState<DashboardScope>('global')
  const [period, setPeriod] = useState<DashboardPeriod>(() => defaultDashboardPeriod())
  const [refreshKey, setRefreshKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTransferId, setEditingTransferId] = useState<string | null>(null)
  const [editingTxId, setEditingTxId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const earliestYear = useMemo(() => getEarliestAccountYearInRome(db), [db])
  const bounds = useMemo(
    () => periodBounds(period, earliestYear),
    [period, earliestYear],
  )

  const accounts = useMemo(() => {
    void refreshKey
    return listAccounts(db)
  }, [db, refreshKey])
  const categories = useMemo(() => {
    void refreshKey
    return listCategories(db)
  }, [db, refreshKey])
  const transactions = useMemo(() => {
    void refreshKey
    return listTransactions(db, {
      limit: 500,
      startUtc: bounds.startUtc,
      endUtcExclusive: bounds.endUtcExclusive,
      searchQuery,
    })
  }, [db, refreshKey, bounds.startUtc, bounds.endUtcExclusive, searchQuery])

  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  function handleScopeChange(next: DashboardScope) {
    setScope(next)
    setPeriod((current) => coercePeriodForScope(next, current, earliestYear))
  }

  function handlePeriodChange(next: DashboardPeriod) {
    setPeriod(clampPeriodForDashboard(next, earliestYear))
  }

  function openCreate() {
    setEditingTransferId(null)
    setEditingTxId(null)
    const firstAccount = accounts[0]?.id ?? ''
    const secondAccount =
      accounts.find((account) => account.id !== firstAccount)?.id ?? ''
    setForm({
      ...emptyForm(),
      kind: 'expense',
      accountId: firstAccount,
      fromAccountId: firstAccount,
      toAccountId: secondAccount,
      recurrenceKind: 'variable',
    })
    setError(null)
    setModalOpen(true)
  }

  function openEditSimple(tx: TransactionListItem) {
    if (tx.kind === 'transfer') {
      return
    }
    setEditingTxId(tx.id)
    setEditingTransferId(null)
    setForm({
      kind: tx.kind as EntryKind,
      accountId: tx.accountId,
      fromAccountId: '',
      toAccountId: '',
      amount: centsToInputValue(tx.amountCents),
      date: utcIsoToRomeDateInputValue(tx.transactionDate),
      description: tx.description ?? '',
      categoryId: tx.categoryId ?? '',
      recurrenceKind: tx.recurrenceKind ?? '',
    })
    setError(null)
    setModalOpen(true)
  }

  function openEditTransfer(tx: TransactionListItem) {
    if (!tx.transferId) {
      return
    }
    const legs = listTransactions(db).filter((row) => row.transferId === tx.transferId)
    const outLeg = legs.find((leg) => leg.transferLeg === 'out')
    const inLeg = legs.find((leg) => leg.transferLeg === 'in')
    if (!outLeg || !inLeg) {
      return
    }
    setEditingTransferId(tx.transferId)
    setEditingTxId(null)
    setForm({
      kind: 'transfer',
      accountId: '',
      fromAccountId: outLeg.accountId,
      toAccountId: inLeg.accountId,
      amount: centsToInputValue(outLeg.amountCents),
      date: utcIsoToRomeDateInputValue(outLeg.transactionDate),
      description: outLeg.description ?? '',
      categoryId: '',
      recurrenceKind: '',
    })
    setError(null)
    setModalOpen(true)
  }

  function handleRowEdit(tx: TransactionListItem) {
    if (tx.kind === 'transfer' && tx.transferId) {
      openEditTransfer(tx)
      return
    }
    openEditSimple(tx)
  }

  function handleDelete(tx: TransactionListItem) {
    if (!window.confirm('Delete this entry?')) {
      return
    }
    try {
      if (tx.kind === 'transfer' && tx.transferId) {
        deleteTransfer(db, tx.transferId)
      } else {
        deleteSimpleTransaction(db, tx.id)
      }
      bump()
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const amountCents = parseInputToCents(form.amount)
    if (amountCents === null || amountCents <= 0) {
      setError('Enter a valid amount.')
      return
    }

    try {
      if (form.kind === 'transfer') {
        if (!form.fromAccountId || !form.toAccountId) {
          setError('Select both accounts.')
          return
        }
        const payload = {
          fromAccountId: form.fromAccountId,
          toAccountId: form.toAccountId,
          amountCents,
          transferDate: form.date,
          note: form.description,
        }
        if (editingTransferId) {
          updateTransfer(db, editingTransferId, payload)
        } else {
          createTransfer(db, payload)
        }
      } else {
        if (!form.accountId) {
          setError('Select an account.')
          return
        }
        if (entryKindNeedsRecurrence(form.kind) && !form.recurrenceKind) {
          setError('Select recurrence (recurring or variable).')
          return
        }
        const payload = {
          accountId: form.accountId,
          kind: form.kind,
          amountCents,
          transactionDate: form.date,
          description: form.description,
          categoryId: form.categoryId || null,
          recurrenceKind: form.recurrenceKind || null,
        }
        if (editingTxId) {
          updateSimpleTransaction(db, editingTxId, payload)
        } else {
          createSimpleTransaction(db, payload)
        }
      }
      setModalOpen(false)
      bump()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    }
  }

  const filteredCategories = categories.filter((category) => {
    if (form.kind === 'income') {
      return category.type === 'income'
    }
    if (form.kind === 'expense' || form.kind === 'investment') {
      return category.type === 'expense'
    }
    return false
  })

  const isEditing = editingTxId !== null || editingTransferId !== null
  const addDisabled = accounts.length === 0
  const transferKindDisabled = accounts.length < 2

  function handleEntryKindChange(kind: EntryKind) {
    if (isEditing) {
      return
    }
    const firstAccount = accounts[0]?.id ?? ''
    const secondAccount =
      accounts.find((account) => account.id !== firstAccount)?.id ?? ''
    setForm({
      ...form,
      kind,
      accountId: kind === 'transfer' ? '' : form.accountId || firstAccount,
      fromAccountId: form.fromAccountId || firstAccount,
      toAccountId: kind === 'transfer' ? form.toAccountId || secondAccount : '',
      recurrenceKind: entryKindNeedsRecurrence(kind)
        ? form.recurrenceKind || 'variable'
        : '',
    })
  }

  return (
    <div className="app-page p-8">
      <header className="mb-6 shrink-0 border-b border-slate-800 pb-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-3">
          <div className="md:justify-self-start">
            <h2 className="text-2xl font-semibold text-white">Transactions</h2>
          </div>

          <div className="flex justify-center md:justify-self-center">
            <DashboardPeriodToolbar
              scope={scope}
              period={period}
              earliestYear={earliestYear}
              onPeriodChange={handlePeriodChange}
            />
          </div>

          <div className="flex justify-center md:justify-self-end">
            <DashboardScopeBar scope={scope} onScopeChange={handleScopeChange} />
          </div>
        </div>
      </header>

      {accounts.length > 0 ? (
        <label className="relative mb-4 block shrink-0">
          <span className="sr-only">Search transactions</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500"
            aria-hidden
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search description, account, category…"
            className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 py-2 pr-3 pl-10 text-sm text-white placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
            autoComplete="off"
          />
        </label>
      ) : null}

      <div className="app-page-scroll-ceiling">
        {accounts.length === 0 ? (
          <p className="text-sm text-slate-500">
            Create an account before adding transactions.
          </p>
        ) : null}

        {accounts.length > 0 && transactions.length === 0 ? (
          <p className="text-sm text-slate-500">
            {searchQuery.trim()
              ? 'No transactions match your search.'
              : 'No transactions in this period.'}
          </p>
        ) : null}

        {transactions.length > 0 ? (
          <div className="data-table-scroll-shell">
            <table className="transactions-table data-table text-sm">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead className="bg-slate-900/80 text-slate-400">
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th className="money-cell">Amount</th>
                  <th>Category</th>
                  <th>Account</th>
                  <th>Recurrence</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="text-slate-200">
                    <td>{formatCalendarDateInRome(tx.transactionDate)}</td>
                    <td className="capitalize">{kindLabel(tx.kind, tx.transferLeg)}</td>
                    <td className="money-cell">{formatCents(tx.amountCents)}</td>
                    <td className="truncate text-slate-400">
                      {tx.categoryName ?? '—'}
                    </td>
                    <td className="truncate">{tx.accountName}</td>
                    <td className="text-slate-400">
                      {recurrenceKindLabel(tx.recurrenceKind)}
                    </td>
                    <td className="truncate text-slate-400">{tx.description ?? '—'}</td>
                    <td>
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                          aria-label="Edit entry"
                          onClick={() => handleRowEdit(tx)}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-red-300"
                          aria-label="Delete entry"
                          onClick={() => handleDelete(tx)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        disabled={addDisabled}
        className="absolute right-8 bottom-8 z-10 inline-flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-900 shadow-lg shadow-black/40 hover:bg-white disabled:opacity-50"
        aria-label="Add entry"
        onClick={() => openCreate()}
      >
        <Plus className="size-6" aria-hidden />
      </button>

      <Modal
        title={addEntryModalTitle(editingTxId, editingTransferId)}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Type</span>
            <EntryKindPicker
              value={form.kind}
              onChange={handleEntryKindChange}
              disabled={isEditing}
              transferDisabled={transferKindDisabled}
            />
          </div>

          {form.kind === 'transfer' ? (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-300">From account</span>
                <select
                  required
                  value={form.fromAccountId}
                  onChange={(event) =>
                    setForm({ ...form, fromAccountId: event.target.value })
                  }
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-300">To account</span>
                <select
                  required
                  value={form.toAccountId}
                  onChange={(event) =>
                    setForm({ ...form, toAccountId: event.target.value })
                  }
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-300">Account</span>
              <select
                required
                value={form.accountId}
                onChange={(event) =>
                  setForm({ ...form, accountId: event.target.value })
                }
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Amount (EUR)</span>
            <input
              required
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Date</span>
            <input
              type="date"
              required
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>

          {entryKindNeedsRecurrence(form.kind) ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-300">Recurrence</span>
              <select
                required
                value={form.recurrenceKind}
                onChange={(event) =>
                  setForm({
                    ...form,
                    recurrenceKind: event.target.value as RecurrenceKind,
                  })
                }
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                <option value="">Select…</option>
                <option value="recurring">Recurring</option>
                <option value="variable">Variable</option>
              </select>
            </label>
          ) : null}

          {form.kind !== 'transfer' ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-300">Category (optional)</span>
              <select
                value={form.categoryId}
                onChange={(event) => {
                  const categoryId = event.target.value
                  const category = categories.find((row) => row.id === categoryId)
                  setForm((current) => ({
                    ...current,
                    categoryId,
                    recurrenceKind:
                      (category?.defaultRecurrenceKind ?? current.recurrenceKind) ||
                      'variable',
                  }))
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                <option value="">None</option>
                {filteredCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Description</span>
            <textarea
              rows={2}
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
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

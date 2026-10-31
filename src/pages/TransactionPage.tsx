import { useCallback, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Modal } from '../components/ui/Modal'
import { listAccounts } from '../db/repositories/account'
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
import type { RecurrenceKind, TransactionKind } from '../db/types'
import { useDatabase } from '../hooks/useDatabase'
import {
  formatCalendarDateInRome,
  todayRomeDateInputValue,
  utcIsoToRomeDateInputValue,
} from '../lib/datetime'
import { centsToInputValue, formatCents, parseInputToCents } from '../lib/money'

type EntryKind = 'income' | 'expense' | 'investment' | 'transfer'

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
  kind: EntryKind,
): string {
  if (editingTxId || editingTransferId) {
    return 'Edit entry'
  }
  if (kind === 'expense') {
    return 'Add expense'
  }
  if (kind === 'income') {
    return 'Add income'
  }
  if (kind === 'investment') {
    return 'Add investment'
  }
  if (kind === 'transfer') {
    return 'Add transfer'
  }
  return 'Add entry'
}

function kindLabel(
  kind: TransactionKind,
  transferLeg: TransactionListItem['transferLeg'],
): string {
  if (kind === 'transfer') {
    return transferLeg === 'out' ? 'Transfer out' : 'Transfer in'
  }
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

export function TransactionPage() {
  const db = useDatabase()
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTransferId, setEditingTransferId] = useState<string | null>(null)
  const [editingTxId, setEditingTxId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)

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
    return listTransactions(db, { limit: 200 })
  }, [db, refreshKey])

  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  function openCreate(kind: EntryKind) {
    setEditingTransferId(null)
    setEditingTxId(null)
    const firstAccount = accounts[0]?.id ?? ''
    const secondAccount =
      accounts.find((account) => account.id !== firstAccount)?.id ?? ''
    setForm({
      ...emptyForm(),
      kind,
      accountId: kind === 'transfer' ? '' : firstAccount,
      fromAccountId: firstAccount,
      toAccountId: kind === 'transfer' ? secondAccount : '',
      recurrenceKind: entryKindNeedsRecurrence(kind) ? 'variable' : '',
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

  return (
    <div className="flex flex-1 flex-col p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Transactions</h2>
          <p className="mt-1 text-sm text-slate-400">
            Income, expenses, investments, and transfers between accounts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={accounts.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white disabled:opacity-50"
            onClick={() => openCreate('expense')}
          >
            <Plus className="size-4" aria-hidden />
            Add expense
          </button>
          <button
            type="button"
            disabled={accounts.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-500 hover:bg-slate-800 disabled:opacity-50"
            onClick={() => openCreate('income')}
          >
            <Plus className="size-4" aria-hidden />
            Add income
          </button>
          <button
            type="button"
            disabled={accounts.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-500 hover:bg-slate-800 disabled:opacity-50"
            onClick={() => openCreate('investment')}
          >
            <Plus className="size-4" aria-hidden />
            Add investment
          </button>
          <button
            type="button"
            disabled={accounts.length < 2}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-500 hover:bg-slate-800 disabled:opacity-50"
            onClick={() => openCreate('transfer')}
          >
            <Plus className="size-4" aria-hidden />
            Add transfer
          </button>
        </div>
      </header>

      {accounts.length === 0 ? (
        <p className="text-sm text-slate-500">
          Create an account before adding transactions.
        </p>
      ) : null}

      {transactions.length === 0 ? (
        <p className="text-sm text-slate-500">No transactions yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Recurrence</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {transactions.map((tx) => (
                <tr key={tx.id} className="text-slate-200">
                  <td className="px-4 py-3">
                    {formatCalendarDateInRome(tx.transactionDate)}
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {kindLabel(tx.kind, tx.transferLeg)}
                  </td>
                  <td className="px-4 py-3">{tx.accountName}</td>
                  <td className="px-4 py-3">{formatCents(tx.amountCents)}</td>
                  <td className="px-4 py-3 text-slate-400">{tx.categoryName ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {recurrenceKindLabel(tx.recurrenceKind)}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-400">
                    {tx.description ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
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
      )}

      <Modal
        title={addEntryModalTitle(editingTxId, editingTransferId, form.kind)}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Type</span>
            <select
              value={form.kind}
              disabled={editingTxId !== null || editingTransferId !== null}
              onChange={(event) => {
                const kind = event.target.value as EntryKind
                setForm({
                  ...form,
                  kind,
                  recurrenceKind: entryKindNeedsRecurrence(kind)
                    ? form.recurrenceKind || 'variable'
                    : '',
                })
              }}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-50"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="investment">Investment</option>
              <option value="transfer">Transfer</option>
            </select>
          </label>

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

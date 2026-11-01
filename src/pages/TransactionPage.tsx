import { useCallback, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { DashboardPeriodToolbar } from '../components/dashboard/DashboardPeriodToolbar'
import { DashboardScopeBar } from '../components/dashboard/DashboardScopeBar'
import {
  EntryKindPicker,
  type EntryKind,
} from '../components/transactions/EntryKindPicker'
import {
  TransactionKindDisplay,
  TransactionAmountDisplay,
  transactionKindLabel,
} from '../components/transactions/TransactionKindDisplay'
import { FormSelect } from '../components/ui/FormSelect'
import { Modal, ModalActions } from '../components/ui/Modal'
import { RomeCalendarDateInput } from '../components/ui/RomeCalendarDateInput'
import { getEarliestAccountYearInRome, listAccounts } from '../db/repositories/account'
import { listCategories } from '../db/repositories/category'
import type { TransactionListItem, TransactionRecord } from '../db/repositories/model'
import {
  createSimpleTransaction,
  deleteSimpleTransaction,
  getTransactionById,
  listTransactions,
  updateSimpleTransaction,
} from '../db/repositories/transaction'
import {
  createTransfer,
  deleteTransfer,
  updateTransfer,
} from '../db/repositories/transfer'
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
import {
  computeEntryPreviewDeltas,
  originalDeltaForEditingTransaction,
  originalDeltasForEditingTransfer,
  projectBalanceAfterEntry,
} from '../lib/balance-projection'

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

type LastCreateDefaults = Pick<
  FormState,
  | 'kind'
  | 'accountId'
  | 'fromAccountId'
  | 'toAccountId'
  | 'amount'
  | 'description'
  | 'categoryId'
  | 'recurrenceKind'
>

function pickExistingAccountId(
  preferred: string,
  accountIds: Set<string>,
  fallback: string,
): string {
  if (preferred && accountIds.has(preferred)) {
    return preferred
  }
  return fallback
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

function BalancePreviewBlock({
  label,
  currentCents,
  afterCents,
}: {
  label: string
  currentCents: number | null
  afterCents: number | null
}) {
  if (currentCents === null) {
    return null
  }
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm">
      <p className="font-medium text-slate-300">{label}</p>
      <p className="mt-1 text-slate-400">
        Current balance:{' '}
        <span className="font-medium text-white tabular-nums">
          {formatCents(currentCents)}
        </span>
      </p>
      <p className="text-slate-400">
        Balance after entry:{' '}
        <span className="font-medium text-white tabular-nums">
          {afterCents === null ? '—' : formatCents(afterCents)}
        </span>
      </p>
    </div>
  )
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
  const [editingOriginalTx, setEditingOriginalTx] = useState<TransactionRecord | null>(
    null,
  )
  const [editingTransferLegs, setEditingTransferLegs] = useState<TransactionRecord[]>(
    [],
  )
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TransactionListItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const lastCreateDefaultsRef = useRef<LastCreateDefaults | null>(null)

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
    setEditingOriginalTx(null)
    setEditingTransferLegs([])
    const firstAccount = accounts[0]?.id ?? ''
    const secondAccount =
      accounts.find((account) => account.id !== firstAccount)?.id ?? ''
    const accountIds = new Set(accounts.map((account) => account.id))
    const last = lastCreateDefaultsRef.current
    if (last) {
      setForm({
        ...emptyForm(),
        kind: last.kind,
        accountId: pickExistingAccountId(last.accountId, accountIds, firstAccount),
        fromAccountId: pickExistingAccountId(
          last.fromAccountId,
          accountIds,
          firstAccount,
        ),
        toAccountId: pickExistingAccountId(last.toAccountId, accountIds, secondAccount),
        amount: last.amount,
        description: last.description,
        categoryId: last.categoryId,
        recurrenceKind: last.recurrenceKind || 'variable',
      })
    } else {
      setForm({
        ...emptyForm(),
        kind: 'expense',
        accountId: firstAccount,
        fromAccountId: firstAccount,
        toAccountId: secondAccount,
        recurrenceKind: 'variable',
      })
    }
    setError(null)
    setModalOpen(true)
  }

  function openEditSimple(tx: TransactionListItem) {
    if (tx.kind === 'transfer') {
      return
    }
    if (tx.kind === 'rebalancing') {
      window.alert(
        'Rebalancing entries cannot be edited. Delete the entry or reconcile again from Accounts.',
      )
      return
    }
    setEditingTxId(tx.id)
    setEditingTransferId(null)
    setEditingOriginalTx(getTransactionById(db, tx.id))
    setEditingTransferLegs([])
    setForm({
      kind: tx.kind as EntryKind,
      accountId: tx.accountId,
      fromAccountId: '',
      toAccountId: '',
      amount: centsToInputValue(tx.amountCents),
      date: utcIsoToRomeDateInputValue(tx.transactionDate),
      description: tx.description ?? '',
      categoryId: tx.categoryId ?? '',
      recurrenceKind: tx.recurrenceKind === 'recurring' ? 'recurring' : 'variable',
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
    setEditingOriginalTx(null)
    setEditingTransferLegs(legs)
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
    if (tx.kind === 'rebalancing') {
      window.alert(
        'Rebalancing entries cannot be edited. Delete the entry or reconcile again from Accounts.',
      )
      return
    }
    if (tx.kind === 'transfer' && tx.transferId) {
      openEditTransfer(tx)
      return
    }
    openEditSimple(tx)
  }

  function closeDeleteModal() {
    setDeleteTarget(null)
    setDeleteError(null)
  }

  function openDeleteModal(tx: TransactionListItem) {
    setDeleteError(null)
    setDeleteTarget(tx)
  }

  function confirmDeleteEntry() {
    if (!deleteTarget) {
      return
    }
    try {
      if (deleteTarget.kind === 'transfer' && deleteTarget.transferId) {
        deleteTransfer(db, deleteTarget.transferId)
      } else {
        deleteSimpleTransaction(db, deleteTarget.id)
      }
      closeDeleteModal()
      bump()
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const amountCents = parseInputToCents(form.amount)
    if (amountCents === null || amountCents <= 0) {
      setError('Enter a valid amount.')
      return
    }
    if (!form.date.trim()) {
      setError('Enter a valid date.')
      return
    }

    try {
      const creating = !editingTxId && !editingTransferId
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
        const recurrenceKind = entryKindNeedsRecurrence(form.kind)
          ? form.recurrenceKind === 'recurring'
            ? 'recurring'
            : 'variable'
          : null
        const payload = {
          accountId: form.accountId,
          kind: form.kind,
          amountCents,
          transactionDate: form.date,
          description: form.description,
          categoryId: form.categoryId || null,
          recurrenceKind,
        }
        if (editingTxId) {
          updateSimpleTransaction(db, editingTxId, payload)
        } else {
          createSimpleTransaction(db, payload)
        }
      }
      if (creating) {
        lastCreateDefaultsRef.current = {
          kind: form.kind,
          accountId: form.accountId,
          fromAccountId: form.fromAccountId,
          toAccountId: form.toAccountId,
          amount: form.amount,
          description: form.description,
          categoryId: form.categoryId,
          recurrenceKind: entryKindNeedsRecurrence(form.kind)
            ? form.recurrenceKind === 'recurring'
              ? 'recurring'
              : 'variable'
            : '',
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

  const accountSelectOptions = useMemo(
    () => [
      { value: '', label: 'Select account' },
      ...accounts.map((account) => ({ value: account.id, label: account.name })),
    ],
    [accounts],
  )

  const categorySelectOptions = useMemo(
    () => [
      { value: '', label: 'None' },
      ...filteredCategories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    ],
    [filteredCategories],
  )

  const isEditing = editingTxId !== null || editingTransferId !== null
  const addDisabled = accounts.length === 0
  const transferKindDisabled = accounts.length < 2

  const balancePreview = useMemo(() => {
    const amountCents = parseInputToCents(form.amount)
    const parsedAmount = amountCents !== null && amountCents > 0 ? amountCents : null
    const deltas = computeEntryPreviewDeltas({
      kind: form.kind,
      amountCents: parsedAmount,
      accountId: form.accountId,
      fromAccountId: form.fromAccountId,
      toAccountId: form.toAccountId,
    })

    const balanceForAccount = (accountId: string): number | null => {
      const row = accounts.find((account) => account.id === accountId)
      return row?.balanceCents ?? null
    }

    if (form.kind === 'transfer') {
      const original = originalDeltasForEditingTransfer(editingTransferLegs)
      const fromCurrent = balanceForAccount(form.fromAccountId)
      const toCurrent = balanceForAccount(form.toAccountId)
      const fromOriginal =
        editingTransferLegs.find((leg) => leg.transferLeg === 'out')?.accountId ===
        form.fromAccountId
          ? original.fromDelta
          : 0
      const toOriginal =
        editingTransferLegs.find((leg) => leg.transferLeg === 'in')?.accountId ===
        form.toAccountId
          ? original.toDelta
          : 0
      return {
        primary: null,
        from:
          fromCurrent === null
            ? null
            : {
                current: fromCurrent,
                after:
                  deltas.fromDelta === null
                    ? null
                    : projectBalanceAfterEntry(
                        fromCurrent,
                        fromOriginal,
                        deltas.fromDelta,
                      ),
              },
        to:
          toCurrent === null
            ? null
            : {
                current: toCurrent,
                after:
                  deltas.toDelta === null
                    ? null
                    : projectBalanceAfterEntry(toCurrent, toOriginal, deltas.toDelta),
              },
      }
    }

    const accountId = form.accountId
    const current = accountId ? balanceForAccount(accountId) : null
    const originalDelta =
      editingOriginalTx && editingOriginalTx.accountId === accountId
        ? originalDeltaForEditingTransaction(editingOriginalTx)
        : 0
    return {
      primary:
        current === null
          ? null
          : {
              current,
              after:
                deltas.primaryDelta === null
                  ? null
                  : projectBalanceAfterEntry(
                      current,
                      originalDelta,
                      deltas.primaryDelta,
                    ),
            },
      from: null,
      to: null,
    }
  }, [accounts, editingOriginalTx, editingTransferLegs, form])

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
        <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <label className="relative min-w-0 flex-1">
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
          <button
            type="button"
            disabled={addDisabled}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white disabled:opacity-50"
            onClick={() => openCreate()}
          >
            <Plus className="size-4" aria-hidden />
            Add
          </button>
        </div>
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
          <div className="data-table-scroll-shell min-w-0">
            <table className="transactions-table data-table text-sm">
              <colgroup>
                <col className="transactions-col-icon" />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col className="transactions-col-actions" />
              </colgroup>
              <thead className="bg-slate-900/80 text-slate-400">
                <tr>
                  <th scope="col" className="transactions-cell-icon" aria-label="Type">
                    <span className="sr-only">Type</span>
                  </th>
                  <th className="money-cell">Amount</th>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th scope="col" className="transactions-cell-actions">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="text-slate-200">
                    <td className="transactions-cell-icon">
                      <TransactionKindDisplay
                        kind={tx.kind}
                        transferLeg={tx.transferLeg}
                        rebalancingDirection={tx.rebalancingDirection}
                        showLabel={false}
                      />
                    </td>
                    <td className="money-cell">
                      <TransactionAmountDisplay
                        kind={tx.kind}
                        transferLeg={tx.transferLeg}
                        rebalancingDirection={tx.rebalancingDirection}
                        amountCents={tx.amountCents}
                      />
                    </td>
                    <td className="max-w-0 truncate text-slate-400">
                      {tx.description ?? '—'}
                    </td>
                    <td>{formatCalendarDateInRome(tx.transactionDate)}</td>
                    <td className="max-w-0 truncate">{tx.accountName}</td>
                    <td className="max-w-0 truncate text-slate-400">
                      {tx.categoryName ?? '—'}
                    </td>
                    <td className="transactions-cell-actions">
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
                          onClick={() => openDeleteModal(tx)}
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
                <FormSelect
                  value={form.fromAccountId}
                  onChange={(fromAccountId) => setForm({ ...form, fromAccountId })}
                  options={accountSelectOptions}
                  placeholder="Select account"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-300">To account</span>
                <FormSelect
                  value={form.toAccountId}
                  onChange={(toAccountId) => setForm({ ...form, toAccountId })}
                  options={accountSelectOptions}
                  placeholder="Select account"
                />
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-300">Account</span>
              <FormSelect
                value={form.accountId}
                onChange={(accountId) => setForm({ ...form, accountId })}
                options={accountSelectOptions}
                placeholder="Select account"
              />
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Amount (EUR)</span>
            <input
              required
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              className="form-field"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Description</span>
            <input
              type="text"
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
              className="form-field"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Date</span>
            <RomeCalendarDateInput
              value={form.date}
              onChange={(date) => setForm({ ...form, date })}
            />
          </label>

          {form.kind !== 'transfer' ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-300">Category (optional)</span>
              <FormSelect
                value={form.categoryId}
                onChange={(categoryId) => {
                  const category = categories.find((row) => row.id === categoryId)
                  setForm((current) => ({
                    ...current,
                    categoryId,
                    recurrenceKind:
                      category?.defaultRecurrenceKind ??
                      (current.recurrenceKind || 'variable'),
                  }))
                }}
                options={categorySelectOptions}
                placeholder="None"
              />
            </label>
          ) : null}

          {entryKindNeedsRecurrence(form.kind) ? (
            <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={form.recurrenceKind === 'recurring'}
                onChange={(event) =>
                  setForm({
                    ...form,
                    recurrenceKind: event.target.checked ? 'recurring' : 'variable',
                  })
                }
              />
              <span>Recurrent</span>
            </label>
          ) : null}

          {form.kind === 'transfer' ? (
            <>
              {balancePreview.from ? (
                <BalancePreviewBlock
                  label={
                    accounts.find((account) => account.id === form.fromAccountId)
                      ?.name ?? 'From account'
                  }
                  currentCents={balancePreview.from.current}
                  afterCents={balancePreview.from.after}
                />
              ) : null}
              {balancePreview.to ? (
                <BalancePreviewBlock
                  label={
                    accounts.find((account) => account.id === form.toAccountId)?.name ??
                    'To account'
                  }
                  currentCents={balancePreview.to.current}
                  afterCents={balancePreview.to.after}
                />
              ) : null}
            </>
          ) : balancePreview.primary ? (
            <BalancePreviewBlock
              label={
                accounts.find((account) => account.id === form.accountId)?.name ??
                'Account'
              }
              currentCents={balancePreview.primary.current}
              afterCents={balancePreview.primary.after}
            />
          ) : null}

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <ModalActions onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>

      <Modal
        title="Delete entry"
        open={deleteTarget !== null}
        onClose={closeDeleteModal}
      >
        {deleteTarget ? (
          <>
            <p className="text-sm text-slate-300">
              {deleteTarget.kind === 'transfer' && deleteTarget.transferId
                ? 'Remove this transfer? Both legs will be deleted.'
                : 'Remove this entry from your ledger? You cannot undo this.'}
            </p>
            <dl className="mt-4 space-y-2 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Type</dt>
                <dd className="text-right text-slate-200">
                  {transactionKindLabel(deleteTarget.kind, deleteTarget.transferLeg)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Amount</dt>
                <dd className="text-right text-slate-200 tabular-nums">
                  <TransactionAmountDisplay
                    kind={deleteTarget.kind}
                    transferLeg={deleteTarget.transferLeg}
                    rebalancingDirection={deleteTarget.rebalancingDirection}
                    amountCents={deleteTarget.amountCents}
                  />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Date</dt>
                <dd className="text-right text-slate-200">
                  {formatCalendarDateInRome(deleteTarget.transactionDate)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Account</dt>
                <dd className="max-w-[14rem] truncate text-right text-slate-200">
                  {deleteTarget.accountName}
                </dd>
              </div>
              {deleteTarget.description ? (
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-slate-500">Description</dt>
                  <dd className="max-w-[14rem] truncate text-right text-slate-200">
                    {deleteTarget.description}
                  </dd>
                </div>
              ) : null}
            </dl>
            {deleteError ? (
              <p className="mt-3 text-sm text-red-400" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-6">
              <ModalActions
                onCancel={closeDeleteModal}
                submitLabel="Delete"
                submitType="button"
                onSubmit={confirmDeleteEntry}
                submitClassName="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              />
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  )
}

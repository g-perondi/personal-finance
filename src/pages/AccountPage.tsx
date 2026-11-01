import { useCallback, useMemo, useState } from 'react'
import { Pencil, Plus, Scale, Star, Trash2 } from 'lucide-react'
import { Modal, ModalActions } from '../components/ui/Modal'
import { FormError } from '../components/ui/FormError'
import { RomeCalendarDateInput } from '../components/ui/RomeCalendarDateInput'
import {
  countAccountTransactions,
  createAccount,
  deleteAccount,
  listAccounts,
  rebalanceAccount,
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
import { focusFormField, formFieldClass } from '../lib/form-validation'

const ACCOUNT_FIELD = {
  name: 'account-name',
  openingBalance: 'account-opening-balance',
  openingDate: 'account-opening-date',
  reconcileBalance: 'account-reconcile-balance',
} as const

const DELETE_ACCOUNT_CONFIRM_PHRASE = 'delete account'

type AccountFormState = {
  name: string
  openingBalance: string
  openingDate: string
  note: string
  isPrimary: boolean
}

const emptyForm = (): AccountFormState => ({
  name: '',
  openingBalance: '0.00',
  openingDate: todayRomeDateInputValue(),
  note: '',
  isPrimary: false,
})

export function AccountPage() {
  const db = useDatabase()
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AccountWithBalance | null>(null)
  const [form, setForm] = useState<AccountFormState>(() => emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [invalidFieldId, setInvalidFieldId] = useState<string | null>(null)
  const [txCount, setTxCount] = useState(0)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [reconcileAccount, setReconcileAccount] = useState<AccountWithBalance | null>(
    null,
  )
  const [reconcileNewBalance, setReconcileNewBalance] = useState('')
  const [reconcileDate, setReconcileDate] = useState(() => todayRomeDateInputValue())
  const [reconcileNote, setReconcileNote] = useState('')
  const [reconcileError, setReconcileError] = useState<string | null>(null)
  const [reconcileInvalidFieldId, setReconcileInvalidFieldId] = useState<string | null>(
    null,
  )

  const [deleteTarget, setDeleteTarget] = useState<AccountWithBalance | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
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
    setInvalidFieldId(null)
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
      isPrimary: account.isPrimary,
    })
    setFormError(null)
    setInvalidFieldId(null)
    setTxCount(countAccountTransactions(db, account.id))
    setModalOpen(true)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const openingCents = parseInputToCents(form.openingBalance)
    if (!form.name.trim()) {
      setFormError('Name is required.')
      setInvalidFieldId(ACCOUNT_FIELD.name)
      focusFormField(ACCOUNT_FIELD.name)
      return
    }
    if (openingCents === null) {
      setFormError('Enter a valid opening balance.')
      setInvalidFieldId(ACCOUNT_FIELD.openingBalance)
      focusFormField(ACCOUNT_FIELD.openingBalance)
      return
    }
    if (txCount === 0 && !form.openingDate.trim()) {
      setFormError('Opening date is required.')
      setInvalidFieldId(ACCOUNT_FIELD.openingDate)
      focusFormField(ACCOUNT_FIELD.openingDate)
      return
    }
    setInvalidFieldId(null)
    try {
      if (editing) {
        updateAccount(db, editing.id, {
          name: form.name,
          note: form.note,
          openingBalanceCents: txCount === 0 ? openingCents : undefined,
          openingDate: txCount === 0 ? form.openingDate : undefined,
          isPrimary: form.isPrimary,
        })
      } else {
        createAccount(db, {
          name: form.name,
          openingBalanceCents: openingCents,
          note: form.note,
          openingDate: form.openingDate,
          isPrimary: form.isPrimary,
        })
      }
      setModalOpen(false)
      bump()
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : 'Save failed.')
    }
  }

  function openReconcile(account: AccountWithBalance) {
    setReconcileAccount(account)
    setReconcileNewBalance(centsToInputValue(account.balanceCents))
    setReconcileDate(todayRomeDateInputValue())
    setReconcileNote('')
    setReconcileError(null)
    setReconcileInvalidFieldId(null)
    setReconcileOpen(true)
  }

  function handleReconcileSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!reconcileAccount) {
      return
    }
    const targetCents = parseInputToCents(reconcileNewBalance)
    if (targetCents === null) {
      setReconcileError('Enter a valid balance.')
      setReconcileInvalidFieldId(ACCOUNT_FIELD.reconcileBalance)
      focusFormField(ACCOUNT_FIELD.reconcileBalance)
      return
    }
    setReconcileInvalidFieldId(null)
    try {
      rebalanceAccount(db, {
        accountId: reconcileAccount.id,
        targetBalanceCents: targetCents,
        transactionDate: reconcileDate,
        description: reconcileNote.trim() || null,
      })
      setReconcileOpen(false)
      setReconcileAccount(null)
      bump()
    } catch (error: unknown) {
      setReconcileError(error instanceof Error ? error.message : 'Reconcile failed.')
    }
  }

  const reconcileAdjustmentCents = useMemo(() => {
    if (!reconcileAccount) {
      return null
    }
    const target = parseInputToCents(reconcileNewBalance)
    if (target === null) {
      return null
    }
    return target - reconcileAccount.balanceCents
  }, [reconcileAccount, reconcileNewBalance])

  const openingLocked = editing !== null && txCount > 0

  function closeDeleteModal() {
    setDeleteTarget(null)
    setDeleteError(null)
    setDeleteConfirmText('')
  }

  function openDeleteModal(account: AccountWithBalance) {
    setDeleteError(null)
    setDeleteConfirmText('')
    setDeleteTarget(account)
  }

  function confirmDeleteAccount() {
    if (!deleteTarget || deleteConfirmText !== DELETE_ACCOUNT_CONFIRM_PHRASE) {
      return
    }
    try {
      deleteAccount(db, deleteTarget.id)
      closeDeleteModal()
      bump()
    } catch (error: unknown) {
      setDeleteError(error instanceof Error ? error.message : 'Delete failed.')
    }
  }

  return (
    <div className="app-page p-8">
      <header className="mb-6 shrink-0 border-b border-slate-800 pb-4">
        <h2 className="text-2xl font-semibold text-white">Accounts</h2>
      </header>

      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white"
          onClick={openCreate}
        >
          <Plus className="size-4" aria-hidden />
          Add account
        </button>
      </div>

      <div className="app-page-scroll-ceiling">
        {accounts.length === 0 ? (
          <p className="text-sm text-slate-500">
            No accounts yet. Add your first account.
          </p>
        ) : (
          <div className="data-table-scroll-shell">
            <table className="accounts-table data-table text-sm">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead className="data-table-head">
                <tr>
                  <th>Name</th>
                  <th className="money-cell">Balance</th>
                  <th className="money-cell">Average balance ({calendarYear})</th>
                  <th className="money-cell">Investments</th>
                  <th>Note</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {accounts.map((account) => (
                  <tr key={account.id} className="text-slate-200">
                    <td className="max-w-0 font-medium text-white">
                      <div className="flex min-w-0 items-center justify-center gap-1.5">
                        {account.isPrimary ? (
                          <Star
                            className="size-3.5 shrink-0 fill-amber-400/90 text-amber-400/90"
                            aria-label="Default account"
                            title="Default account"
                          />
                        ) : null}
                        <span className="min-w-0 truncate">{account.name}</span>
                      </div>
                    </td>
                    <td className="money-cell">{formatCents(account.balanceCents)}</td>
                    <td className="money-cell">
                      {formatCents(account.averageDailyBalanceYtdCents ?? 0)}
                    </td>
                    <td className="money-cell">
                      {account.holdingsMarketValueCents === null
                        ? '—'
                        : formatCents(account.holdingsMarketValueCents ?? 0)}
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
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-emerald-300"
                          aria-label={`Reconcile balance for ${account.name}`}
                          title="Reconcile balance"
                          onClick={() => openReconcile(account)}
                        >
                          <Scale className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-red-300"
                          aria-label={`Delete ${account.name}`}
                          onClick={() => openDeleteModal(account)}
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
      </div>

      <Modal
        title={editing ? 'Edit account' : 'Add account'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Name</span>
            <input
              id={ACCOUNT_FIELD.name}
              value={form.name}
              onChange={(event) => {
                setForm({ ...form, name: event.target.value })
                if (invalidFieldId === ACCOUNT_FIELD.name) {
                  setInvalidFieldId(null)
                  setFormError(null)
                }
              }}
              className={formFieldClass(
                'form-field',
                ACCOUNT_FIELD.name,
                invalidFieldId,
              )}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Opening balance (EUR)</span>
            <input
              id={ACCOUNT_FIELD.openingBalance}
              value={form.openingBalance}
              disabled={openingLocked}
              onChange={(event) => {
                setForm({ ...form, openingBalance: event.target.value })
                if (invalidFieldId === ACCOUNT_FIELD.openingBalance) {
                  setInvalidFieldId(null)
                  setFormError(null)
                }
              }}
              className={formFieldClass(
                'form-field disabled:opacity-50',
                ACCOUNT_FIELD.openingBalance,
                invalidFieldId,
              )}
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
              id={ACCOUNT_FIELD.openingDate}
              type="date"
              value={form.openingDate}
              disabled={openingLocked}
              onChange={(event) => {
                setForm({ ...form, openingDate: event.target.value })
                if (invalidFieldId === ACCOUNT_FIELD.openingDate) {
                  setInvalidFieldId(null)
                  setFormError(null)
                }
              }}
              className={formFieldClass(
                'form-field disabled:opacity-50',
                ACCOUNT_FIELD.openingDate,
                invalidFieldId,
              )}
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
          <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-300">
            <input
              type="checkbox"
              className="form-checkbox"
              checked={form.isPrimary}
              onChange={(event) =>
                setForm({ ...form, isPrimary: event.target.checked })
              }
            />
            <span>Set as main account</span>
          </label>
          <FormError message={formError} />
          <ModalActions onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>

      <Modal
        title="Reconcile balance"
        open={reconcileOpen}
        onClose={() => setReconcileOpen(false)}
      >
        {reconcileAccount ? (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={handleReconcileSubmit}
          >
            <p className="text-sm text-slate-300">
              Set the real balance for{' '}
              <span className="font-medium text-white">{reconcileAccount.name}</span>. A
              rebalancing entry will be created for the difference.
            </p>
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm">
              <span className="text-slate-400">Current balance: </span>
              <span className="font-medium text-white tabular-nums">
                {formatCents(reconcileAccount.balanceCents)}
              </span>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-300">New balance (EUR)</span>
              <input
                id={ACCOUNT_FIELD.reconcileBalance}
                value={reconcileNewBalance}
                onChange={(event) => {
                  setReconcileNewBalance(event.target.value)
                  if (reconcileInvalidFieldId === ACCOUNT_FIELD.reconcileBalance) {
                    setReconcileInvalidFieldId(null)
                    setReconcileError(null)
                  }
                }}
                className={formFieldClass(
                  'form-field',
                  ACCOUNT_FIELD.reconcileBalance,
                  reconcileInvalidFieldId,
                )}
              />
            </label>
            {reconcileAdjustmentCents !== null && reconcileAdjustmentCents !== 0 ? (
              <p className="text-sm text-slate-400">
                Adjustment:{' '}
                <span
                  className={
                    reconcileAdjustmentCents >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }
                >
                  {reconcileAdjustmentCents >= 0 ? '+' : ''}
                  {formatCents(reconcileAdjustmentCents)}
                </span>
              </p>
            ) : null}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-300">As of date</span>
              <RomeCalendarDateInput
                value={reconcileDate}
                onChange={setReconcileDate}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-300">Note (optional)</span>
              <textarea
                rows={2}
                value={reconcileNote}
                onChange={(event) => setReconcileNote(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <FormError message={reconcileError} />
            <ModalActions
              onCancel={() => setReconcileOpen(false)}
              submitLabel="Reconcile"
            />
          </form>
        ) : null}
      </Modal>

      <Modal
        title="Delete account"
        open={deleteTarget !== null}
        onClose={closeDeleteModal}
      >
        {deleteTarget ? (
          <>
            <p className="text-sm text-slate-300">
              Remove this account permanently? All transactions and investments on this
              account will be deleted. Transfers to or from other accounts will stay on
              those accounts; the removed account will appear as{' '}
              <span className="text-slate-200">Name (deleted)</span> on transfer rows.
            </p>
            <dl className="mt-4 space-y-2 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Name</dt>
                <dd className="max-w-56 truncate text-right font-medium text-white">
                  {deleteTarget.name}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Balance</dt>
                <dd className="text-right text-slate-200 tabular-nums">
                  {formatCents(deleteTarget.balanceCents)}
                </dd>
              </div>
            </dl>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm text-slate-400">
                Type{' '}
                <span className="font-mono text-slate-200">
                  {DELETE_ACCOUNT_CONFIRM_PHRASE}
                </span>{' '}
                to confirm
              </span>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-slate-500 focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <FormError message={deleteError} className="mt-3" />
            <div className="mt-6">
              <ModalActions
                onCancel={closeDeleteModal}
                submitLabel="Delete"
                submitType="button"
                submitDisabled={deleteConfirmText !== DELETE_ACCOUNT_CONFIRM_PHRASE}
                onSubmit={confirmDeleteAccount}
                submitClassName="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              />
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Modal } from '../components/ui/Modal'
import { RomeCalendarDateInput } from '../components/ui/RomeCalendarDateInput'
import { listAccounts } from '../db/repositories/account'
import {
  createOpeningHolding,
  deleteHolding,
  listRecentHoldingPurchases,
  recordHoldingPurchase,
} from '../db/repositories/holding'
import { useDatabase } from '../hooks/useDatabase'
import { usePortfolioQuotes } from '../hooks/usePortfolioQuotes'
import {
  formatDateTimeInRome,
  formatItalianCalendarDateInRome,
  todayRomeDateInputValue,
} from '../lib/datetime'
import { resolveInstrument } from '../lib/market-quotes'
import type { ResolvedInstrument } from '../lib/market-quotes/types'
import { formatCents, parseInputToCents } from '../lib/money'

const DELETE_HOLDING_CONFIRM_PHRASE = 'delete position'

function pillClass(active: boolean): string {
  return `rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
    active
      ? 'bg-slate-100 text-slate-900 shadow-sm'
      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
  }`
}

function parseQuantity(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (!normalized) {
    return null
  }
  const value = Number.parseFloat(normalized)
  if (!Number.isFinite(value) || value <= 0) {
    return null
  }
  return value
}

function formatQuantity(qty: number): string {
  return qty.toLocaleString('en-IE', { maximumFractionDigits: 6 })
}

function formatPriceEur(price: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(price)
}

/** Unrealized move vs cost basis, e.g. +3% or -21%. */
function formatUnrealizedPercent(
  plCents: number,
  costBasisCents: number,
): string | null {
  if (costBasisCents <= 0) {
    return null
  }
  const pct = Math.round((plCents / costBasisCents) * 100)
  return `${pct >= 0 ? '+' : ''}${pct}%`
}

function plToneClass(plCents: number | null): string {
  if (plCents === null) {
    return 'text-slate-400'
  }
  return plCents >= 0 ? 'text-emerald-400' : 'text-red-400'
}

type OpeningForm = {
  query: string
  accountId: string
  openingDate: string
  quantity: string
  avgCostPerUnit: string
  recordAsTransaction: boolean
}

type PurchaseForm = {
  holdingId: string
  accountId: string
  instrumentLabel: string
  quoteSymbol: string
  isin: string | null
  name: string
  purchaseDate: string
  amount: string
  navPerUnit: string
}

const emptyOpeningForm = (accountId: string): OpeningForm => ({
  query: '',
  accountId,
  openingDate: todayRomeDateInputValue(),
  quantity: '',
  avgCostPerUnit: '',
  recordAsTransaction: true,
})

export function InvestmentPage() {
  const db = useDatabase()
  const accounts = useMemo(() => listAccounts(db), [db])
  const defaultAccountId = accounts[0]?.id ?? ''
  const [accountFilter, setAccountFilter] = useState<string>('all')

  const {
    holdings,
    priceEurByInstrumentId,
    totals,
    loading,
    stale,
    fetchedAt,
    errors,
    dataRevision,
    refreshQuotes,
    reloadHoldings,
  } = usePortfolioQuotes(accountFilter === 'all' ? undefined : accountFilter)

  const refreshQuotesRef = useRef(refreshQuotes)
  refreshQuotesRef.current = refreshQuotes
  useEffect(() => {
    void refreshQuotesRef.current()
  }, [])

  void dataRevision
  const recentPurchases = listRecentHoldingPurchases(db, 15)

  const [openingOpen, setOpeningOpen] = useState(false)
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [openingForm, setOpeningForm] = useState<OpeningForm>(() =>
    emptyOpeningForm(defaultAccountId),
  )
  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm | null>(null)
  const [resolved, setResolved] = useState<ResolvedInstrument | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const unrealizedCents =
    totals.marketValueCents === null
      ? null
      : totals.marketValueCents - totals.costBasisCents

  const unrealizedPercentLabel =
    unrealizedCents !== null
      ? formatUnrealizedPercent(unrealizedCents, totals.costBasisCents)
      : null

  async function handleLookup(query: string) {
    setFormError(null)
    setResolved(null)
    if (!query.trim()) {
      return
    }
    setLookupLoading(true)
    try {
      const result = await resolveInstrument(query)
      setResolved(result)
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : 'Lookup failed.')
    } finally {
      setLookupLoading(false)
    }
  }

  function openOpeningModal() {
    setOpeningForm(emptyOpeningForm(defaultAccountId))
    setResolved(null)
    setFormError(null)
    setOpeningOpen(true)
  }

  function openPurchaseModal(holding?: (typeof holdings)[number]) {
    if (holding) {
      setPurchaseForm({
        holdingId: holding.id,
        accountId: holding.accountId,
        instrumentLabel: holding.instrumentName,
        quoteSymbol: holding.quoteSymbol,
        isin: holding.instrumentIsin,
        name: holding.instrumentName,
        purchaseDate: todayRomeDateInputValue(),
        amount: '',
        navPerUnit: '',
      })
    } else if (holdings.length === 1) {
      openPurchaseModal(holdings[0])
      return
    } else {
      setFormError(null)
      setPurchaseOpen(true)
      return
    }
    setFormError(null)
    setPurchaseOpen(true)
  }

  function handleSaveOpening() {
    setFormError(null)
    if (!resolved) {
      setFormError('Look up an ETF by ISIN or ticker first.')
      return
    }
    const quantity = parseQuantity(openingForm.quantity)
    const priceCentsPerUnit = parseInputToCents(openingForm.avgCostPerUnit)
    if (!openingForm.accountId) {
      setFormError('Select an account.')
      return
    }
    if (quantity === null) {
      setFormError('Enter a valid quantity.')
      return
    }
    if (priceCentsPerUnit === null || priceCentsPerUnit <= 0) {
      setFormError('Enter a valid average cost per unit.')
      return
    }
    const costBasisPreview = Math.round(quantity * priceCentsPerUnit)
    if (costBasisPreview <= 0) {
      setFormError('Quantity and price produce zero cost basis.')
      return
    }
    try {
      createOpeningHolding(db, {
        accountId: openingForm.accountId,
        instrument: {
          isin: resolved.isin,
          quoteSymbol: resolved.quoteSymbol,
          name: resolved.name,
        },
        openingDate: openingForm.openingDate,
        quantity,
        priceCentsPerUnit,
        recordInvestmentTransaction: openingForm.recordAsTransaction,
      })
      setOpeningOpen(false)
      reloadHoldings()
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : 'Could not save opening position.',
      )
    }
  }

  function handleSavePurchase() {
    if (!purchaseForm) {
      return
    }
    setFormError(null)
    const amountCents = parseInputToCents(purchaseForm.amount)
    const priceCentsPerUnit = parseInputToCents(purchaseForm.navPerUnit)
    if (amountCents === null || amountCents <= 0) {
      setFormError('Enter a valid amount invested.')
      return
    }
    if (priceCentsPerUnit === null || priceCentsPerUnit <= 0) {
      setFormError('Enter a valid NAV per unit.')
      return
    }
    const previewQty = amountCents / priceCentsPerUnit
    if (previewQty <= 0) {
      setFormError('Amount and NAV produce zero units.')
      return
    }
    try {
      recordHoldingPurchase(db, {
        accountId: purchaseForm.accountId,
        instrument: {
          isin: purchaseForm.isin,
          quoteSymbol: purchaseForm.quoteSymbol,
          name: purchaseForm.name,
        },
        purchaseDate: purchaseForm.purchaseDate,
        amountCents,
        priceCentsPerUnit,
      })
      setPurchaseOpen(false)
      setPurchaseForm(null)
      reloadHoldings()
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : 'Could not record purchase.',
      )
    }
  }

  function closeDeleteHoldingModal() {
    setDeleteTargetId(null)
    setDeleteConfirmText('')
  }

  function confirmDeleteHolding() {
    if (!deleteTargetId || deleteConfirmText !== DELETE_HOLDING_CONFIRM_PHRASE) {
      return
    }
    try {
      deleteHolding(db, deleteTargetId)
      closeDeleteHoldingModal()
      reloadHoldings()
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : 'Could not delete holding.')
      closeDeleteHoldingModal()
    }
  }

  return (
    <div className="app-page p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Investments</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
            onClick={() => void refreshQuotes()}
            disabled={loading || holdings.length === 0}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            Refresh quotes
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            onClick={openOpeningModal}
          >
            <Plus className="size-4" aria-hidden />
            Add ETF
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-white"
            onClick={() => openPurchaseModal()}
            disabled={holdings.length === 0}
          >
            Record purchase
          </button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={pillClass(accountFilter === 'all')}
          onClick={() => setAccountFilter('all')}
        >
          All accounts
        </button>
        {accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            className={pillClass(accountFilter === account.id)}
            onClick={() => setAccountFilter(account.id)}
          >
            {account.name}
          </button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Market value
          </p>
          <p className="mt-1 text-xl font-semibold text-white">
            {totals.marketValueCents === null
              ? '—'
              : formatCents(totals.marketValueCents)}
          </p>
          {stale ? (
            <p className="mt-1 text-xs text-amber-400">Stale or partial quotes</p>
          ) : null}
          {fetchedAt ? (
            <p className="mt-1 text-xs text-slate-500">
              Last updated {formatDateTimeInRome(fetchedAt)}
            </p>
          ) : null}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Cost basis
          </p>
          <p className="mt-1 text-xl font-semibold text-white">
            {formatCents(totals.costBasisCents)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Unrealized P/L
          </p>
          <p className={`mt-1 text-xl font-semibold ${plToneClass(unrealizedCents)}`}>
            {unrealizedCents === null ? '—' : formatCents(unrealizedCents)}
          </p>
          {unrealizedPercentLabel ? (
            <p className={`mt-1 text-sm font-medium ${plToneClass(unrealizedCents)}`}>
              {unrealizedPercentLabel}
            </p>
          ) : null}
        </div>
      </div>

      {errors.length > 0 ? (
        <ul className="mb-4 list-inside list-disc text-sm text-amber-400">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}

      <div className="app-page-scroll-ceiling">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-950 text-xs text-slate-400 uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Instrument</th>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 text-right font-medium">Quantity</th>
              <th className="px-3 py-2 text-right font-medium">Avg cost</th>
              <th className="px-3 py-2 text-right font-medium">Last price</th>
              <th className="px-3 py-2 text-right font-medium">Market value</th>
              <th className="px-3 py-2 text-right font-medium">P/L</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {holdings.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  No ETF holdings yet. Add an opening position to get started.
                </td>
              </tr>
            ) : (
              holdings.map((holding) => {
                const avgCostEur = holding.totalCostCents / holding.quantity / 100
                const lastPrice = priceEurByInstrumentId.get(holding.instrumentId)
                const mvCents =
                  lastPrice === undefined
                    ? null
                    : Math.round(holding.quantity * lastPrice * 100)
                const plCents =
                  mvCents === null ? null : mvCents - holding.totalCostCents
                const plPercentLabel =
                  plCents === null
                    ? null
                    : formatUnrealizedPercent(plCents, holding.totalCostCents)
                return (
                  <tr key={holding.id} className="hover:bg-slate-900/50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-white">
                        {holding.instrumentName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {holding.quoteSymbol}
                        {holding.instrumentIsin ? ` · ${holding.instrumentIsin}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2">{holding.accountName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatQuantity(holding.quantity)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPriceEur(avgCostEur)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {lastPrice === undefined ? '—' : formatPriceEur(lastPrice)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {mvCents === null ? '—' : formatCents(mvCents)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${plToneClass(plCents)}`}
                    >
                      {plCents === null ? (
                        '—'
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{formatCents(plCents)}</span>
                          {plPercentLabel ? (
                            <span className="text-xs font-medium">
                              {plPercentLabel}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                          title="Record purchase"
                          onClick={() => openPurchaseModal(holding)}
                        >
                          <Plus className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-red-400"
                          title="Remove holding"
                          onClick={() => setDeleteTargetId(holding.id)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <section className="mt-10">
        <h3 className="mb-3 text-lg font-semibold text-white">Recent purchases</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-900/80 text-xs text-slate-400 uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Instrument</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-right font-medium">NAV</th>
                <th className="px-3 py-2 text-right font-medium">Units</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {recentPurchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    No purchases recorded yet.
                  </td>
                </tr>
              ) : (
                recentPurchases.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">
                      {formatItalianCalendarDateInRome(row.purchaseDate)}
                    </td>
                    <td className="px-3 py-2">{row.instrumentName}</td>
                    <td className="px-3 py-2">{row.accountName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCents(row.amountCents)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPriceEur(row.priceCentsPerUnit / 100)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatQuantity(row.quantity)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        title="Add opening position"
        open={openingOpen}
        onClose={() => setOpeningOpen(false)}
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">ISIN or ticker</span>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                value={openingForm.query}
                onChange={(event) =>
                  setOpeningForm((prev) => ({ ...prev, query: event.target.value }))
                }
              />
              <button
                type="button"
                className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
                onClick={() => void handleLookup(openingForm.query)}
                disabled={lookupLoading}
              >
                {lookupLoading ? '…' : 'Look up'}
              </button>
            </div>
          </label>
          {resolved ? (
            <p className="text-sm text-emerald-400">
              {resolved.name} ({resolved.quoteSymbol})
            </p>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">Account</span>
            <select
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              value={openingForm.accountId}
              onChange={(event) =>
                setOpeningForm((prev) => ({ ...prev, accountId: event.target.value }))
              }
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">Position opened</span>
            <RomeCalendarDateInput
              value={openingForm.openingDate}
              onChange={(value) =>
                setOpeningForm((prev) => ({ ...prev, openingDate: value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">Quantity (units)</span>
            <input
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              inputMode="decimal"
              value={openingForm.quantity}
              onChange={(event) =>
                setOpeningForm((prev) => ({ ...prev, quantity: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">Average cost per unit (EUR)</span>
            <input
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              inputMode="decimal"
              value={openingForm.avgCostPerUnit}
              onChange={(event) =>
                setOpeningForm((prev) => ({
                  ...prev,
                  avgCostPerUnit: event.target.value,
                }))
              }
            />
          </label>
          {(() => {
            const quantity = parseQuantity(openingForm.quantity)
            const priceCents = parseInputToCents(openingForm.avgCostPerUnit)
            if (quantity !== null && priceCents !== null && priceCents > 0) {
              const basis = Math.round(quantity * priceCents)
              return (
                <p className="text-sm text-slate-500">
                  Cost basis: {formatCents(basis)} · {formatQuantity(quantity)} units
                </p>
              )
            }
            return null
          })()}
          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-300">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded border-slate-600 bg-slate-900"
              checked={openingForm.recordAsTransaction}
              onChange={(event) =>
                setOpeningForm((prev) => ({
                  ...prev,
                  recordAsTransaction: event.target.checked,
                }))
              }
            />
            <span>
              Record as investment transaction
              <span className="mt-0.5 block text-xs text-slate-500">
                Reduces account balance and appears in cashflow for the cost basis
                amount on the opening date.
              </span>
            </span>
          </label>
          {formError ? <p className="text-sm text-red-400">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white"
              onClick={() => setOpeningOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              onClick={handleSaveOpening}
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        title="Record purchase"
        open={purchaseOpen}
        onClose={() => {
          setPurchaseOpen(false)
          setPurchaseForm(null)
        }}
      >
        {purchaseForm ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-300">
              {purchaseForm.instrumentLabel}{' '}
              <span className="text-slate-500">({purchaseForm.quoteSymbol})</span>
            </p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-400">Purchase date</span>
              <RomeCalendarDateInput
                value={purchaseForm.purchaseDate}
                onChange={(value) =>
                  setPurchaseForm((prev) =>
                    prev ? { ...prev, purchaseDate: value } : prev,
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-400">Amount invested (EUR)</span>
              <input
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                inputMode="decimal"
                value={purchaseForm.amount}
                onChange={(event) =>
                  setPurchaseForm((prev) =>
                    prev ? { ...prev, amount: event.target.value } : prev,
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-400">NAV per unit (EUR)</span>
              <input
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                inputMode="decimal"
                value={purchaseForm.navPerUnit}
                onChange={(event) =>
                  setPurchaseForm((prev) =>
                    prev ? { ...prev, navPerUnit: event.target.value } : prev,
                  )
                }
              />
            </label>
            {(() => {
              const amountCents = parseInputToCents(purchaseForm.amount)
              const navCents = parseInputToCents(purchaseForm.navPerUnit)
              if (amountCents && navCents && navCents > 0) {
                return (
                  <p className="text-sm text-slate-400">
                    Units: {formatQuantity(amountCents / navCents)}
                  </p>
                )
              }
              return null
            })()}
            {formError ? <p className="text-sm text-red-400">{formError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white"
                onClick={() => {
                  setPurchaseOpen(false)
                  setPurchaseForm(null)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                onClick={handleSavePurchase}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-400">Choose a holding:</p>
            {holdings.map((holding) => (
              <button
                key={holding.id}
                type="button"
                className="rounded-lg border border-slate-700 px-3 py-2 text-left text-sm text-white hover:bg-slate-800"
                onClick={() => openPurchaseModal(holding)}
              >
                {holding.instrumentName} · {holding.accountName}
              </button>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        title="Remove holding"
        open={deleteTargetId !== null}
        onClose={closeDeleteHoldingModal}
      >
        <p className="text-sm text-slate-300">
          Remove this ETF position from the portfolio? Linked purchase history will be
          deleted. Cash transactions are not removed automatically.
        </p>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm text-slate-400">
            Type{' '}
            <span className="font-mono text-slate-200">
              {DELETE_HOLDING_CONFIRM_PHRASE}
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
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white"
            onClick={closeDeleteHoldingModal}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            disabled={deleteConfirmText !== DELETE_HOLDING_CONFIRM_PHRASE}
            onClick={confirmDeleteHolding}
          >
            Remove
          </button>
        </div>
      </Modal>
    </div>
  )
}

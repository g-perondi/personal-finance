import { useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { FormSelect } from '../components/ui/FormSelect'
import { Modal, ModalActions, ModalCancelOnly } from '../components/ui/Modal'
import { FormError } from '../components/ui/FormError'
import { OverflowTooltip } from '../components/ui/OverflowTooltip'
import { RomeCalendarDateInput } from '../components/ui/RomeCalendarDateInput'
import { listAccounts } from '../db/repositories/account'
import {
  computePortfolioTotals,
  createOpeningHolding,
  deleteHolding,
  deleteHoldingPurchase,
  listRecentHoldingPurchases,
  recordHoldingPurchase,
  updateHoldingPurchase,
} from '../db/repositories/holding'
import { useDatabase } from '../hooks/useDatabase'
import { usePortfolioQuotes } from '../hooks/usePortfolioQuotes'
import {
  formatDateTimeInRome,
  formatItalianCalendarDateInRome,
  todayRomeDateInputValue,
  utcIsoToRomeDateInputValue,
} from '../lib/datetime'
import type { InstrumentAssetKind } from '../db/repositories/model'
import {
  fetchQuotesForInstruments,
  parseIsinFromQuery,
  searchInstrumentListings,
} from '../lib/market-quotes'
import type { ResolvedInstrument } from '../lib/market-quotes/types'
import {
  formatCents,
  formatUnitPriceEur,
  centsToInputValue,
  parseInputToCents,
  parseInputToUnitPriceCents,
  unitPriceEurToInputValue,
} from '../lib/money'
import { APP_SCROLLBAR_CLASS } from '../lib/scroll-ui'

const DELETE_HOLDING_CONFIRM_PHRASE = 'delete position'

const ASSET_TABS: { id: InstrumentAssetKind; label: string }[] = [
  { id: 'etf', label: 'ETF' },
  { id: 'equity', label: 'Stocks' },
  { id: 'crypto', label: 'Crypto' },
]

function lookupFieldLabel(assetKind: InstrumentAssetKind): string {
  if (assetKind === 'crypto') {
    return 'Name or symbol'
  }
  return 'ISIN or ticker'
}

function addPositionButtonLabel(assetKind: InstrumentAssetKind): string {
  if (assetKind === 'etf') {
    return 'Add ETF'
  }
  if (assetKind === 'equity') {
    return 'Add stock'
  }
  return 'Add crypto'
}

function emptyHoldingsMessage(assetKind: InstrumentAssetKind): string {
  if (assetKind === 'etf') {
    return 'No ETF holdings yet. Add an opening position to get started.'
  }
  if (assetKind === 'equity') {
    return 'No stock holdings yet. Add an opening position to get started.'
  }
  return 'No crypto holdings yet. Add an opening position to get started.'
}

function resolveListingIsin(
  listing: ResolvedInstrument,
  lookupQuery: string,
): string | null {
  return listing.isin ?? parseIsinFromQuery(lookupQuery)
}

function formatListingLastPrice(
  quoteSymbol: string,
  quoteBySymbol: Map<string, number>,
  quotesLoading: boolean,
): string {
  if (quotesLoading && !quoteBySymbol.has(quoteSymbol)) {
    return '…'
  }
  const price = quoteBySymbol.get(quoteSymbol)
  return price === undefined ? '—' : formatPriceEur(price)
}

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

function formatInstrumentMetaLine(holding: {
  quoteSymbol: string
  instrumentIsin: string | null
}): string {
  return holding.instrumentIsin
    ? `${holding.quoteSymbol} · ${holding.instrumentIsin}`
    : holding.quoteSymbol
}

function formatPriceEur(price: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(price)
}

/** Unrealized move vs cost basis, e.g. +3.25% or -21.40%. */
function formatUnrealizedPercent(
  plCents: number,
  costBasisCents: number,
): string | null {
  if (costBasisCents <= 0) {
    return null
  }
  const pct = (plCents / costBasisCents) * 100
  const formatted = pct.toLocaleString('en-IE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${pct >= 0 ? '+' : ''}${formatted}%`
}

function plToneClass(plCents: number | null): string {
  if (plCents === null) {
    return 'text-slate-400'
  }
  return plCents >= 0 ? 'text-emerald-400' : 'text-red-400'
}

function InstrumentListingFacts({
  listing,
  lookupQuery,
  quoteBySymbol,
  quotesLoading,
}: {
  listing: ResolvedInstrument
  lookupQuery: string
  quoteBySymbol: Map<string, number>
  quotesLoading: boolean
}) {
  const isin = resolveListingIsin(listing, lookupQuery)
  return (
    <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm">
      {isin ? (
        <>
          <dt className="text-slate-500">ISIN</dt>
          <dd className="text-slate-200">{isin}</dd>
        </>
      ) : null}
      <dt className="text-slate-500">Ticker</dt>
      <dd className="font-mono text-slate-200">{listing.quoteSymbol}</dd>
      {listing.exchange ? (
        <>
          <dt className="text-slate-500">Exchange</dt>
          <dd className="text-slate-200">{listing.exchange}</dd>
        </>
      ) : null}
      <dt className="text-slate-500">Last price</dt>
      <dd className="text-slate-200 tabular-nums">
        {formatListingLastPrice(listing.quoteSymbol, quoteBySymbol, quotesLoading)}
      </dd>
    </dl>
  )
}

type OpeningForm = {
  query: string
  accountId: string
  openingDate: string
  quantity: string
  avgCostPerUnit: string
  /** When true, posts an investment transaction on the account (cashflow). */
  recordInvestmentTransaction: boolean
}

type PurchaseForm = {
  purchaseId?: string
  holdingId: string
  accountId: string
  instrumentLabel: string
  quoteSymbol: string
  isin: string | null
  name: string
  assetKind: InstrumentAssetKind
  purchaseDate: string
  amount: string
  navPerUnit: string
  /** When true, posts an investment transaction on the account (cashflow). */
  recordInvestmentTransaction: boolean
}

const emptyOpeningForm = (accountId: string): OpeningForm => ({
  query: '',
  accountId,
  openingDate: todayRomeDateInputValue(),
  quantity: '',
  avgCostPerUnit: '',
  recordInvestmentTransaction: true,
})

export function InvestmentPage() {
  const db = useDatabase()
  const accounts = useMemo(() => listAccounts(db), [db])
  const defaultAccountId = accounts[0]?.id ?? ''
  const [accountFilter, setAccountFilter] = useState<string>('all')
  const [activeAssetTab, setActiveAssetTab] = useState<InstrumentAssetKind>('etf')
  const [openingAssetKind, setOpeningAssetKind] = useState<InstrumentAssetKind>('etf')

  const {
    holdings,
    priceEurByInstrumentId,
    totals: _portfolioTotals,
    loading,
    stale,
    fetchedAt,
    errors,
    dataRevision,
    refreshQuotes,
    reloadHoldings,
  } = usePortfolioQuotes(accountFilter === 'all' ? undefined : accountFilter)

  void _portfolioTotals
  void dataRevision
  const recentPurchases = listRecentHoldingPurchases(db, 15)

  const tabHoldings = useMemo(
    () => holdings.filter((h) => h.instrumentAssetKind === activeAssetTab),
    [holdings, activeAssetTab],
  )

  const tabTotals = useMemo(
    () => computePortfolioTotals(tabHoldings, priceEurByInstrumentId),
    [tabHoldings, priceEurByInstrumentId],
  )

  const tabPurchases = useMemo(
    () =>
      recentPurchases.filter((p) => {
        if (p.instrumentAssetKind !== activeAssetTab) {
          return false
        }
        if (accountFilter !== 'all' && p.accountId !== accountFilter) {
          return false
        }
        return true
      }),
    [recentPurchases, activeAssetTab, accountFilter],
  )

  const unrealizedCents =
    tabTotals.marketValueCents === null
      ? null
      : tabTotals.marketValueCents - tabTotals.costBasisCents

  const unrealizedPercentLabel =
    unrealizedCents !== null
      ? formatUnrealizedPercent(unrealizedCents, tabTotals.costBasisCents)
      : null

  const [openingOpen, setOpeningOpen] = useState(false)
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [openingForm, setOpeningForm] = useState<OpeningForm>(() =>
    emptyOpeningForm(defaultAccountId),
  )
  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm | null>(null)
  const [resolved, setResolved] = useState<ResolvedInstrument | null>(null)
  const [lookupOptions, setLookupOptions] = useState<ResolvedInstrument[]>([])
  const [lookupLoading, setLookupLoading] = useState(false)
  const [listingPickerOpen, setListingPickerOpen] = useState(false)
  const [listingQuoteBySymbol, setListingQuoteBySymbol] = useState<Map<string, number>>(
    () => new Map(),
  )
  const [listingQuotesLoading, setListingQuotesLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletePurchaseTargetId, setDeletePurchaseTargetId] = useState<string | null>(
    null,
  )

  async function loadListingQuotes(
    listings: ResolvedInstrument[],
    applyAvgCostFor?: ResolvedInstrument | null,
  ) {
    if (listings.length === 0) {
      setListingQuoteBySymbol(new Map())
      return
    }
    setListingQuotesLoading(true)
    try {
      const { quotes } = await fetchQuotesForInstruments(
        listings.map((listing) => ({
          quoteSymbol: listing.quoteSymbol,
          assetKind: listing.assetKind,
        })),
      )
      const next = new Map<string, number>()
      for (const listing of listings) {
        const quote = quotes.get(listing.quoteSymbol)
        if (quote) {
          next.set(listing.quoteSymbol, quote.priceEur)
        }
      }
      setListingQuoteBySymbol(next)
      if (applyAvgCostFor) {
        const price = next.get(applyAvgCostFor.quoteSymbol)
        if (price !== undefined) {
          setOpeningForm((prev) => ({
            ...prev,
            avgCostPerUnit: unitPriceEurToInputValue(price),
          }))
        }
      }
    } finally {
      setListingQuotesLoading(false)
    }
  }

  function resetListingPickerState() {
    setListingPickerOpen(false)
    setListingQuoteBySymbol(new Map())
    setListingQuotesLoading(false)
  }

  function closeOpeningModal() {
    setOpeningOpen(false)
    resetListingPickerState()
  }

  function selectListing(listing: ResolvedInstrument) {
    setResolved(listing)
    setListingPickerOpen(false)
    setFormError(null)
    const price = listingQuoteBySymbol.get(listing.quoteSymbol)
    if (price !== undefined) {
      setOpeningForm((prev) => ({
        ...prev,
        avgCostPerUnit: unitPriceEurToInputValue(price),
      }))
    } else {
      void loadListingQuotes(lookupOptions, listing)
    }
  }

  async function handleLookup(query: string) {
    setFormError(null)
    setResolved(null)
    setLookupOptions([])
    resetListingPickerState()
    if (!query.trim()) {
      return
    }
    setLookupLoading(true)
    try {
      const results = await searchInstrumentListings(query, openingAssetKind)
      setLookupOptions(results)
      if (results.length === 1) {
        const pick = results[0]!
        setResolved(pick)
        void loadListingQuotes(results, pick)
        return
      }
      setListingPickerOpen(true)
      void loadListingQuotes(results)
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : 'Lookup failed.')
    } finally {
      setLookupLoading(false)
    }
  }

  function openOpeningModal() {
    setOpeningAssetKind(activeAssetTab)
    setOpeningForm(emptyOpeningForm(defaultAccountId))
    setResolved(null)
    setLookupOptions([])
    resetListingPickerState()
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
        assetKind: holding.instrumentAssetKind,
        purchaseDate: todayRomeDateInputValue(),
        amount: '',
        navPerUnit: '',
        recordInvestmentTransaction: true,
      })
    } else if (tabHoldings.length === 1) {
      openPurchaseModal(tabHoldings[0])
      return
    } else {
      setFormError(null)
      setPurchaseOpen(true)
      return
    }
    setFormError(null)
    setPurchaseOpen(true)
  }

  function openEditPurchaseModal(row: (typeof tabPurchases)[number]) {
    setPurchaseForm({
      purchaseId: row.id,
      holdingId: row.holdingId,
      accountId: row.accountId,
      instrumentLabel: row.instrumentName,
      quoteSymbol: row.quoteSymbol,
      isin: row.instrumentIsin,
      name: row.instrumentName,
      assetKind: row.instrumentAssetKind,
      purchaseDate: utcIsoToRomeDateInputValue(row.purchaseDate),
      amount: centsToInputValue(row.amountCents),
      navPerUnit: unitPriceEurToInputValue(row.priceCentsPerUnit / 100),
      recordInvestmentTransaction: Boolean(row.transactionId),
    })
    setFormError(null)
    setPurchaseOpen(true)
  }

  function handleSaveOpening() {
    setFormError(null)
    if (!resolved) {
      setFormError(
        lookupOptions.length > 1
          ? openingAssetKind === 'crypto'
            ? 'Select a cryptocurrency.'
            : 'Select a listing.'
          : `Look up ${lookupFieldLabel(openingAssetKind).toLowerCase()} first.`,
      )
      return
    }
    const quantity = parseQuantity(openingForm.quantity)
    const priceCentsPerUnit = parseInputToUnitPriceCents(openingForm.avgCostPerUnit)
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
          isin: resolved.isin ?? parseIsinFromQuery(openingForm.query),
          quoteSymbol: resolved.quoteSymbol,
          name: resolved.name,
          assetKind: resolved.assetKind,
        },
        openingDate: openingForm.openingDate,
        quantity,
        priceCentsPerUnit,
        recordInvestmentTransaction: openingForm.recordInvestmentTransaction,
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
    const priceCentsPerUnit = parseInputToUnitPriceCents(purchaseForm.navPerUnit)
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
      if (purchaseForm.purchaseId) {
        updateHoldingPurchase(db, purchaseForm.purchaseId, {
          purchaseDate: purchaseForm.purchaseDate,
          amountCents,
          priceCentsPerUnit,
        })
      } else {
        recordHoldingPurchase(db, {
          accountId: purchaseForm.accountId,
          instrument: {
            isin: purchaseForm.isin,
            quoteSymbol: purchaseForm.quoteSymbol,
            name: purchaseForm.name,
            assetKind: purchaseForm.assetKind,
          },
          purchaseDate: purchaseForm.purchaseDate,
          amountCents,
          priceCentsPerUnit,
          recordInvestmentTransaction: purchaseForm.recordInvestmentTransaction,
        })
      }
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

  function confirmDeletePurchase() {
    if (!deletePurchaseTargetId) {
      return
    }
    try {
      deleteHoldingPurchase(db, deletePurchaseTargetId)
      setDeletePurchaseTargetId(null)
      reloadHoldings()
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : 'Could not delete purchase.',
      )
      setDeletePurchaseTargetId(null)
    }
  }

  return (
    <div className="app-page p-8">
      <div className="shrink-0">
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
              {addPositionButtonLabel(activeAssetTab)}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-white"
              onClick={() => openPurchaseModal()}
              disabled={tabHoldings.length === 0}
            >
              Record purchase
            </button>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          {ASSET_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={pillClass(activeAssetTab === tab.id)}
              onClick={() => setActiveAssetTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

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
              {tabTotals.marketValueCents === null
                ? '—'
                : formatCents(tabTotals.marketValueCents)}
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
              {formatCents(tabTotals.costBasisCents)}
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
      </div>

      <div className="app-page-scroll-ceiling investments-split">
        <section className="investments-panel investments-panel--holdings">
          <div
            className={`data-table-scroll-shell min-h-0 min-w-0 flex-1 ${APP_SCROLLBAR_CLASS}`}
          >
            <table className="investments-table text-sm">
              <colgroup>
                <col className="investments-col-instrument" />
                <col className="investments-col-money" />
                <col className="investments-col-money" />
                <col className="investments-col-money" />
                <col className="investments-col-money" />
                <col className="investments-col-money" />
                <col className="investments-col-account" />
                <col className="investments-col-actions" />
              </colgroup>
              <thead className="data-table-head">
                <tr>
                  <th className="investments-cell-instrument px-3 py-2">Instrument</th>
                  <th className="money-cell px-3 py-2">Quantity</th>
                  <th className="money-cell px-3 py-2">Avg cost</th>
                  <th className="money-cell px-3 py-2">Last price</th>
                  <th className="money-cell px-3 py-2">Market value</th>
                  <th className="money-cell px-3 py-2">P/L</th>
                  <th className="px-3 py-2">Account</th>
                  <th className="investments-cell-actions px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {tabHoldings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      {emptyHoldingsMessage(activeAssetTab)}
                    </td>
                  </tr>
                ) : (
                  tabHoldings.map((holding) => {
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
                        <td className="investments-cell-instrument px-3 py-2">
                          <OverflowTooltip
                            text={holding.instrumentName}
                            className="font-medium text-white"
                          >
                            <div className="truncate text-xs text-slate-500">
                              {formatInstrumentMetaLine(holding)}
                            </div>
                          </OverflowTooltip>
                        </td>
                        <td className="money-cell px-3 py-2">
                          {formatQuantity(holding.quantity)}
                        </td>
                        <td className="money-cell px-3 py-2">
                          {formatUnitPriceEur(avgCostEur)}
                        </td>
                        <td className="money-cell px-3 py-2">
                          {lastPrice === undefined ? '—' : formatPriceEur(lastPrice)}
                        </td>
                        <td className="money-cell px-3 py-2">
                          {mvCents === null ? '—' : formatCents(mvCents)}
                        </td>
                        <td className={`money-cell px-3 py-2 ${plToneClass(plCents)}`}>
                          {plCents === null ? (
                            '—'
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              <span>{formatCents(plCents)}</span>
                              {plPercentLabel ? (
                                <span className="text-xs font-medium">
                                  {plPercentLabel}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">{holding.accountName}</td>
                        <td className="investments-cell-actions px-3 py-2">
                          <div className="flex justify-center gap-1">
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
        </section>

        <section className="investments-panel investments-panel--purchases">
          <h3 className="mb-3 shrink-0 text-lg font-semibold text-white">
            Recent purchases
          </h3>
          <div className="recent-purchases-shell flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="recent-purchases-head shrink-0 overflow-x-auto">
              <table className="recent-purchases-table text-sm">
                <colgroup>
                  <col className="recent-purchases-col-date" />
                  <col />
                  <col className="recent-purchases-col-account" />
                  <col className="recent-purchases-col-money" />
                  <col className="recent-purchases-col-money" />
                  <col className="recent-purchases-col-money" />
                  <col className="recent-purchases-col-actions" />
                </colgroup>
                <thead className="data-table-head">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="recent-purchases-cell-instrument px-3 py-2">
                      Instrument
                    </th>
                    <th className="px-3 py-2">Account</th>
                    <th className="money-cell px-3 py-2">Amount</th>
                    <th className="money-cell px-3 py-2">NAV</th>
                    <th className="money-cell px-3 py-2">Units</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
              </table>
            </div>
            <div className={`recent-purchases-body-scroll ${APP_SCROLLBAR_CLASS}`}>
              <table className="recent-purchases-table text-sm">
                <colgroup>
                  <col className="recent-purchases-col-date" />
                  <col />
                  <col className="recent-purchases-col-account" />
                  <col className="recent-purchases-col-money" />
                  <col className="recent-purchases-col-money" />
                  <col className="recent-purchases-col-money" />
                  <col className="recent-purchases-col-actions" />
                </colgroup>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {tabPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                        No purchases recorded yet.
                      </td>
                    </tr>
                  ) : (
                    tabPurchases.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2">
                          {formatItalianCalendarDateInRome(row.purchaseDate)}
                        </td>
                        <td className="recent-purchases-cell-instrument px-3 py-2">
                          <OverflowTooltip text={row.instrumentName} />
                        </td>
                        <td className="px-3 py-2">{row.accountName}</td>
                        <td className="money-cell px-3 py-2">
                          {formatCents(row.amountCents)}
                        </td>
                        <td className="money-cell px-3 py-2">
                          {formatUnitPriceEur(row.priceCentsPerUnit / 100)}
                        </td>
                        <td className="money-cell px-3 py-2">
                          {formatQuantity(row.quantity)}
                        </td>
                        <td className="recent-purchases-cell-actions px-3 py-2">
                          <div className="flex justify-center gap-1">
                            <button
                              type="button"
                              className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                              title="Edit purchase"
                              onClick={() => openEditPurchaseModal(row)}
                            >
                              <Pencil className="size-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-red-400"
                              title="Delete purchase"
                              onClick={() => setDeletePurchaseTargetId(row.id)}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <Modal
        title="Add opening position"
        open={openingOpen}
        onClose={closeOpeningModal}
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">{lookupFieldLabel(openingAssetKind)}</span>
            <div className="flex gap-2">
              <input
                className="form-field min-w-0 flex-1"
                value={openingForm.query}
                onChange={(event) => {
                  setOpeningForm((prev) => ({
                    ...prev,
                    query: event.target.value,
                    avgCostPerUnit: '',
                  }))
                  setResolved(null)
                  setLookupOptions([])
                  resetListingPickerState()
                }}
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
          {lookupOptions.length > 1 && !resolved ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-slate-400">
                {lookupOptions.length} listings found. Choose one to continue.
              </p>
              <button
                type="button"
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
                onClick={() => setListingPickerOpen(true)}
              >
                Choose listing
              </button>
            </div>
          ) : null}
          {resolved ? (
            <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-white">{resolved.name}</p>
                {lookupOptions.length > 1 ? (
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium text-emerald-400 hover:text-emerald-300"
                    onClick={() => setListingPickerOpen(true)}
                  >
                    Change
                  </button>
                ) : null}
              </div>
              <InstrumentListingFacts
                listing={resolved}
                lookupQuery={openingForm.query}
                quoteBySymbol={listingQuoteBySymbol}
                quotesLoading={listingQuotesLoading}
              />
            </div>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">Account</span>
            <FormSelect
              value={openingForm.accountId}
              onChange={(accountId) =>
                setOpeningForm((prev) => ({ ...prev, accountId }))
              }
              options={accounts.map((account) => ({
                value: account.id,
                label: account.name,
              }))}
            />
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
              className="form-field w-full"
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
              className="form-field w-full"
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
            const priceCents = parseInputToUnitPriceCents(openingForm.avgCostPerUnit)
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
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className="form-checkbox mt-0.5"
              checked={openingForm.recordInvestmentTransaction}
              onChange={(event) =>
                setOpeningForm((prev) => ({
                  ...prev,
                  recordInvestmentTransaction: event.target.checked,
                }))
              }
            />
            <span>
              Deduct from account balance
              <span className="mt-0.5 block text-xs text-slate-500">
                Turn off for assets you already hold (portfolio only, no account
                cashflow).
              </span>
            </span>
          </label>
          <FormError message={formError} />
          <ModalActions
            onCancel={closeOpeningModal}
            submitType="button"
            onSubmit={handleSaveOpening}
          />
        </div>
      </Modal>

      <Modal
        title={
          openingAssetKind === 'crypto' ? 'Choose cryptocurrency' : 'Choose listing'
        }
        open={listingPickerOpen && openingOpen}
        onClose={() => setListingPickerOpen(false)}
        layerClassName="z-[60]"
        panelClassName="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl"
      >
        <div className="shrink-0 space-y-3">
          <p className="text-sm text-slate-400">
            {openingAssetKind === 'crypto'
              ? 'Multiple assets match your search. Pick the one you hold.'
              : 'Multiple listings match your search. Pick the exchange and ticker you track for quotes.'}
          </p>
          {listingQuotesLoading ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading last prices…
            </p>
          ) : null}
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto py-3 ${APP_SCROLLBAR_CLASS}`}>
          <div className="flex flex-col gap-3 pr-1">
            {lookupOptions.map((listing) => (
              <button
                key={listing.quoteSymbol}
                type="button"
                className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-left transition-colors hover:border-slate-500 hover:bg-slate-800/80"
                onClick={() => selectListing(listing)}
              >
                <p className="text-sm font-medium text-white">{listing.name}</p>
                <InstrumentListingFacts
                  listing={listing}
                  lookupQuery={openingForm.query}
                  quoteBySymbol={listingQuoteBySymbol}
                  quotesLoading={listingQuotesLoading}
                />
              </button>
            ))}
          </div>
        </div>
        <div className="shrink-0 pt-4">
          <ModalCancelOnly onCancel={() => setListingPickerOpen(false)} />
        </div>
      </Modal>

      <Modal
        title={purchaseForm?.purchaseId ? 'Edit purchase' : 'Record purchase'}
        open={purchaseOpen}
        onClose={() => {
          setPurchaseOpen(false)
          setPurchaseForm(null)
          setFormError(null)
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
                className="form-field w-full"
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
                className="form-field w-full"
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
              const navCents = parseInputToUnitPriceCents(purchaseForm.navPerUnit)
              if (amountCents && navCents && navCents > 0) {
                return (
                  <p className="text-sm text-slate-400">
                    Units: {formatQuantity(amountCents / navCents)}
                  </p>
                )
              }
              return null
            })()}
            {!purchaseForm.purchaseId ? (
              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="form-checkbox mt-0.5"
                  checked={purchaseForm.recordInvestmentTransaction}
                  onChange={(event) =>
                    setPurchaseForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            recordInvestmentTransaction: event.target.checked,
                          }
                        : prev,
                    )
                  }
                />
                <span>
                  Deduct from account balance
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Turn off for external inflows (e.g. saveback) that increase holdings
                    without spending cash on the account.
                  </span>
                </span>
              </label>
            ) : null}
            <FormError message={formError} />
            <ModalActions
              onCancel={() => {
                setPurchaseOpen(false)
                setPurchaseForm(null)
                setFormError(null)
              }}
              submitLabel={purchaseForm.purchaseId ? 'Save' : 'Record'}
              submitType="button"
              onSubmit={handleSavePurchase}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-400">Choose a holding:</p>
            {tabHoldings.map((holding) => (
              <button
                key={holding.id}
                type="button"
                className="rounded-lg border border-slate-700 px-3 py-2 text-left text-sm text-white hover:bg-slate-800"
                onClick={() => openPurchaseModal(holding)}
              >
                {holding.instrumentName} · {holding.accountName}
              </button>
            ))}
            <ModalCancelOnly
              onCancel={() => {
                setPurchaseOpen(false)
                setPurchaseForm(null)
              }}
            />
          </div>
        )}
      </Modal>

      <Modal
        title="Delete purchase"
        open={deletePurchaseTargetId !== null}
        onClose={() => setDeletePurchaseTargetId(null)}
      >
        <p className="text-sm text-slate-300">
          Remove this purchase from the portfolio? The linked investment transaction
          will be deleted too, and the position quantity and cost basis will be updated.
        </p>
        <div className="mt-6">
          <ModalActions
            onCancel={() => setDeletePurchaseTargetId(null)}
            submitLabel="Delete"
            submitType="button"
            onSubmit={confirmDeletePurchase}
            submitClassName="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
          />
        </div>
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
        <div className="mt-6">
          <ModalActions
            onCancel={closeDeleteHoldingModal}
            submitLabel="Remove"
            submitType="button"
            submitDisabled={deleteConfirmText !== DELETE_HOLDING_CONFIRM_PHRASE}
            onSubmit={confirmDeleteHolding}
            submitClassName="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          />
        </div>
      </Modal>
    </div>
  )
}

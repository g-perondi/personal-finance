import { useCallback, useEffect, useMemo, useState } from 'react'
import { computePortfolioTotals, listHoldings } from '../db/repositories/holding'
import type { HoldingListItem } from '../db/repositories/model'
import {
  getCachedQuoteCents,
  getStaleCachedQuoteCents,
  setCachedQuoteCents,
} from '../db/repositories/instrument'
import { fetchQuotesForInstruments } from '../lib/market-quotes'
import type { Database } from 'sql.js'
import { useDatabase } from './useDatabase'

export type PortfolioQuotesResult = {
  holdings: HoldingListItem[]
  priceEurByInstrumentId: Map<string, number>
  totals: ReturnType<typeof computePortfolioTotals>
  loading: boolean
  stale: boolean
  fetchedAt: string | null
  errors: string[]
  dataRevision: number
  refreshQuotes: () => Promise<void>
  reloadHoldings: () => void
}

function holdingsCacheKey(holdings: HoldingListItem[]): string {
  return holdings.map((h) => `${h.id}:${h.quoteSymbol}:${h.quantity}`).join('|')
}

function readCachedQuotePrices(
  db: Database,
  holdings: HoldingListItem[],
): {
  priceEurByInstrumentId: Map<string, number>
  fetchedAt: string | null
  stale: boolean
} {
  const priceEurByInstrumentId = new Map<string, number>()
  let fetchedAt: string | null = null
  let stale = false

  for (const holding of holdings) {
    const fresh = getCachedQuoteCents(db, holding.instrumentId)
    const cached = fresh ?? getStaleCachedQuoteCents(db, holding.instrumentId)
    if (!cached) {
      continue
    }
    if (!fresh) {
      stale = true
    }
    priceEurByInstrumentId.set(holding.instrumentId, cached.priceCentsPerUnit / 100)
    if (!fetchedAt || Date.parse(cached.fetchedAt) > Date.parse(fetchedAt)) {
      fetchedAt = cached.fetchedAt
    }
  }

  return { priceEurByInstrumentId, fetchedAt, stale }
}

export function usePortfolioQuotes(accountId?: string): PortfolioQuotesResult {
  const db = useDatabase()
  const [dataRevision, setDataRevision] = useState(0)
  const holdings = useMemo(() => {
    void dataRevision
    return listHoldings(db, accountId ? { accountId } : {})
  }, [db, accountId, dataRevision])
  const holdingsKey = holdingsCacheKey(holdings)

  const cachedSnapshot = useMemo(
    () => readCachedQuotePrices(db, holdings),
    [db, holdings],
  )

  const [fetchSnapshot, setFetchSnapshot] = useState<{
    holdingsKey: string
    priceEurByInstrumentId: Map<string, number>
    fetchedAt: string | null
    stale: boolean
    errors: string[]
  } | null>(null)
  const [loading, setLoading] = useState(false)

  const reloadHoldings = useCallback(() => {
    setDataRevision((v) => v + 1)
  }, [])

  const refreshQuotes = useCallback(async () => {
    if (holdings.length === 0) {
      setFetchSnapshot(null)
      return
    }
    setLoading(true)

    try {
      const requests = holdings.map((h) => ({
        quoteSymbol: h.quoteSymbol,
        assetKind: h.instrumentAssetKind,
      }))
      const { quotes, errors: fetchErrors } = await fetchQuotesForInstruments(requests)
      const map = new Map<string, number>()
      let latest: string | null = null
      let missing = 0

      for (const holding of holdings) {
        const quote = quotes.get(holding.quoteSymbol)
        if (quote) {
          map.set(holding.instrumentId, quote.priceEur)
          setCachedQuoteCents(db, holding.instrumentId, quote.priceEur, quote.fetchedAt)
          if (!latest || Date.parse(quote.fetchedAt) > Date.parse(latest)) {
            latest = quote.fetchedAt
          }
          continue
        }
        const staleCache = getStaleCachedQuoteCents(db, holding.instrumentId)
        if (staleCache) {
          map.set(holding.instrumentId, staleCache.priceCentsPerUnit / 100)
          if (!latest || Date.parse(staleCache.fetchedAt) > Date.parse(latest)) {
            latest = staleCache.fetchedAt
          }
        } else {
          const freshCache = getCachedQuoteCents(db, holding.instrumentId)
          if (freshCache) {
            map.set(holding.instrumentId, freshCache.priceCentsPerUnit / 100)
          } else {
            missing += 1
          }
        }
      }

      setFetchSnapshot({
        holdingsKey,
        priceEurByInstrumentId: map,
        fetchedAt: latest,
        stale: fetchErrors.length > 0 || missing > 0,
        errors: fetchErrors.map((entry) => `${entry.quoteSymbol}: ${entry.message}`),
      })
    } catch (error: unknown) {
      const map = new Map<string, number>()
      let latest: string | null = null
      for (const holding of holdings) {
        const cached = getStaleCachedQuoteCents(db, holding.instrumentId)
        if (cached) {
          map.set(holding.instrumentId, cached.priceCentsPerUnit / 100)
          if (!latest || Date.parse(cached.fetchedAt) > Date.parse(latest)) {
            latest = cached.fetchedAt
          }
        }
      }
      setFetchSnapshot({
        holdingsKey,
        priceEurByInstrumentId: map,
        fetchedAt: latest,
        stale: true,
        errors: [error instanceof Error ? error.message : 'Quote refresh failed.'],
      })
    } finally {
      setLoading(false)
    }
  }, [db, holdings, holdingsKey])

  useEffect(() => {
    if (holdings.length === 0) {
      return
    }
    queueMicrotask(() => {
      void refreshQuotes()
    })
  }, [holdings.length, holdingsKey, refreshQuotes])

  const usingFetchSnapshot =
    fetchSnapshot !== null && fetchSnapshot.holdingsKey === holdingsKey

  const priceEurByInstrumentId = usingFetchSnapshot
    ? fetchSnapshot.priceEurByInstrumentId
    : cachedSnapshot.priceEurByInstrumentId
  const fetchedAt = usingFetchSnapshot
    ? fetchSnapshot.fetchedAt
    : cachedSnapshot.fetchedAt
  const stale = usingFetchSnapshot ? fetchSnapshot.stale : cachedSnapshot.stale
  const errors = usingFetchSnapshot ? fetchSnapshot.errors : []

  const totals = useMemo(
    () => computePortfolioTotals(holdings, priceEurByInstrumentId),
    [holdings, priceEurByInstrumentId],
  )

  return {
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
  }
}

import type { ResolvedInstrument } from './types'

const CORS_PROXY = 'https://proxy.cors.dev/'
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

function proxyUrl(target: string): string {
  return `${CORS_PROXY}${target}`
}

function normalizeQuery(raw: string): string {
  return raw.trim().toUpperCase()
}

type YahooSearchQuote = {
  symbol?: string
  shortname?: string
  longname?: string
  quoteType?: string
  exchange?: string
}

async function yahooSearch(query: string): Promise<ResolvedInstrument | null> {
  const url = proxyUrl(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`,
  )
  const response = await fetch(url)
  if (!response.ok) {
    return null
  }
  const payload = (await response.json()) as { quotes?: YahooSearchQuote[] }
  const quotes = payload.quotes ?? []
  const etfLike =
    quotes.find((q) => q.quoteType === 'ETF' && q.symbol) ??
    quotes.find((q) => q.symbol)
  if (!etfLike?.symbol) {
    return null
  }
  const name = etfLike.longname ?? etfLike.shortname ?? etfLike.symbol
  const isin = ISIN_PATTERN.test(query) ? query : null
  return {
    quoteSymbol: etfLike.symbol,
    name,
    isin,
  }
}

/** Resolve ISIN or ticker to a Yahoo/API quote symbol and display name. */
export async function resolveInstrument(query: string): Promise<ResolvedInstrument> {
  const normalized = normalizeQuery(query)
  if (!normalized) {
    throw new Error('Enter an ISIN or ticker symbol.')
  }

  const fromSearch = await yahooSearch(normalized)
  if (fromSearch) {
    if (ISIN_PATTERN.test(normalized)) {
      return { ...fromSearch, isin: normalized }
    }
    return {
      quoteSymbol: normalized.includes('.') ? normalized : fromSearch.quoteSymbol,
      name: fromSearch.name,
      isin: fromSearch.isin,
    }
  }

  if (/^[A-Z0-9.]+$/.test(normalized)) {
    return {
      quoteSymbol: normalized,
      name: normalized,
      isin: ISIN_PATTERN.test(normalized) ? normalized : null,
    }
  }

  throw new Error('Could not find an ETF for that ISIN or ticker.')
}

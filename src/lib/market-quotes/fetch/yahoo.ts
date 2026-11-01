import { utcNowIso } from '../../datetime'
import { convertToEur } from '../fx'
import type { QuoteResult } from '../types'
import { fetchJsonSafe, proxyUrl } from './shared'

const QUOTE_TTL_MS = 3 * 60 * 1000

const memoryCache = new Map<
  string,
  { priceEur: number; fetchedAt: number; source: string }
>()

function quoteSymbolVariants(symbol: string): string[] {
  const trimmed = symbol.trim()
  const variants = [trimmed]
  if (!trimmed.includes('.')) {
    for (const suffix of ['.DE', '.MI', '.AS', '.L']) {
      variants.push(`${trimmed}${suffix}`)
    }
  }
  return [...new Set(variants)]
}

type YahooChartMeta = {
  price: number
  currency: string
  matchedSymbol: string
}

async function fetchYahooChartMeta(symbol: string): Promise<YahooChartMeta | null> {
  for (const candidate of quoteSymbolVariants(symbol)) {
    const url = proxyUrl(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(candidate)}?range=1d&interval=1d`,
    )
    const payload = await fetchJsonSafe<{
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number
            currency?: string
            symbol?: string
          }
        }>
      }
    }>(url)
    const meta = payload?.chart?.result?.[0]?.meta
    const price = meta?.regularMarketPrice
    if (typeof price !== 'number' || price <= 0 || !meta?.currency) {
      continue
    }
    return {
      price,
      currency: meta.currency,
      matchedSymbol: meta.symbol ?? candidate,
    }
  }
  return null
}

async function quoteFromYahooChart(
  requestedSymbol: string,
): Promise<QuoteResult | null> {
  const meta = await fetchYahooChartMeta(requestedSymbol)
  if (!meta) {
    return null
  }
  const priceEur = await convertToEur(meta.price, meta.currency)
  return {
    quoteSymbol: requestedSymbol,
    priceEur,
    fetchedAt: utcNowIso(),
    source: 'yahoo',
  }
}

export async function fetchYahooQuote(symbol: string): Promise<QuoteResult> {
  const cached = memoryCache.get(symbol)
  if (cached && Date.now() - cached.fetchedAt < QUOTE_TTL_MS) {
    return {
      quoteSymbol: symbol,
      priceEur: cached.priceEur,
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      source: cached.source,
    }
  }

  const result = await quoteFromYahooChart(symbol)
  if (!result) {
    throw new Error(`No quote available for ${symbol}.`)
  }
  memoryCache.set(symbol, {
    priceEur: result.priceEur,
    fetchedAt: Date.parse(result.fetchedAt),
    source: result.source,
  })
  return result
}

export function clearYahooQuoteMemoryCache(): void {
  memoryCache.clear()
}

import { utcNowIso } from '../datetime'
import { convertToEur } from './fx'
import type { QuoteFetchError, QuoteResult } from './types'

const CORS_PROXY = 'https://proxy.cors.dev/'
const QUOTE_TTL_MS = 3 * 60 * 1000

const memoryCache = new Map<
  string,
  { priceEur: number; fetchedAt: number; source: string }
>()

function proxyUrl(target: string): string {
  return `${CORS_PROXY}${target}`
}

/** Avoid uncaught network/CORS errors in the console breaking the fallback chain. */
async function fetchJsonSafe<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return null
    }
    return (await response.json()) as T
  } catch {
    return null
  }
}

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

async function fetchFromEtfExplorer(
  symbols: string[],
): Promise<Map<string, QuoteResult>> {
  const out = new Map<string, QuoteResult>()
  if (symbols.length === 0) {
    return out
  }
  const url = `https://etfexplorer.com/api/v1/quotes?symbols=${encodeURIComponent(symbols.join(','))}`
  const payload = await fetchJsonSafe<{
    quotes?: Array<{ symbol?: string; price?: number; last?: number }>
  }>(url)
  if (!payload) {
    return out
  }
  const fetchedAt = utcNowIso()
  for (const row of payload.quotes ?? []) {
    const symbol = row.symbol?.toUpperCase()
    const price = row.price ?? row.last
    if (!symbol || typeof price !== 'number' || price <= 0) {
      continue
    }
    out.set(symbol, {
      quoteSymbol: symbol,
      priceEur: price,
      fetchedAt,
      source: 'etfexplorer',
    })
  }
  return out
}

async function fetchFromYahooChart(symbol: string): Promise<QuoteResult | null> {
  for (const candidate of quoteSymbolVariants(symbol)) {
    const url = proxyUrl(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(candidate)}?range=1d&interval=1d`,
    )
    const payload = await fetchJsonSafe<{
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number; currency?: string; symbol?: string }
        }>
      }
    }>(url)
    const meta = payload?.chart?.result?.[0]?.meta
    const price = meta?.regularMarketPrice
    if (typeof price !== 'number' || price <= 0) {
      continue
    }
    const currency = meta?.currency ?? 'EUR'
    const priceEur = await convertToEur(price, currency)
    return {
      quoteSymbol: symbol,
      priceEur,
      fetchedAt: utcNowIso(),
      source: 'yahoo',
    }
  }
  return null
}

function matchEtfExplorerQuote(
  batch: Map<string, QuoteResult>,
  symbol: string,
): QuoteResult | undefined {
  const direct = batch.get(symbol.toUpperCase()) ?? batch.get(symbol)
  if (direct) {
    return direct
  }
  for (const candidate of quoteSymbolVariants(symbol)) {
    const hit = batch.get(candidate.toUpperCase()) ?? batch.get(candidate)
    if (hit) {
      return { ...hit, quoteSymbol: symbol }
    }
  }
  return undefined
}

async function fetchSingleQuote(symbol: string): Promise<QuoteResult> {
  const cached = memoryCache.get(symbol)
  if (cached && Date.now() - cached.fetchedAt < QUOTE_TTL_MS) {
    return {
      quoteSymbol: symbol,
      priceEur: cached.priceEur,
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      source: cached.source,
    }
  }

  const batch = await fetchFromEtfExplorer(quoteSymbolVariants(symbol))
  let result = matchEtfExplorerQuote(batch, symbol)
  if (!result) {
    result = (await fetchFromYahooChart(symbol)) ?? undefined
  }
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

export async function fetchQuotes(symbols: string[]): Promise<{
  quotes: Map<string, QuoteResult>
  errors: QuoteFetchError[]
}> {
  const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))]
  const quotes = new Map<string, QuoteResult>()
  const errors: QuoteFetchError[] = []

  if (unique.length > 0) {
    const allVariants = unique.flatMap((symbol) => quoteSymbolVariants(symbol))
    const batch = await fetchFromEtfExplorer([...new Set(allVariants)])
    for (const symbol of unique) {
      const hit = matchEtfExplorerQuote(batch, symbol)
      if (hit) {
        quotes.set(symbol, hit)
        memoryCache.set(symbol, {
          priceEur: hit.priceEur,
          fetchedAt: Date.parse(hit.fetchedAt),
          source: hit.source,
        })
      }
    }
  }

  await Promise.all(
    unique
      .filter((symbol) => !quotes.has(symbol))
      .map(async (symbol) => {
        try {
          const quote = await fetchSingleQuote(symbol)
          quotes.set(symbol, quote)
        } catch (error: unknown) {
          errors.push({
            quoteSymbol: symbol,
            message: error instanceof Error ? error.message : 'Quote fetch failed.',
          })
        }
      }),
  )

  return { quotes, errors }
}

export function clearQuoteMemoryCache(): void {
  memoryCache.clear()
}

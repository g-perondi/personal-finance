import type { ResolvedInstrument } from './types'

const CORS_PROXY = 'https://proxy.cors.dev/'
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

const EURO_LISTING_SUFFIX = /\.(DE|MI|AS|PA|BR|HE|F)$/
const EURO_EXCHANGES = new Set(['GER', 'MIL', 'AMS', 'PAR', 'DUS', 'STU', 'MUN', 'EBS'])

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

async function yahooSearchQuotes(query: string): Promise<YahooSearchQuote[]> {
  const url = proxyUrl(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=20&newsCount=0`,
  )
  const response = await fetch(url)
  if (!response.ok) {
    return []
  }
  const payload = (await response.json()) as { quotes?: YahooSearchQuote[] }
  return payload.quotes ?? []
}

function scoreEtfListing(quote: YahooSearchQuote): number {
  if (quote.quoteType !== 'ETF' || !quote.symbol) {
    return Number.NEGATIVE_INFINITY
  }
  let score = 0
  if (EURO_LISTING_SUFFIX.test(quote.symbol)) {
    score += 100
  }
  if (quote.exchange && EURO_EXCHANGES.has(quote.exchange)) {
    score += 40
  }
  if (quote.symbol.endsWith('.L')) {
    score -= 50
  }
  if (quote.symbol.endsWith('.SW')) {
    score -= 20
  }
  return score
}

function pickPreferredEtfQuote(quotes: YahooSearchQuote[]): YahooSearchQuote | null {
  let best: YahooSearchQuote | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const quote of quotes) {
    const score = scoreEtfListing(quote)
    if (score > bestScore && quote.symbol) {
      best = quote
      bestScore = score
    }
  }
  return best
}

function toResolvedInstrument(
  quote: YahooSearchQuote,
  isin: string | null,
): ResolvedInstrument {
  const name = quote.longname ?? quote.shortname ?? quote.symbol ?? ''
  return {
    quoteSymbol: quote.symbol!,
    name,
    isin,
  }
}

async function resolveFromYahooSearch(
  query: string,
  isin: string | null,
): Promise<ResolvedInstrument | null> {
  let quotes = await yahooSearchQuotes(query)
  if (quotes.length === 0) {
    return null
  }

  if (isin) {
    const seed = pickPreferredEtfQuote(quotes) ?? quotes.find((q) => q.symbol)
    const fundName = seed?.longname ?? seed?.shortname
    if (fundName && fundName !== query) {
      const byName = await yahooSearchQuotes(fundName)
      if (byName.length > 0) {
        quotes = byName
      }
    }
  }

  const picked = pickPreferredEtfQuote(quotes)
  if (!picked?.symbol) {
    return null
  }
  return toResolvedInstrument(picked, isin)
}

/** Resolve ISIN or ticker to a Yahoo/API quote symbol and display name. */
export async function resolveInstrument(query: string): Promise<ResolvedInstrument> {
  const normalized = normalizeQuery(query)
  if (!normalized) {
    throw new Error('Enter an ISIN or ticker symbol.')
  }

  const isin = ISIN_PATTERN.test(normalized) ? normalized : null
  const fromSearch = await resolveFromYahooSearch(normalized, isin)
  if (fromSearch) {
    return fromSearch
  }

  if (/^[A-Z0-9.]+$/.test(normalized)) {
    return {
      quoteSymbol: normalized,
      name: normalized,
      isin,
    }
  }

  throw new Error('Could not find an ETF for that ISIN or ticker.')
}

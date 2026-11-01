import type { InstrumentAssetKind } from '../../../db/repositories/model'
import type { ResolvedInstrument } from '../types'

const CORS_PROXY = 'https://proxy.cors.dev/'
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

export const EURO_LISTING_SUFFIX = /\.(DE|MI|AS|PA|BR|HE|F)$/
export const EURO_EXCHANGES = new Set([
  'GER',
  'MIL',
  'AMS',
  'PAR',
  'DUS',
  'STU',
  'MUN',
  'EBS',
])

export function proxyUrl(target: string): string {
  return `${CORS_PROXY}${target}`
}

export function normalizeQuery(raw: string): string {
  return raw.trim().toUpperCase()
}

/** ISIN from the lookup field (ignores spaces, hyphens, and optional "ISIN:" prefix). */
export function parseIsinFromQuery(raw: string): string | null {
  const withoutLabel = raw.trim().replace(/^ISIN\s*:?\s*/i, '')
  const compact = withoutLabel.replace(/[\s-]+/g, '').toUpperCase()
  if (!compact) {
    return null
  }
  return ISIN_PATTERN.test(compact) ? compact : null
}

export type YahooSearchQuote = {
  symbol?: string
  shortname?: string
  longname?: string
  quoteType?: string
  exchange?: string
}

export async function yahooSearchQuotes(query: string): Promise<YahooSearchQuote[]> {
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

export function scoreEuroListing(quote: YahooSearchQuote): number {
  if (!quote.symbol) {
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

export function toResolvedInstrument(
  quote: YahooSearchQuote,
  isin: string | null,
  assetKind: InstrumentAssetKind,
): ResolvedInstrument {
  const name = quote.longname ?? quote.shortname ?? quote.symbol ?? ''
  return {
    quoteSymbol: quote.symbol!,
    name,
    isin,
    assetKind,
    exchange: quote.exchange ?? null,
  }
}

export function listListingsFromQuotes(
  quotes: YahooSearchQuote[],
  isin: string | null,
  assetKind: InstrumentAssetKind,
  scoreListing: (quote: YahooSearchQuote) => number,
): ResolvedInstrument[] {
  const scored: { score: number; listing: ResolvedInstrument }[] = []
  const seenSymbols = new Set<string>()

  for (const quote of quotes) {
    const score = scoreListing(quote)
    if (score === Number.NEGATIVE_INFINITY || !quote.symbol) {
      continue
    }
    if (seenSymbols.has(quote.symbol)) {
      continue
    }
    seenSymbols.add(quote.symbol)
    scored.push({ score, listing: toResolvedInstrument(quote, isin, assetKind) })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    return a.listing.quoteSymbol.localeCompare(b.listing.quoteSymbol)
  })

  return scored.map((entry) => entry.listing)
}

export function fallbackTickerListing(
  searchTerm: string,
  queryIsin: string | null,
  assetKind: InstrumentAssetKind,
  notFoundMessage: string,
): ResolvedInstrument[] {
  if (/^[A-Z0-9.]+$/.test(searchTerm)) {
    return [
      {
        quoteSymbol: searchTerm,
        name: searchTerm,
        isin: queryIsin,
        assetKind,
        exchange: null,
      },
    ]
  }
  throw new Error(notFoundMessage)
}

export async function gatherYahooQuotesByName(
  query: string,
  isin: string | null,
  pickPreferred: (quotes: YahooSearchQuote[]) => YahooSearchQuote | null,
): Promise<YahooSearchQuote[]> {
  let quotes = await yahooSearchQuotes(query)
  if (quotes.length === 0) {
    return []
  }

  if (isin) {
    const seed = pickPreferred(quotes) ?? quotes.find((q) => q.symbol)
    const fundName = seed?.longname ?? seed?.shortname
    if (fundName && fundName !== query) {
      const byName = await yahooSearchQuotes(fundName)
      if (byName.length > 0) {
        quotes = byName
      }
    }
  }

  return quotes
}

import type { ResolvedInstrument } from '../types'
import {
  fallbackTickerListing,
  gatherYahooQuotesByName,
  listListingsFromQuotes,
  normalizeQuery,
  parseIsinFromQuery,
  scoreEuroListing,
  type YahooSearchQuote,
} from './shared'

function scoreEtfListing(quote: YahooSearchQuote): number {
  if (quote.quoteType !== 'ETF' || !quote.symbol) {
    return Number.NEGATIVE_INFINITY
  }
  return scoreEuroListing(quote)
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

/** All ETF listings matching an ISIN or ticker (sorted with Euro listings first). */
export async function searchEtfListings(query: string): Promise<ResolvedInstrument[]> {
  const queryIsin = parseIsinFromQuery(query)
  const normalized = normalizeQuery(query)
  if (!normalized && !queryIsin) {
    throw new Error('Enter an ISIN or ticker symbol.')
  }

  const searchTerm = queryIsin ?? normalized
  const quotes = await gatherYahooQuotesByName(
    searchTerm,
    queryIsin,
    pickPreferredEtfQuote,
  )
  const fromSearch = listListingsFromQuotes(quotes, queryIsin, 'etf', scoreEtfListing)
  if (fromSearch.length > 0) {
    return fromSearch
  }

  return fallbackTickerListing(
    searchTerm,
    queryIsin,
    'etf',
    'Could not find ETFs for that ISIN or ticker.',
  )
}

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

function scoreEquityListing(quote: YahooSearchQuote): number {
  if (quote.quoteType !== 'EQUITY' || !quote.symbol) {
    return Number.NEGATIVE_INFINITY
  }
  return scoreEuroListing(quote)
}

function pickPreferredEquityQuote(quotes: YahooSearchQuote[]): YahooSearchQuote | null {
  let best: YahooSearchQuote | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const quote of quotes) {
    const score = scoreEquityListing(quote)
    if (score > bestScore && quote.symbol) {
      best = quote
      bestScore = score
    }
  }
  return best
}

/** Stock listings matching an ISIN or ticker (Euro listings first). */
export async function searchEquityListings(
  query: string,
): Promise<ResolvedInstrument[]> {
  const queryIsin = parseIsinFromQuery(query)
  const normalized = normalizeQuery(query)
  if (!normalized && !queryIsin) {
    throw new Error('Enter an ISIN or ticker symbol.')
  }

  const searchTerm = queryIsin ?? normalized
  const quotes = await gatherYahooQuotesByName(
    searchTerm,
    queryIsin,
    pickPreferredEquityQuote,
  )
  const fromSearch = listListingsFromQuotes(
    quotes,
    queryIsin,
    'equity',
    scoreEquityListing,
  )
  if (fromSearch.length > 0) {
    return fromSearch
  }

  return fallbackTickerListing(
    searchTerm,
    queryIsin,
    'equity',
    'Could not find stocks for that ISIN or ticker.',
  )
}

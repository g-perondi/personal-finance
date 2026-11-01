import type { ResolvedInstrument } from '../types'
import {
  fallbackTickerListing,
  listListingsFromQuotes,
  normalizeQuery,
  scoreEuroListing,
  yahooSearchQuotes,
  type YahooSearchQuote,
} from './shared'

function scoreCryptoListing(quote: YahooSearchQuote): number {
  if (quote.quoteType !== 'CRYPTOCURRENCY' || !quote.symbol) {
    return Number.NEGATIVE_INFINITY
  }
  let score = scoreEuroListing(quote)
  if (quote.symbol.endsWith('-EUR')) {
    score += 120
  }
  if (quote.symbol.endsWith('-USD')) {
    score -= 30
  }
  return score
}

/** Crypto listings on Yahoo (prefers *-EUR pairs). */
export async function searchCryptoAssets(query: string): Promise<ResolvedInstrument[]> {
  const normalized = normalizeQuery(query)
  if (!normalized) {
    throw new Error('Enter a cryptocurrency name or symbol.')
  }

  const searchTerms = [normalized]
  if (!normalized.includes('-')) {
    searchTerms.push(`${normalized}-EUR`)
  }

  let quotes: YahooSearchQuote[] = []
  for (const term of searchTerms) {
    const batch = await yahooSearchQuotes(term)
    if (batch.length > 0) {
      quotes = batch
      break
    }
  }

  const fromSearch = listListingsFromQuotes(quotes, null, 'crypto', scoreCryptoListing)
  if (fromSearch.length > 0) {
    return fromSearch
  }

  const fallbackSymbol = normalized.includes('-') ? normalized : `${normalized}-EUR`
  return fallbackTickerListing(
    fallbackSymbol,
    null,
    'crypto',
    'Could not find cryptocurrencies for that search.',
  )
}

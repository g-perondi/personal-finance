import type { InstrumentAssetKind } from '../../db/repositories/model'
import { fetchYahooQuote, clearYahooQuoteMemoryCache } from './fetch/yahoo'
import type { QuoteFetchError, QuoteResult } from './types'

export type InstrumentQuoteRequest = {
  quoteSymbol: string
  assetKind: InstrumentAssetKind
}

export async function fetchQuotes(symbols: string[]): Promise<{
  quotes: Map<string, QuoteResult>
  errors: QuoteFetchError[]
}> {
  return fetchQuotesForInstruments(
    symbols.map((quoteSymbol) => ({
      quoteSymbol,
      assetKind: 'etf' as InstrumentAssetKind,
    })),
  )
}

export async function fetchQuotesForInstruments(
  requests: InstrumentQuoteRequest[],
): Promise<{
  quotes: Map<string, QuoteResult>
  errors: QuoteFetchError[]
}> {
  const unique = new Map<string, InstrumentAssetKind>()
  for (const request of requests) {
    const symbol = request.quoteSymbol.trim()
    if (!symbol) {
      continue
    }
    unique.set(symbol, request.assetKind)
  }

  const quotes = new Map<string, QuoteResult>()
  const errors: QuoteFetchError[] = []

  await Promise.all(
    [...unique.keys()].map(async (symbol) => {
      try {
        const quote = await fetchYahooQuote(symbol)
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
  clearYahooQuoteMemoryCache()
}

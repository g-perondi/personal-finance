import type { UtcIsoString } from '../../lib/datetime'

export type ResolvedInstrument = {
  quoteSymbol: string
  name: string
  isin: string | null
}

export type QuoteResult = {
  quoteSymbol: string
  priceEur: number
  fetchedAt: UtcIsoString
  source: string
}

export type QuoteFetchError = {
  quoteSymbol: string
  message: string
}

import type { InstrumentAssetKind } from '../../db/repositories/model'
import type { UtcIsoString } from '../../lib/datetime'

export type { InstrumentAssetKind as AssetKind }

export type ResolvedInstrument = {
  quoteSymbol: string
  name: string
  isin: string | null
  assetKind: InstrumentAssetKind
  /** Ticker / symbol for display (e.g. BTC for crypto). */
  marketSymbol?: string | null
  /** Yahoo exchange code when known (search UI only). */
  exchange?: string | null
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

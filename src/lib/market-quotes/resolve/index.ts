export { parseIsinFromQuery } from './shared'
export { searchEtfListings } from './etf'
export { searchEquityListings } from './equity'
export { searchCryptoAssets } from './crypto'
export { resolveInstrumentListing, searchInstrumentListings } from './search'

import { searchEtfListings } from './etf'

/** @deprecated Use resolveInstrumentListing(query, assetKind) */
export async function resolveInstrument(query: string) {
  const listings = await searchEtfListings(query)
  return listings[0]!
}

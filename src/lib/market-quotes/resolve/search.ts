import type { InstrumentAssetKind } from '../../../db/repositories/model'
import type { ResolvedInstrument } from '../types'
import { searchCryptoAssets } from './crypto'
import { searchEquityListings } from './equity'
import { searchEtfListings } from './etf'

export async function searchInstrumentListings(
  query: string,
  assetKind: InstrumentAssetKind,
): Promise<ResolvedInstrument[]> {
  switch (assetKind) {
    case 'etf':
      return searchEtfListings(query)
    case 'equity':
      return searchEquityListings(query)
    case 'crypto':
      return searchCryptoAssets(query)
    default:
      throw new Error(`Unknown asset kind: ${String(assetKind)}`)
  }
}

export async function resolveInstrumentListing(
  query: string,
  assetKind: InstrumentAssetKind,
): Promise<ResolvedInstrument> {
  const listings = await searchInstrumentListings(query, assetKind)
  return listings[0]!
}

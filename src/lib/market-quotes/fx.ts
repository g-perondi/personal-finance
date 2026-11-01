const CORS_PROXY = 'https://proxy.cors.dev/'
const FX_TTL_MS = 60 * 60 * 1000

const cache = new Map<string, { factor: number; fetchedAt: number }>()

function proxyUrl(target: string): string {
  return `${CORS_PROXY}${target}`
}

async function yahooRegularMarketPrice(symbol: string): Promise<number | null> {
  try {
    const response = await fetch(
      proxyUrl(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
      ),
    )
    if (!response.ok) {
      return null
    }
    const payload = (await response.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> }
    }
    const price = payload.chart?.result?.[0]?.meta?.regularMarketPrice
    return typeof price === 'number' && price > 0 ? price : null
  } catch {
    return null
  }
}

/** Yahoo uses GBp / GBX for pence; do not uppercase before this check. */
export function parseYahooQuoteCurrency(raw: string): {
  iso: string
  unitScale: number
} {
  const trimmed = raw.trim()
  if (trimmed === 'GBp' || trimmed === 'GBX') {
    return { iso: 'GBP', unitScale: 0.01 }
  }
  return { iso: trimmed.toUpperCase(), unitScale: 1 }
}

async function eurPerUnitFactor(iso: string): Promise<number | null> {
  if (iso === 'EUR') {
    return 1
  }

  const cached = cache.get(iso)
  if (cached && Date.now() - cached.fetchedAt < FX_TTL_MS) {
    return cached.factor
  }

  /** Yahoo cross rates are quoted as EURXXX=X → XXX per 1 EUR. */
  const crossByIso: Record<string, string> = {
    USD: 'EURUSD=X',
    GBP: 'EURGBP=X',
    CHF: 'EURCHF=X',
    PLN: 'EURPLN=X',
    SEK: 'EURSEK=X',
    NOK: 'EURNOK=X',
    DKK: 'EURDKK=X',
  }

  const cross = crossByIso[iso]
  if (!cross) {
    return null
  }

  const xxxPerEur = await yahooRegularMarketPrice(cross)
  if (!xxxPerEur || xxxPerEur <= 0) {
    return null
  }

  const factor = 1 / xxxPerEur
  cache.set(iso, { factor, fetchedAt: Date.now() })
  return factor
}

/** Convert a Yahoo quote amount to EUR (app display currency). */
export async function convertToEur(amount: number, currency: string): Promise<number> {
  const { iso, unitScale } = parseYahooQuoteCurrency(currency)
  const normalizedAmount = amount * unitScale
  if (iso === 'EUR') {
    return normalizedAmount
  }

  const factor = await eurPerUnitFactor(iso)
  if (factor === null) {
    throw new Error(`Could not convert ${iso} to EUR.`)
  }

  return normalizedAmount * factor
}

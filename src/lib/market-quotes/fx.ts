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

/** Multiply a price in `currency` to get EUR (app display currency). */
export async function convertToEur(amount: number, currency: string): Promise<number> {
  const code = currency.trim().toUpperCase()
  if (code === 'EUR') {
    return amount
  }

  const cached = cache.get(code)
  if (cached && Date.now() - cached.fetchedAt < FX_TTL_MS) {
    return amount * cached.factor
  }

  let factor: number | null = null

  if (code === 'USD') {
    const eurUsd = await yahooRegularMarketPrice('EURUSD=X')
    if (eurUsd) {
      factor = 1 / eurUsd
    }
  } else if (code === 'GBP') {
    const eurGbp = await yahooRegularMarketPrice('EURGBP=X')
    if (eurGbp) {
      factor = 1 / eurGbp
    }
  } else if (code === 'CHF') {
    const eurChf = await yahooRegularMarketPrice('EURCHF=X')
    if (eurChf) {
      factor = 1 / eurChf
    }
  }

  if (factor === null) {
    return amount
  }

  cache.set(code, { factor, fetchedAt: Date.now() })
  return amount * factor
}

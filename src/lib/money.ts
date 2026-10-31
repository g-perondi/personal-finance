const eurFormatter = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
})

export function formatCents(cents: number): string {
  return eurFormatter.format(cents / 100)
}

/** Parse user input (e.g. "12.50" or "12,50") to integer cents. */
export function parseInputToCents(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (normalized.length === 0) {
    return null
  }
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null
  }
  const value = Number.parseFloat(normalized)
  if (!Number.isFinite(value) || value < 0) {
    return null
  }
  return Math.round(value * 100)
}

export function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2)
}

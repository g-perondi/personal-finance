import {
  createPlainNumberFormatter,
  decimalSeparatorForInput,
  formatStoredEurAmount,
  normalizeAmountInput,
} from './locale-format'

export function formatCents(cents: number): string {
  return formatStoredEurAmount(cents / 100)
}

/** Parse user input to integer cents. */
export function parseInputToCents(raw: string): number | null {
  const normalized = normalizeAmountInput(raw)
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
  const plain = (cents / 100).toFixed(2)
  if (decimalSeparatorForInput() === ',') {
    return plain.replace('.', ',')
  }
  return plain
}

/** Per-unit prices (avg cost, NAV) — at most 4 decimal places. Stored in EUR. */
export function formatUnitPriceEur(priceEur: number): string {
  return formatStoredEurAmount(priceEur, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

/** Parse per-unit EUR input (up to 4 decimals) to cents per unit (may be fractional). */
export function parseInputToUnitPriceCents(raw: string): number | null {
  const normalized = normalizeAmountInput(raw)
  if (normalized.length === 0) {
    return null
  }
  if (!/^\d+(\.\d{0,4})?$/.test(normalized)) {
    return null
  }
  const value = Number.parseFloat(normalized)
  if (!Number.isFinite(value) || value <= 0) {
    return null
  }
  return value * 100
}

/** Plain numeric string for avg-cost / NAV inputs (2–4 decimal places, no grouping). */
export function unitPriceEurToInputValue(priceEur: number): string {
  if (!Number.isFinite(priceEur) || priceEur <= 0) {
    return ''
  }
  const formatted = createPlainNumberFormatter({
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
    useGrouping: false,
  }).format(priceEur)
  return formatted
}

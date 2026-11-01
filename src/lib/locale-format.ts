import type { DateFormatKey, NumberFormatKey } from '../db/repositories/app_setting'

let numberFormat: NumberFormatKey = 'comma_decimal'

export function applyNumberLocale(format: NumberFormatKey): void {
  numberFormat = format
}

export function getNumberFormatKey(): NumberFormatKey {
  return numberFormat
}

function intlLocaleForNumberFormat(format: NumberFormatKey): string {
  return format === 'comma_decimal' ? 'it-IT' : 'en-IE'
}

export function createCurrencyFormatter(options?: {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}): Intl.NumberFormat {
  return new Intl.NumberFormat(intlLocaleForNumberFormat(numberFormat), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: options?.minimumFractionDigits,
    maximumFractionDigits: options?.maximumFractionDigits,
  })
}

/** Format a stored EUR amount for display. */
export function formatStoredEurAmount(
  amountEur: number,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
  const min = options?.minimumFractionDigits ?? 2
  const max = options?.maximumFractionDigits ?? 2
  return createCurrencyFormatter({
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(amountEur)
}

export function createPlainNumberFormatter(options: {
  minimumFractionDigits: number
  maximumFractionDigits: number
  useGrouping?: boolean
}): Intl.NumberFormat {
  return new Intl.NumberFormat(intlLocaleForNumberFormat(numberFormat), {
    minimumFractionDigits: options.minimumFractionDigits,
    maximumFractionDigits: options.maximumFractionDigits,
    useGrouping: options.useGrouping ?? false,
  })
}

export function decimalSeparatorForInput(): '.' | ',' {
  return numberFormat === 'comma_decimal' ? ',' : '.'
}

export function normalizeAmountInput(raw: string): string {
  const trimmed = raw.trim().replace(/\s/g, '')
  if (numberFormat === 'comma_decimal') {
    return trimmed.replace(/\./g, '').replace(',', '.')
  }
  return trimmed.replace(/,/g, '')
}

const DATE_FORMAT_PATTERNS: Record<DateFormatKey, string> = {
  dd_slash_mm_yyyy: 'dd/MM/yyyy',
  mm_slash_dd_yyyy: 'MM/dd/yyyy',
  yyyy_dash_mm_dash_dd: 'yyyy-MM-dd',
  d_mmm_yyyy: 'd MMM yyyy',
}

let dateFormatKey: DateFormatKey = 'dd_slash_mm_yyyy'

export function applyDateDisplayFormat(key: DateFormatKey): void {
  dateFormatKey = key
}

export function getDateFormatKey(): DateFormatKey {
  return dateFormatKey
}

export function getDateDisplayPattern(): string {
  return DATE_FORMAT_PATTERNS[dateFormatKey]
}

export const DATE_FORMAT_OPTIONS: Array<{
  value: DateFormatKey
  label: string
  example: string
}> = [
  { value: 'dd_slash_mm_yyyy', label: 'DD/MM/YYYY', example: '15/09/2026' },
  { value: 'mm_slash_dd_yyyy', label: 'MM/DD/YYYY', example: '09/15/2026' },
  { value: 'yyyy_dash_mm_dash_dd', label: 'YYYY-MM-DD', example: '2026-09-15' },
  { value: 'd_mmm_yyyy', label: 'D MMM YYYY', example: '15 Sep 2026' },
]

export const NUMBER_FORMAT_OPTIONS: Array<{
  value: NumberFormatKey
  label: string
  example: string
}> = [
  { value: 'comma_decimal', label: '1.234,56', example: '1.234,56' },
  { value: 'dot_decimal', label: '1,234.56', example: '1,234.56' },
]

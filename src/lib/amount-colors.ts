/** Tailwind text classes for signed transaction amounts and dashboard tones. */
export const amountColorClass = {
  inflow: 'text-emerald-400',
  outflow: 'text-red-400',
  transfer: 'text-sky-400',
  investment: 'text-violet-400',
  savings: 'text-teal-400',
  wealth: 'text-yellow-400',
} as const

export type AmountColorTone = keyof typeof amountColorClass

/** Recharts stroke/fill hex aligned with Tailwind 400 palette. */
export const amountChartColor: Record<AmountColorTone, string> = {
  inflow: '#34d399',
  outflow: '#f87171',
  transfer: '#38bdf8',
  investment: '#a78bfa',
  savings: '#2dd4bf',
  wealth: '#facc15',
}

/** Wealth line chart (Total / Cash / Investment). */
export const wealthChartColor = {
  total: '#facc15',
  cash: amountChartColor.inflow,
  investment: amountChartColor.transfer,
} as const

export function signedAmountColorClass(
  cents: number,
  neutralClass = 'text-white',
): string {
  if (cents > 0) {
    return amountColorClass.inflow
  }
  if (cents < 0) {
    return amountColorClass.outflow
  }
  return neutralClass
}

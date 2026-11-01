import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Scale,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import type { RebalancingDirection, TransactionKind, TransferLeg } from '../../db/types'
import { formatCents } from '../../lib/money'
import { amountColorClass } from '../../lib/amount-colors'

export function transactionKindLabel(
  kind: TransactionKind,
  transferLeg: TransferLeg | null,
): string {
  if (kind === 'transfer') {
    return transferLeg === 'out' ? 'Transfer out' : 'Transfer in'
  }
  if (kind === 'rebalancing') {
    return 'Rebalancing'
  }
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

type KindVisual = {
  Icon: LucideIcon
  label: string
  badgeClass: string
  iconClass: string
}

export function transactionKindVisual(
  kind: TransactionKind,
  transferLeg: TransferLeg | null,
  rebalancingDirection: RebalancingDirection | null = null,
): KindVisual {
  if (kind === 'income') {
    return {
      Icon: ArrowDownLeft,
      label: 'Income',
      badgeClass: 'bg-emerald-500/15 ring-emerald-500/30',
      iconClass: 'text-emerald-400',
    }
  }
  if (kind === 'expense') {
    return {
      Icon: ArrowUpRight,
      label: 'Expense',
      badgeClass: 'bg-red-500/15 ring-red-500/30',
      iconClass: 'text-red-400',
    }
  }
  if (kind === 'investment') {
    return {
      Icon: TrendingUp,
      label: 'Investment',
      badgeClass: 'bg-sky-500/15 ring-sky-500/30',
      iconClass: 'text-sky-400',
    }
  }
  if (kind === 'transfer') {
    return {
      Icon: ArrowLeftRight,
      label: transferLeg === 'out' ? 'Transfer out' : 'Transfer in',
      badgeClass: 'bg-sky-500/15 ring-sky-500/30',
      iconClass: 'text-sky-400',
    }
  }
  if (kind === 'rebalancing') {
    const increase = rebalancingDirection === 'increase'
    return {
      Icon: Scale,
      label: 'Rebalancing',
      badgeClass: increase
        ? 'bg-emerald-500/15 ring-emerald-500/30'
        : 'bg-amber-500/15 ring-amber-500/30',
      iconClass: increase ? 'text-emerald-400' : 'text-amber-400',
    }
  }
  return {
    Icon: ArrowLeftRight,
    label: kind,
    badgeClass: 'bg-slate-500/15 ring-slate-500/30',
    iconClass: 'text-slate-400',
  }
}

export type TransactionAmountTone = 'inflow' | 'outflow' | 'transfer'

export function transactionAmountTone(
  kind: TransactionKind,
  transferLeg: TransferLeg | null,
  rebalancingDirection: RebalancingDirection | null = null,
): TransactionAmountTone {
  if (kind === 'transfer') {
    return transferLeg === 'in' ? 'inflow' : 'outflow'
  }
  if (kind === 'income') {
    return 'inflow'
  }
  if (kind === 'expense' || kind === 'investment') {
    return 'outflow'
  }
  if (kind === 'rebalancing') {
    return rebalancingDirection === 'increase' ? 'inflow' : 'outflow'
  }
  return 'outflow'
}

export function transactionAmountClassName(tone: TransactionAmountTone): string {
  return amountColorClass[tone === 'transfer' ? 'transfer' : tone]
}

export function transactionAmountPrefix(
  kind: TransactionKind,
  transferLeg: TransferLeg | null = null,
  rebalancingDirection: RebalancingDirection | null = null,
): string {
  if (kind === 'transfer') {
    return transferLeg === 'in' ? '+' : '−'
  }
  if (kind === 'income') {
    return '+'
  }
  if (kind === 'expense') {
    return '−'
  }
  if (kind === 'rebalancing') {
    return rebalancingDirection === 'increase' ? '+' : '−'
  }
  return ''
}

type TransactionAmountDisplayProps = {
  kind: TransactionKind
  transferLeg: TransferLeg | null
  rebalancingDirection?: RebalancingDirection | null
  amountCents: number
  className?: string
}

export function TransactionAmountDisplay({
  kind,
  transferLeg,
  rebalancingDirection = null,
  amountCents,
  className = '',
}: TransactionAmountDisplayProps) {
  const tone = transactionAmountTone(kind, transferLeg, rebalancingDirection)
  const prefix = transactionAmountPrefix(kind, transferLeg, rebalancingDirection)
  return (
    <span
      className={`font-medium tabular-nums ${transactionAmountClassName(tone)} ${className}`.trim()}
    >
      {prefix}
      {formatCents(amountCents)}
    </span>
  )
}

type TransactionKindDisplayProps = {
  kind: TransactionKind
  transferLeg: TransferLeg | null
  rebalancingDirection?: RebalancingDirection | null
  showLabel?: boolean
  compact?: boolean
}

export function TransactionKindDisplay({
  kind,
  transferLeg,
  rebalancingDirection = null,
  showLabel = true,
  compact = false,
}: TransactionKindDisplayProps) {
  const { Icon, label, badgeClass, iconClass } = transactionKindVisual(
    kind,
    transferLeg,
    rebalancingDirection,
  )
  const iconSize = compact ? 'size-3.5' : 'size-4'
  const pad = compact ? 'size-7' : 'size-8'

  return (
    <span
      className="inline-flex min-w-0 items-center gap-2"
      title={showLabel ? undefined : label}
    >
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${pad} ${badgeClass}`}
        title={label}
        aria-label={label}
      >
        <Icon className={`${iconSize} ${iconClass}`} aria-hidden />
      </span>
      {showLabel ? (
        <span className="truncate text-inherit capitalize">{label}</span>
      ) : null}
    </span>
  )
}

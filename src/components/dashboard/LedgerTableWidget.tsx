import { Link } from 'react-router-dom'
import {
  TransactionKindDisplay,
  TransactionAmountDisplay,
} from '../transactions/TransactionKindDisplay'
import type { LedgerRow } from '../../db/repositories/dashboard'
import { formatCalendarDateInRome } from '../../lib/datetime'

type LedgerTableWidgetProps = {
  title: string
  rows: LedgerRow[]
  totalCount: number
  viewAllHref: string
  emptyMessage?: string
  className?: string
}

export function LedgerTableWidget({
  title,
  rows,
  totalCount,
  viewAllHref,
  emptyMessage = 'No entries in this period.',
  className,
}: LedgerTableWidgetProps) {
  const sectionClass = [
    'flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30 p-4',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={sectionClass}>
      <h3 className="mb-4 shrink-0 text-sm font-semibold text-slate-200">{title}</h3>
      {rows.length === 0 ? (
        <p className="min-h-0 flex-1 text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="data-table-scroll-shell data-table-scroll-shell--embedded min-w-0">
          <table className="ledger-table data-table w-full text-left text-xs">
            <colgroup>
              <col className="ledger-col-icon" />
              <col className="ledger-col-amount" />
              <col className="ledger-col-date" />
              <col className="ledger-col-description" />
            </colgroup>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {rows.map((row) => (
                <tr key={row.id} className="data-table-row">
                  <td className="py-2">
                    <TransactionKindDisplay
                      kind={row.kind}
                      transferLeg={row.transferLeg}
                      rebalancingDirection={row.rebalancingDirection}
                      compact
                      showLabel={false}
                    />
                  </td>
                  <td className="money-cell py-2">
                    <TransactionAmountDisplay
                      kind={row.kind}
                      transferLeg={row.transferLeg}
                      rebalancingDirection={row.rebalancingDirection}
                      amountCents={row.amountCents}
                    />
                  </td>
                  <td className="py-2 whitespace-nowrap text-slate-400">
                    {formatCalendarDateInRome(row.transactionDate)}
                  </td>
                  <td className="truncate py-2 text-slate-400">
                    {row.description ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-auto shrink-0 pt-3 text-center">
        {totalCount > rows.length ? (
          <p className="mb-2 text-xs text-slate-500">
            Showing {rows.length} of {totalCount}
          </p>
        ) : null}
        <Link
          to={viewAllHref}
          className="inline-block text-sm font-medium text-slate-300 hover:text-white"
        >
          View all →
        </Link>
      </div>
    </section>
  )
}

import { Link } from 'react-router-dom'
import type { LedgerRow } from '../../db/repositories/dashboard'
import { formatCalendarDateInRome } from '../../lib/datetime'
import { formatCents } from '../../lib/money'

type LedgerTableWidgetProps = {
  title: string
  rows: LedgerRow[]
  totalCount: number
  viewAllHref: string
  emptyMessage?: string
  className?: string
}

function rowLabel(row: LedgerRow): string {
  if (row.kind === 'transfer') {
    return row.transferLeg === 'in' ? 'Transfer in' : 'Transfer out'
  }
  return row.kind.charAt(0).toUpperCase() + row.kind.slice(1)
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
    'flex h-full flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30 p-4',
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
        <div className="data-table-scroll-shell data-table-scroll-shell--embedded">
          <table className="data-table w-full table-fixed text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-500">
              <tr>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Account</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="money-cell pb-2 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="data-table-row border-t border-slate-800/80"
                >
                  <td className="py-2 pr-2">
                    {formatCalendarDateInRome(row.transactionDate)}
                  </td>
                  <td className="py-2 pr-2">{row.accountName}</td>
                  <td className="py-2 pr-2 text-slate-400">{rowLabel(row)}</td>
                  <td className="money-cell py-2 font-medium">
                    {formatCents(row.amountCents)}
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

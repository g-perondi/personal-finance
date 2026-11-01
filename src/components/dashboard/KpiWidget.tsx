import type { LucideIcon } from 'lucide-react'

type KpiItem = {
  label: string
  value: string
  icon: LucideIcon
  hint?: string
  valueClassName?: string
  iconClassName?: string
  hintClassName?: string
}

type KpiWidgetProps = {
  items: KpiItem[]
}

const KPI_ITEM_WIDTH =
  'w-[calc(50%-0.25rem)] basis-[calc(50%-0.25rem)] sm:w-[calc(25%-0.375rem)] sm:basis-[calc(25%-0.375rem)] md:w-[calc(12.5%-0.4375rem)] md:basis-[calc(12.5%-0.4375rem)]'

export function KpiWidget({ items }: KpiWidgetProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {items.map((item) => {
        const Icon = item.icon
        const accentClass =
          item.iconClassName ?? item.valueClassName ?? 'text-slate-400'

        return (
          <div
            key={item.label}
            className={`box-border min-w-0 shrink-0 grow-0 ${KPI_ITEM_WIDTH} rounded-xl border border-slate-800 bg-slate-900/50 px-2 py-2 text-center`}
          >
            <Icon className={`mx-auto h-4 w-4 ${accentClass}`} aria-hidden />
            <p className="mt-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
              {item.label}
            </p>
            <p
              className={`mt-1 text-base font-semibold tabular-nums ${item.valueClassName ?? 'text-white'}`}
            >
              {item.value}
            </p>
            {item.hint ? (
              <p className={`mt-0.5 text-xs ${item.hintClassName ?? 'text-slate-500'}`}>
                {item.hint}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

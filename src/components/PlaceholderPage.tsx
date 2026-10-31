type PlaceholderPageProps = {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="flex flex-1 flex-col p-8">
      <header className="mb-6 border-b border-slate-800 pb-4">
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
      </header>
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-12 text-center text-slate-500">
        Content coming in a later phase.
      </div>
    </div>
  )
}

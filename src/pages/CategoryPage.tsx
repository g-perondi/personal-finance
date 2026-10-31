import { useCallback, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Modal } from '../components/ui/Modal'
import { recurrenceKindLabel } from '../db/recurrence'
import type { CategoryType, RecurrenceKind } from '../db/types'
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../db/repositories/category'
import type { CategoryRecord } from '../db/repositories/model'
import { useDatabase } from '../hooks/useDatabase'

export function CategoryPage() {
  const db = useDatabase()
  const [refreshKey, setRefreshKey] = useState(0)
  const [filter, setFilter] = useState<CategoryType | 'all'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryRecord | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<CategoryType>('expense')
  const [defaultRecurrenceKind, setDefaultRecurrenceKind] = useState<
    RecurrenceKind | ''
  >('')
  const [error, setError] = useState<string | null>(null)

  const categories = useMemo(() => {
    void refreshKey
    if (filter === 'all') {
      return listCategories(db)
    }
    return listCategories(db, filter)
  }, [db, filter, refreshKey])

  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  function openCreate() {
    setEditing(null)
    setName('')
    setType(filter === 'all' ? 'expense' : filter)
    setDefaultRecurrenceKind('')
    setError(null)
    setModalOpen(true)
  }

  function openEdit(category: CategoryRecord) {
    setEditing(category)
    setName(category.name)
    setType(category.type)
    setDefaultRecurrenceKind(category.defaultRecurrenceKind ?? '')
    setError(null)
    setModalOpen(true)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    const defaultRecurrence =
      defaultRecurrenceKind === '' ? null : defaultRecurrenceKind
    try {
      if (editing) {
        updateCategory(db, editing.id, {
          name,
          defaultRecurrenceKind: defaultRecurrence,
        })
      } else {
        createCategory(db, { name, type, defaultRecurrenceKind: defaultRecurrence })
      }
      setModalOpen(false)
      bump()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    }
  }

  function handleDelete(category: CategoryRecord) {
    if (!window.confirm(`Delete category "${category.name}"?`)) {
      return
    }
    try {
      deleteCategory(db, category.id)
      bump()
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  return (
    <div className="flex flex-1 flex-col p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Categories</h2>
          <p className="mt-1 text-sm text-slate-400">
            Label income and expenses. Default recurrence also prefills investment
            entries (e.g. PAC).
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white"
          onClick={openCreate}
        >
          <Plus className="size-4" aria-hidden />
          Add category
        </button>
      </header>

      <div className="mb-4 flex gap-2">
        {(['all', 'expense', 'income'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
              filter === value
                ? 'bg-slate-100 text-slate-900'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            onClick={() => setFilter(value)}
          >
            {value}
          </button>
        ))}
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-slate-500">No categories yet.</p>
      ) : (
        <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-slate-200"
            >
              <div>
                <span className="font-medium text-white">{category.name}</span>
                <span className="ml-2 text-xs text-slate-500 uppercase">
                  {category.type}
                </span>
                {category.defaultRecurrenceKind ? (
                  <span className="ml-2 text-xs text-slate-500">
                    · {recurrenceKindLabel(category.defaultRecurrenceKind)}
                  </span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                  aria-label={`Edit ${category.name}`}
                  onClick={() => openEdit(category)}
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-red-300"
                  aria-label={`Delete ${category.name}`}
                  onClick={() => handleDelete(category)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        title={editing ? 'Edit category' : 'Add category'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Name</span>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Type</span>
            <select
              value={type}
              disabled={editing !== null}
              onChange={(event) => setType(event.target.value as CategoryType)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-50"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Default recurrence (optional)</span>
            <select
              value={defaultRecurrenceKind}
              onChange={(event) =>
                setDefaultRecurrenceKind(event.target.value as RecurrenceKind | '')
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            >
              <option value="">None</option>
              <option value="recurring">Recurring</option>
              <option value="variable">Variable</option>
            </select>
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            className="rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-900 hover:bg-white"
          >
            Save
          </button>
        </form>
      </Modal>
    </div>
  )
}

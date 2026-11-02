import { useCallback, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Modal, ModalActions } from '../components/ui/Modal'
import { FormError } from '../components/ui/FormError'
import { recurrenceKindLabel } from '../db/recurrence'
import type { CategoryType, RecurrenceKind } from '../db/types'
import {
  createCategory,
  deleteCategory,
  listUserCategories,
  updateCategory,
} from '../db/repositories/category'
import type { CategoryRecord } from '../db/repositories/model'
import { useDatabase } from '../hooks/useDatabase'
import { focusFormField, formFieldClass } from '../lib/form-validation'

const CATEGORY_NAME_FIELD = {
  expense: 'category-name-expense',
  income: 'category-name-income',
} as const

type CategoryModalState = {
  editing: CategoryRecord | null
}

function CategoryColumn({
  title,
  categoryType,
  categories,
  onEdit,
  onDelete,
  onAdd,
}: {
  title: string
  categoryType: CategoryType
  categories: CategoryRecord[]
  onEdit: (category: CategoryRecord) => void
  onDelete: (category: CategoryRecord) => void
  onAdd: (type: CategoryType) => void
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col">
      <h3 className="mb-3 shrink-0 text-lg font-medium text-white">{title}</h3>
      <div className="data-table-scroll-shell flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="data-table-scroll-body">
          <ul className="divide-y divide-slate-800">
            {categories.map((category) => (
              <li
                key={category.id}
                className="data-table-row flex items-center justify-between gap-4 px-4 py-3 text-sm text-slate-200"
              >
                <div className="min-w-0">
                  <span className="font-medium text-white">{category.name}</span>
                  {category.defaultRecurrenceKind === 'recurring' ? (
                    <span className="ml-2 text-xs text-slate-500">
                      {recurrenceKindLabel('recurring')}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                    aria-label={`Edit ${category.name}`}
                    onClick={() => onEdit(category)}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-red-300"
                    aria-label={`Delete ${category.name}`}
                    onClick={() => onDelete(category)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          className="data-table-row shrink-0 border-t border-slate-800 px-4 py-3 text-slate-400 hover:bg-slate-800/55 hover:text-slate-200"
          aria-label={`Add ${title.toLowerCase()} category`}
          onClick={() => onAdd(categoryType)}
        >
          <span className="flex w-full items-center justify-center">
            <Plus className="size-5" aria-hidden />
          </span>
        </button>
      </div>
    </section>
  )
}

type CategoryEditorModalProps = {
  categoryType: CategoryType
  modal: CategoryModalState | null
  onClose: () => void
  onSaved: () => void
}

function CategoryEditorForm({
  categoryType,
  editing,
  onClose,
  onSaved,
}: {
  categoryType: CategoryType
  editing: CategoryRecord | null
  onClose: () => void
  onSaved: () => void
}) {
  const db = useDatabase()
  const nameFieldId = CATEGORY_NAME_FIELD[categoryType]

  const [name, setName] = useState(() => editing?.name ?? '')
  const [isRecurrent, setIsRecurrent] = useState(
    () => editing?.defaultRecurrenceKind === 'recurring',
  )
  const [error, setError] = useState<string | null>(null)
  const [invalidFieldId, setInvalidFieldId] = useState<string | null>(null)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Name is required.')
      setInvalidFieldId(nameFieldId)
      focusFormField(nameFieldId)
      return
    }
    setInvalidFieldId(null)
    const defaultRecurrence: RecurrenceKind = isRecurrent ? 'recurring' : 'variable'
    try {
      if (editing) {
        updateCategory(db, editing.id, {
          name,
          defaultRecurrenceKind: defaultRecurrence,
        })
      } else {
        createCategory(db, {
          name,
          type: categoryType,
          defaultRecurrenceKind: defaultRecurrence,
        })
      }
      onClose()
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    }
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-300">Name</span>
        <input
          id={nameFieldId}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (invalidFieldId === nameFieldId) {
              setInvalidFieldId(null)
              setError(null)
            }
          }}
          className={formFieldClass('form-field', nameFieldId, invalidFieldId)}
        />
      </label>
      <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-300">
        <input
          type="checkbox"
          className="form-checkbox"
          checked={isRecurrent}
          onChange={(event) => setIsRecurrent(event.target.checked)}
        />
        <span>Recurrent</span>
      </label>
      <FormError message={error} />
      <ModalActions onCancel={onClose} />
    </form>
  )
}

function CategoryEditorModal({
  categoryType,
  modal,
  onClose,
  onSaved,
}: CategoryEditorModalProps) {
  const editing = modal?.editing ?? null
  const open = modal !== null
  const title = editing
    ? `Edit ${categoryType} category`
    : `Add ${categoryType} category`

  return (
    <Modal title={title} open={open} onClose={onClose}>
      {open ? (
        <CategoryEditorForm
          key={editing?.id ?? 'new'}
          categoryType={categoryType}
          editing={editing}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Modal>
  )
}

export function CategoryPage() {
  const db = useDatabase()
  const [refreshKey, setRefreshKey] = useState(0)
  const [expenseModal, setExpenseModal] = useState<CategoryModalState | null>(null)
  const [incomeModal, setIncomeModal] = useState<CategoryModalState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CategoryRecord | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const expenseCategories = useMemo(() => {
    void refreshKey
    return listUserCategories(db, 'expense')
  }, [db, refreshKey])

  const incomeCategories = useMemo(() => {
    void refreshKey
    return listUserCategories(db, 'income')
  }, [db, refreshKey])

  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  function openCreateForType(categoryType: CategoryType) {
    if (categoryType === 'expense') {
      setExpenseModal({ editing: null })
    } else {
      setIncomeModal({ editing: null })
    }
  }

  function openEdit(category: CategoryRecord) {
    if (category.type === 'expense') {
      setExpenseModal({ editing: category })
    } else {
      setIncomeModal({ editing: category })
    }
  }

  function closeDeleteModal() {
    setDeleteTarget(null)
    setDeleteError(null)
  }

  function openDeleteModal(category: CategoryRecord) {
    setDeleteError(null)
    setDeleteTarget(category)
  }

  function confirmDeleteCategory() {
    if (!deleteTarget) {
      return
    }
    try {
      deleteCategory(db, deleteTarget.id)
      closeDeleteModal()
      bump()
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  return (
    <div className="app-page p-8">
      <header className="mb-6 shrink-0 border-b border-slate-800 pb-4">
        <h2 className="text-2xl font-semibold text-white">Categories</h2>
      </header>

      <div className="app-page-scroll-ceiling">
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-2 gap-6 overflow-hidden">
          <CategoryColumn
            title="Expenses"
            categoryType="expense"
            categories={expenseCategories}
            onEdit={openEdit}
            onDelete={openDeleteModal}
            onAdd={openCreateForType}
          />
          <CategoryColumn
            title="Income"
            categoryType="income"
            categories={incomeCategories}
            onEdit={openEdit}
            onDelete={openDeleteModal}
            onAdd={openCreateForType}
          />
        </div>
      </div>

      <CategoryEditorModal
        categoryType="expense"
        modal={expenseModal}
        onClose={() => setExpenseModal(null)}
        onSaved={bump}
      />
      <CategoryEditorModal
        categoryType="income"
        modal={incomeModal}
        onClose={() => setIncomeModal(null)}
        onSaved={bump}
      />

      <Modal
        title="Delete category"
        open={deleteTarget !== null}
        onClose={closeDeleteModal}
      >
        {deleteTarget ? (
          <>
            <p className="text-sm text-slate-300">
              Remove this category? You cannot undo this. Categories used by
              transactions cannot be deleted.
            </p>
            <dl className="mt-4 space-y-2 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Name</dt>
                <dd className="max-w-56 truncate text-right font-medium text-white">
                  {deleteTarget.name}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Type</dt>
                <dd className="text-right text-slate-200 capitalize">
                  {deleteTarget.type}
                </dd>
              </div>
              {deleteTarget.defaultRecurrenceKind === 'recurring' ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Recurrence</dt>
                  <dd className="text-right text-slate-200">
                    {recurrenceKindLabel('recurring')}
                  </dd>
                </div>
              ) : null}
            </dl>
            <FormError message={deleteError} className="mt-3" />
            <div className="mt-6">
              <ModalActions
                onCancel={closeDeleteModal}
                submitLabel="Delete"
                submitType="button"
                onSubmit={confirmDeleteCategory}
                submitClassName="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              />
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  )
}

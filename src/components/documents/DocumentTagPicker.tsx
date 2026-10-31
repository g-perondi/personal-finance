import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { DocumentCategoryRecord } from '../../db/repositories/model'

type DocumentTagPickerProps = {
  /** Tags currently used on any document (autocomplete). */
  knownTags: DocumentCategoryRecord[]
  selectedTagNames: string[]
  onChangeSelectedTagNames: (names: string[]) => void
}

function normalizeTagSearch(value: string): string {
  return value.trim().toLowerCase()
}

function tagNameSelected(selectedTagNames: string[], name: string): boolean {
  const key = normalizeTagSearch(name)
  return selectedTagNames.some((selected) => normalizeTagSearch(selected) === key)
}

export function DocumentTagPicker({
  knownTags,
  selectedTagNames,
  onChangeSelectedTagNames,
}: DocumentTagPickerProps) {
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)

  const normalizedQuery = normalizeTagSearch(query)

  const searchableTags = useMemo(() => {
    return knownTags.filter((tag) => {
      if (tagNameSelected(selectedTagNames, tag.name)) {
        return false
      }
      if (normalizedQuery.length === 0) {
        return true
      }
      return tag.name.toLowerCase().includes(normalizedQuery)
    })
  }, [knownTags, selectedTagNames, normalizedQuery])

  const exactKnownMatch = useMemo(() => {
    if (normalizedQuery.length === 0) {
      return null
    }
    return knownTags.find((tag) => tag.name.toLowerCase() === normalizedQuery) ?? null
  }, [knownTags, normalizedQuery])

  const showAddNewOption =
    normalizedQuery.length > 0 &&
    !tagNameSelected(selectedTagNames, query.trim()) &&
    exactKnownMatch === null

  function addTagName(name: string) {
    const trimmed = name.trim()
    if (!trimmed || tagNameSelected(selectedTagNames, trimmed)) {
      return
    }
    onChangeSelectedTagNames([...selectedTagNames, trimmed])
    setQuery('')
    setListOpen(false)
  }

  function removeTagName(name: string) {
    const key = normalizeTagSearch(name)
    onChangeSelectedTagNames(
      selectedTagNames.filter((selected) => normalizeTagSearch(selected) !== key),
    )
  }

  function handleAddFromQuery() {
    if (normalizedQuery.length === 0) {
      return
    }
    if (exactKnownMatch) {
      addTagName(exactKnownMatch.name)
      return
    }
    addTagName(query.trim())
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return
    }
    event.preventDefault()
    if (searchableTags.length === 1) {
      addTagName(searchableTags[0]!.name)
      return
    }
    handleAddFromQuery()
  }

  const showDropdown = listOpen && (searchableTags.length > 0 || showAddNewOption)

  return (
    <fieldset className="flex flex-col gap-3 text-sm">
      <legend className="text-slate-300">Tags (optional)</legend>

      {selectedTagNames.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedTagNames.map((name) => (
            <span
              key={name.toLowerCase()}
              className="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-800 py-0.5 pr-1 pl-2.5 text-xs font-medium text-slate-100"
            >
              {name}
              <button
                type="button"
                className="rounded-full p-0.5 text-slate-400 hover:bg-slate-700 hover:text-white"
                aria-label={`Remove tag ${name}`}
                onClick={() => removeTagName(name)}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <input
          value={query}
          placeholder="Search tags or type a name"
          onChange={(event) => {
            setQuery(event.target.value)
            setListOpen(true)
          }}
          onFocus={() => setListOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setListOpen(false), 150)
          }}
          onKeyDown={handleSearchKeyDown}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-500"
        />
        {showDropdown ? (
          <ul
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 py-1 shadow-xl"
            role="listbox"
          >
            {searchableTags.map((tag) => (
              <li key={tag.id} role="option">
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addTagName(tag.name)}
                >
                  {tag.name}
                </button>
              </li>
            ))}
            {showAddNewOption ? (
              <li role="option">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-200 hover:bg-slate-800"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={handleAddFromQuery}
                >
                  <Plus className="size-4 shrink-0 text-slate-400" aria-hidden />
                  Add tag &quot;{query.trim()}&quot;
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </fieldset>
  )
}

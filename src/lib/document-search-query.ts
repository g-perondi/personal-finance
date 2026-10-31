const LIKE_ESCAPE = '\\'

/** Split user search text into normalized tokens (letters/numbers). */
export function tokenizeSearchQuery(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) {
    return []
  }
  return trimmed
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0)
}

export function likePatternForToken(token: string): string {
  const escaped = token.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  return `%${escaped}%`
}

/** Append AND clauses for each token (LIKE on document fields + tag names). */
export function appendDocumentSearchClauses(
  clauses: string[],
  params: (string | number)[],
  searchQuery: string | null | undefined,
): void {
  for (const token of tokenizeSearchQuery(searchQuery ?? '')) {
    const pattern = likePatternForToken(token)
    clauses.push(`(
      title LIKE ? ESCAPE '${LIKE_ESCAPE}' COLLATE NOCASE OR
      COALESCE(note, '') LIKE ? ESCAPE '${LIKE_ESCAPE}' COLLATE NOCASE OR
      file_name LIKE ? ESCAPE '${LIKE_ESCAPE}' COLLATE NOCASE OR
      id IN (
        SELECT document_tag.document_id
        FROM document_tag
        INNER JOIN document_category
          ON document_category.id = document_tag.document_category_id
        WHERE document_category.name LIKE ? ESCAPE '${LIKE_ESCAPE}' COLLATE NOCASE
      )
    )`)
    params.push(pattern, pattern, pattern, pattern)
  }
}

/** Append AND clauses for each token (LIKE on joined transaction list fields). */
export function appendTransactionSearchClauses(
  clauses: string[],
  params: (string | number)[],
  searchQuery: string | null | undefined,
): void {
  for (const token of tokenizeSearchQuery(searchQuery ?? '')) {
    const pattern = likePatternForToken(token)
    clauses.push(`(
      COALESCE(t.description, '') LIKE ? ESCAPE '${LIKE_ESCAPE}' COLLATE NOCASE OR
      a.name LIKE ? ESCAPE '${LIKE_ESCAPE}' COLLATE NOCASE OR
      COALESCE(c.name, '') LIKE ? ESCAPE '${LIKE_ESCAPE}' COLLATE NOCASE
    )`)
    params.push(pattern, pattern, pattern)
  }
}

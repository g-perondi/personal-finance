/** Single path segment (no directory separators or parent refs). */
export function isSafePathSegment(segment: string): boolean {
  const trimmed = segment.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    return false
  }
  if (/[/\\]/.test(trimmed) || trimmed.includes('\0')) {
    return false
  }
  if (trimmed.includes('..')) {
    return false
  }
  return true
}

export function assertSafePathSegment(segment: string, label: string): string {
  if (!isSafePathSegment(segment)) {
    throw new Error(`Invalid ${label}.`)
  }
  return segment.trim()
}

/** Relative path under the data directory root (POSIX-style segments). */
export function assertSafeDataDirectoryRelativePath(relativePath: string): void {
  const normalized = relativePath.replace(/\\/g, '/').trim()
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) {
    throw new Error('Invalid path.')
  }
  for (const part of normalized.split('/')) {
    if (!part || part === '.' || part === '..') {
      throw new Error('Invalid path.')
    }
    if (!isSafePathSegment(part)) {
      throw new Error('Invalid path.')
    }
  }
}

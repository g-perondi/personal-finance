const CORS_PROXY = 'https://proxy.cors.dev/'

export function proxyUrl(target: string): string {
  return `${CORS_PROXY}${target}`
}

/** Avoid uncaught network/CORS errors in the console breaking the fallback chain. */
export async function fetchJsonSafe<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return null
    }
    return (await response.json()) as T
  } catch {
    return null
  }
}

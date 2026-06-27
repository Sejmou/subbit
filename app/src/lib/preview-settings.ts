const KEY = 'subbit:previewEnabled'

/** Default on — subtitle editors expect to see lines on picture. */
export function readPreviewEnabled(): boolean {
  try {
    const value = localStorage.getItem(KEY)
    if (value === null) return true
    return value === 'true'
  } catch {
    return true
  }
}

export function writePreviewEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, String(enabled))
  } catch {
    /* private browsing / quota — ignore */
  }
}

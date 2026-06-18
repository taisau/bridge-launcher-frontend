let _localStorageAvailable: boolean | null = null

export function safeGetStorage(key: string): string | null {
  if (_localStorageAvailable === false) return null
  try {
    const val = localStorage.getItem(key)
    _localStorageAvailable = true
    return val
  } catch {
    _localStorageAvailable = false
    return null
  }
}

export function safeSetStorage(key: string, value: string): void {
  if (_localStorageAvailable === false) return
  try {
    localStorage.setItem(key, value)
    _localStorageAvailable = true
  } catch {
    _localStorageAvailable = false
  }
}

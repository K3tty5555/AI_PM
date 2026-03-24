const LOG_KEY = "app-error-log"
const MAX_ENTRIES = 50
const MAX_ENTRY_LENGTH = 2000

export interface ErrorLogEntry {
  timestamp: string
  cmd: string
  message: string
  path: string
}

export function logError(err: unknown): void {
  try {
    const entry: ErrorLogEntry = {
      timestamp: new Date().toISOString(),
      cmd: err instanceof Error && "cmd" in err ? (err as { cmd: string }).cmd : "unknown",
      message: String(err instanceof Error ? err.message : err).slice(0, MAX_ENTRY_LENGTH),
      path: window.location.hash || window.location.pathname,
    }
    const raw = localStorage.getItem(LOG_KEY)
    const log: ErrorLogEntry[] = raw ? JSON.parse(raw) : []
    log.push(entry)
    if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES)
    localStorage.setItem(LOG_KEY, JSON.stringify(log))
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function getErrorLog(): ErrorLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function clearErrorLog(): void {
  localStorage.removeItem(LOG_KEY)
}

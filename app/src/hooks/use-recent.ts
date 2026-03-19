import { useState, useEffect, useCallback } from "react"

export interface RecentItem {
  path: string      // React Router path
  label: string     // display name
  timestamp: number
}

const STORAGE_KEY = "recent-items"
const MAX_ITEMS = 5
const CHANGE_EVENT = "recent-changed"

function readRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeRecent(items: RecentItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function useRecent() {
  const [recentItems, setRecentItems] = useState<RecentItem[]>(readRecent)

  // Sync across tabs and same-tab components
  useEffect(() => {
    const sync = () => setRecentItems(readRecent())
    window.addEventListener("storage", sync)
    window.addEventListener(CHANGE_EVENT, sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener(CHANGE_EVENT, sync)
    }
  }, [])

  const recordVisit = useCallback((path: string, label: string) => {
    setRecentItems((prev) => {
      // Remove duplicate if exists, then prepend
      const filtered = prev.filter((item) => item.path !== path)
      const next = [{ path, label, timestamp: Date.now() }, ...filtered].slice(0, MAX_ITEMS)
      writeRecent(next)
      return next
    })
  }, [])

  return { recentItems, recordVisit }
}

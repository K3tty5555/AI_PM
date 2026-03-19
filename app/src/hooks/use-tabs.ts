import { useState, useEffect, useCallback, useRef } from "react"

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Tab {
  id: string        // unique tab ID
  label: string     // display name
  path: string      // React Router path
  closable: boolean // Dashboard tab is not closable
}

// ─── Constants ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "open-tabs"
const MAX_TABS = 8
const CHANGE_EVENT = "tabs-changed"

const DASHBOARD_TAB: Tab = {
  id: "tab-dashboard",
  label: "Dashboard",
  path: "/",
  closable: false,
}

// ─── Storage helpers ───────────────────────────────────────────────────────

function readTabs(): Tab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [DASHBOARD_TAB]
    const parsed = JSON.parse(raw) as Tab[]
    // Ensure dashboard tab is always present and first
    if (!parsed.some((t) => t.path === "/")) {
      return [DASHBOARD_TAB, ...parsed]
    }
    return parsed
  } catch {
    return [DASHBOARD_TAB]
  }
}

function writeTabs(tabs: Tab[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

let tabCounter = Date.now()
function nextId(): string {
  return `tab-${++tabCounter}`
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>(readTabs)
  const [activeTabId, setActiveTabIdState] = useState<string | null>(null)

  // Ref to skip addTab when navigation was triggered by a tab click
  const isTabNavigationRef = useRef(false)

  // Sync across same-tab components
  useEffect(() => {
    const sync = () => setTabs(readTabs())
    window.addEventListener("storage", sync)
    window.addEventListener(CHANGE_EVENT, sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener(CHANGE_EVENT, sync)
    }
  }, [])

  /** Add a tab or activate an existing one matching the given path. */
  const addTab = useCallback((path: string, label: string) => {
    setTabs((prev) => {
      // If a tab with this path already exists, just activate it
      const existing = prev.find((t) => t.path === path)
      if (existing) {
        setActiveTabIdState(existing.id)
        return prev
      }

      // Create new tab
      const newTab: Tab = {
        id: path === "/" ? "tab-dashboard" : nextId(),
        label,
        path,
        closable: path !== "/",
      }

      let next: Tab[]
      if (prev.length >= MAX_TABS) {
        // Find the oldest non-active, closable tab to replace
        const activeId = activeTabId // captured closure
        const replaceIndex = prev.findIndex(
          (t) => t.closable && t.id !== activeId,
        )
        if (replaceIndex !== -1) {
          next = [...prev]
          next[replaceIndex] = newTab
        } else {
          // All tabs are non-closable or active; just append (shouldn't happen normally)
          next = [...prev, newTab]
        }
      } else {
        next = [...prev, newTab]
      }

      writeTabs(next)
      setActiveTabIdState(newTab.id)
      return next
    })
  }, [activeTabId])

  /** Close a tab. Activates adjacent tab if the closed one was active. */
  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === id)
      if (!tab || !tab.closable) return prev

      const index = prev.indexOf(tab)
      const next = prev.filter((t) => t.id !== id)
      writeTabs(next)

      // If the closed tab was active, activate an adjacent one
      setActiveTabIdState((currentActive) => {
        if (currentActive === id) {
          // Prefer left neighbor, then right, then first
          const newActive = next[Math.min(index, next.length - 1)] ?? next[0]
          return newActive?.id ?? null
        }
        return currentActive
      })

      return next
    })
  }, [])

  /** Close all tabs except the specified one (and the dashboard). */
  const closeOtherTabs = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id === id || !t.closable)
      writeTabs(next)
      setActiveTabIdState(id)
      return next
    })
  }, [])

  /** Close all tabs to the right of the specified one. */
  const closeTabsToRight = useCallback((id: string) => {
    setTabs((prev) => {
      const index = prev.findIndex((t) => t.id === id)
      if (index === -1) return prev
      const next = prev.filter((t, i) => i <= index || !t.closable)
      writeTabs(next)

      // If active tab was to the right and got closed, activate this tab
      setActiveTabIdState((currentActive) => {
        if (!next.some((t) => t.id === currentActive)) {
          return id
        }
        return currentActive
      })

      return next
    })
  }, [])

  /** Set the active tab by ID. */
  const setActiveTab = useCallback((id: string) => {
    setActiveTabIdState(id)
  }, [])

  /** Reorder tabs via drag and drop. */
  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      if (fromIndex === toIndex) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      writeTabs(next)
      return next
    })
  }, [])

  return {
    tabs,
    activeTabId,
    addTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    setActiveTab,
    reorderTabs,
    isTabNavigationRef,
  }
}

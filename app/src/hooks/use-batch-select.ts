import { useState, useCallback, useRef, useEffect } from "react"

interface UseBatchSelectOptions {
  items: { id: string }[]
}

export function useBatchSelect({ items }: UseBatchSelectOptions) {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedRef = useRef<string | null>(null)

  // Exit selection mode clears selection
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
    lastClickedRef.current = null
  }, [])

  const enterSelectionMode = useCallback(() => {
    setSelectionMode(true)
  }, [])

  const toggleSelect = useCallback(
    (id: string, shiftKey = false) => {
      setSelectedIds((prev) => {
        const next = new Set(prev)

        if (shiftKey && lastClickedRef.current) {
          // Range select
          const ids = items.map((i) => i.id)
          const start = ids.indexOf(lastClickedRef.current)
          const end = ids.indexOf(id)
          if (start !== -1 && end !== -1) {
            const [from, to] = start < end ? [start, end] : [end, start]
            for (let i = from; i <= to; i++) {
              next.add(ids[i])
            }
          }
        } else {
          if (next.has(id)) {
            next.delete(id)
          } else {
            next.add(id)
          }
        }

        lastClickedRef.current = id
        return next
      })

      // Auto-enter selection mode on first select
      setSelectionMode(true)
    },
    [items],
  )

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((i) => i.id)))
  }, [items])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === items.length) {
      deselectAll()
    } else {
      selectAll()
    }
  }, [selectedIds.size, items.length, selectAll, deselectAll])

  // Auto-exit when selection becomes empty
  useEffect(() => {
    if (selectionMode && selectedIds.size === 0 && lastClickedRef.current !== null) {
      // Don't exit immediately — only if user deselected everything manually
      // We keep mode on so user can still click to select
    }
  }, [selectionMode, selectedIds.size])

  // Keyboard: Esc to exit
  useEffect(() => {
    if (!selectionMode) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        exitSelectionMode()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [selectionMode, exitSelectionMode])

  return {
    selectionMode,
    selectedIds,
    enterSelectionMode,
    exitSelectionMode,
    toggleSelect,
    selectAll,
    deselectAll,
    toggleSelectAll,
    isAllSelected: items.length > 0 && selectedIds.size === items.length,
  }
}

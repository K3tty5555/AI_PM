import { useEffect, useRef } from "react"

export interface HotkeyDef {
  key: string          // lowercase key: 'k', 'b', ',', '[', ']', 'd', 'n', '1'-'9'
  meta?: boolean       // Cmd on Mac (metaKey)
  shift?: boolean
  handler: () => void
  description: string  // for command palette display
  group?: string       // command group: '导航', '视图', '操作'
}

/**
 * Global keyboard shortcut hook.
 * Skips events when focus is in input/textarea/contenteditable (except Escape).
 * Uses latest-ref pattern to avoid stale closures.
 */
export function useHotkeys(hotkeys: HotkeyDef[]) {
  const hotkeysRef = useRef(hotkeys)
  hotkeysRef.current = hotkeys

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      const isEditable =
        tagName === "input" ||
        tagName === "textarea" ||
        target?.isContentEditable === true

      // Allow Escape even when in editable fields
      if (isEditable && e.key !== "Escape") return

      for (const def of hotkeysRef.current) {
        const keyMatch = e.key.toLowerCase() === def.key.toLowerCase()
        const metaMatch = def.meta ? e.metaKey : !e.metaKey
        const shiftMatch = def.shift ? e.shiftKey : !e.shiftKey

        if (keyMatch && metaMatch && shiftMatch) {
          e.preventDefault()
          e.stopPropagation()
          def.handler()
          return
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [])
}

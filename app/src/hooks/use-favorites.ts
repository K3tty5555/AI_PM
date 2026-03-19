import { useState, useEffect, useCallback } from "react"

const STORAGE_KEY = "favorite-projects"
const MAX_FAVORITES = 5
const CHANGE_EVENT = "favorites-changed"

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeFavorites(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  // Notify other components in the same tab
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(readFavorites)

  // Sync across tabs via `storage` event, and across same-tab components via custom event
  useEffect(() => {
    const sync = () => setFavorites(readFavorites())
    window.addEventListener("storage", sync)
    window.addEventListener(CHANGE_EVENT, sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener(CHANGE_EVENT, sync)
    }
  }, [])

  const isFavorite = useCallback(
    (id: string) => favorites.includes(id),
    [favorites],
  )

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      let next: string[]
      if (prev.includes(id)) {
        next = prev.filter((f) => f !== id)
      } else {
        next = [id, ...prev].slice(0, MAX_FAVORITES)
      }
      writeFavorites(next)
      return next
    })
  }, [])

  return { favorites, isFavorite, toggleFavorite }
}

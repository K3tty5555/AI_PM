import { useState, useEffect, useCallback } from "react"

export type ThemePreference = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

const STORAGE_KEY = "app-theme"

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference
}

function applyTheme(resolved: ResolvedTheme) {
  const html = document.documentElement
  html.classList.remove("theme-light", "theme-dark")
  html.classList.add(`theme-${resolved}`)
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    return (localStorage.getItem(STORAGE_KEY) as ThemePreference) ?? "light"
  })

  const resolved = resolve(preference)

  // Apply theme class whenever resolved value changes
  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  // Listen for system preference changes when in "system" mode
  useEffect(() => {
    if (preference !== "system") return

    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applyTheme(getSystemTheme())
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [preference])

  const setTheme = useCallback((next: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, next)
    setPreference(next)
  }, [])

  // Toggle: light ↔ dark
  const cycleTheme = useCallback(() => {
    setTheme(preference === "dark" ? "light" : "dark")
  }, [preference, setTheme])

  return { preference, resolved, setTheme, cycleTheme }
}

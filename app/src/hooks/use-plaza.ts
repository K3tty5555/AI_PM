import { useState, useEffect } from "react"
import { api, type PlazaManifest } from "@/lib/tauri-api"

export function usePlaza() {
  const [manifest, setManifest] = useState<PlazaManifest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.loadPlazaManifest()
      .then((m) => setManifest(m))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return { manifest, loading, error }
}

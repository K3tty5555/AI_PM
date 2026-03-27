import { useState, useCallback, useRef } from "react"
import { api, type GenerateIllustrationArgs, type IllustrationResult } from "@/lib/tauri-api"

export function useIllustration() {
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<IllustrationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  const generate = useCallback(async (args: GenerateIllustrationArgs) => {
    setGenerating(true)
    setResult(null)
    setError(null)
    cancelledRef.current = false

    try {
      const res = await api.generateIllustration(args)
      if (cancelledRef.current) return
      setResult(res)
    } catch (err) {
      if (cancelledRef.current) return
      setError(typeof err === "string" ? err : err instanceof Error ? err.message : String(err))
    } finally {
      if (!cancelledRef.current) {
        setGenerating(false)
      }
    }
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    setGenerating(false)
  }, [])

  const reset = useCallback(() => {
    cancelledRef.current = true
    setGenerating(false)
    setResult(null)
    setError(null)
  }, [])

  return { generating, result, error, generate, cancel, reset }
}

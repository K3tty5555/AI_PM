import { useState, useCallback, useRef } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { api } from "@/lib/tauri-api"

interface UseAiStreamOptions {
  projectId: string
  phase: string
}

interface UseAiStreamReturn {
  text: string
  isStreaming: boolean
  error: string | null
  outputFile: string | null
  start: (messages: Array<{ role: string; content: string }>) => void
  reset: () => void
}

export function useAiStream({ projectId, phase }: UseAiStreamOptions): UseAiStreamReturn {
  const [text, setText] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outputFile, setOutputFile] = useState<string | null>(null)
  const cleanupRef = useRef<UnlistenFn[]>([])

  const cleanup = useCallback(() => {
    cleanupRef.current.forEach((fn) => fn())
    cleanupRef.current = []
  }, [])

  const reset = useCallback(() => {
    cleanup()
    setText("")
    setIsStreaming(false)
    setError(null)
    setOutputFile(null)
  }, [cleanup])

  const start = useCallback(
    (messages: Array<{ role: string; content: string }>) => {
      cleanup()
      setText("")
      setError(null)
      setOutputFile(null)
      setIsStreaming(true)

      // Set up listeners BEFORE invoking (to avoid missing early events)
      Promise.all([
        listen<string>("stream_chunk", (event) => {
          setText((prev) => prev + event.payload)
        }),
        listen<string>("stream_done", (event) => {
          setOutputFile(event.payload)
          setIsStreaming(false)
          cleanup()
        }),
        listen<string>("stream_error", (event) => {
          setError(event.payload)
          setIsStreaming(false)
          cleanup()
        }),
      ]).then((unlisteners) => {
        cleanupRef.current = unlisteners

        // Fire-and-forget: invoke starts streaming in Rust background
        api.startStream({ projectId, phase, messages }).catch((err: unknown) => {
          setError(String(err))
          setIsStreaming(false)
          cleanup()
        })
      })
    },
    [projectId, phase, cleanup]
  )

  return { text, isStreaming, error, outputFile, start, reset }
}

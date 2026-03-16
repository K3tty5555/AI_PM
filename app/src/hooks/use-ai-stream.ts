import { useState, useCallback, useRef } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { api } from "@/lib/tauri-api"

interface UseAiStreamOptions {
  projectId: string
  phase: string
}

interface StreamDonePayload {
  outputFile: string
  durationMs: number
  inputTokens?: number
  outputTokens?: number
}

interface UseAiStreamReturn {
  text: string
  isStreaming: boolean
  isThinking: boolean
  error: string | null
  outputFile: string | null
  streamMeta: { durationMs: number; inputTokens?: number; outputTokens?: number } | null
  start: (messages: Array<{ role: string; content: string }>) => void
  reset: () => void
}

export function useAiStream({ projectId, phase }: UseAiStreamOptions): UseAiStreamReturn {
  const [text, setText] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outputFile, setOutputFile] = useState<string | null>(null)
  const [streamMeta, setStreamMeta] = useState<{ durationMs: number; inputTokens?: number; outputTokens?: number } | null>(null)
  const cleanupRef = useRef<UnlistenFn[]>([])

  const isThinking = isStreaming && text === ""

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
    setStreamMeta(null)
  }, [cleanup])

  const start = useCallback(
    (messages: Array<{ role: string; content: string }>) => {
      cleanup()
      setText("")
      setError(null)
      setOutputFile(null)
      setStreamMeta(null)
      setIsStreaming(true)

      // Set up listeners BEFORE invoking (to avoid missing early events)
      Promise.all([
        listen<string>("stream_chunk", (event) => {
          setText((prev) => prev + event.payload)
        }),
        listen<StreamDonePayload>("stream_done", (event) => {
          const { outputFile: file, durationMs, inputTokens, outputTokens } = event.payload
          setOutputFile(file)
          setStreamMeta({ durationMs, inputTokens, outputTokens })
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

  return { text, isStreaming, isThinking, error, outputFile, streamMeta, start, reset }
}

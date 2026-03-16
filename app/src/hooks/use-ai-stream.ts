import { useState, useCallback, useRef, useEffect } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { api } from "@/lib/tauri-api"

interface StreamDonePayload {
  outputFile: string
  durationMs: number
  inputTokens?: number
  outputTokens?: number
}

interface StreamMeta {
  durationMs: number
  inputTokens?: number
  outputTokens?: number
}

// ── Module-level background stream store (survives component unmount) ─────
// When the user navigates away mid-stream, the component unmounts but the
// store keeps the listeners alive and accumulates text.  When the component
// remounts it reads from the store and resubscribes to live updates.

interface BgPatch {
  textChunk?: string
  isStreaming?: boolean
  error?: string
  outputFile?: string
  streamMeta?: StreamMeta | null
}

interface BgStream {
  text: string
  isStreaming: boolean
  error: string | null
  outputFile: string | null
  streamMeta: StreamMeta | null
  unlisteners: UnlistenFn[]
  // Callback set by the currently-mounted component
  notify: ((patch: BgPatch) => void) | null
}

const bgStore = new Map<string, BgStream>()

// ─────────────────────────────────────────────────────────────────────────

interface UseAiStreamOptions {
  projectId: string
  phase: string
}

interface UseAiStreamReturn {
  text: string
  isStreaming: boolean
  isThinking: boolean
  elapsedSeconds: number
  error: string | null
  outputFile: string | null
  streamMeta: StreamMeta | null
  start: (messages: Array<{ role: string; content: string }>) => void
  reset: () => void
}

export function useAiStream({ projectId, phase }: UseAiStreamOptions): UseAiStreamReturn {
  const key = `${projectId}:${phase}`

  // Initialize from background store if a stream is already in progress
  const bgInit = bgStore.get(key)

  const [text, setText] = useState(bgInit?.text ?? "")
  const [isStreaming, setIsStreaming] = useState(bgInit?.isStreaming ?? false)
  const [error, setError] = useState<string | null>(bgInit?.error ?? null)
  const [outputFile, setOutputFile] = useState<string | null>(bgInit?.outputFile ?? null)
  const [streamMeta, setStreamMeta] = useState<StreamMeta | null>(bgInit?.streamMeta ?? null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const isThinking = isStreaming && text === ""

  // Mutable ref — always captures the latest setState functions so background
  // listeners can safely call them even after component re-renders.
  const notifyRef = useRef<((patch: BgPatch) => void) | null>(null)
  notifyRef.current = (patch: BgPatch) => {
    if (patch.textChunk !== undefined) setText((prev) => prev + patch.textChunk!)
    if (patch.isStreaming !== undefined) setIsStreaming(patch.isStreaming)
    if ("error" in patch) setError(patch.error ?? null)
    if ("outputFile" in patch) setOutputFile(patch.outputFile ?? null)
    if ("streamMeta" in patch) setStreamMeta(patch.streamMeta ?? null)
  }

  // Elapsed timer — resets whenever streaming starts
  useEffect(() => {
    if (!isStreaming) return
    setElapsedSeconds(0)
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [isStreaming])

  // On mount: connect to an existing background stream (if any).
  // On unmount: disconnect but leave listeners running in the background.
  useEffect(() => {
    const bg = bgStore.get(key)
    if (!bg) return

    if (!bg.isStreaming) {
      // Stream completed while we were away — the file is on disk.
      // Clean up the stale store entry; loadExisting will load the file.
      bgStore.delete(key)
      return
    }

    // Stream is still active: subscribe for live updates
    bg.notify = (patch) => notifyRef.current?.(patch)

    return () => {
      // Unmount: disconnect from the store without killing the listeners
      const bg = bgStore.get(key)
      if (bg) bg.notify = null
    }
  }, [key])

  const reset = useCallback(() => {
    const bg = bgStore.get(key)
    if (bg) {
      bg.unlisteners.forEach((fn) => fn())
      bgStore.delete(key)
    }
    setText("")
    setIsStreaming(false)
    setError(null)
    setOutputFile(null)
    setStreamMeta(null)
  }, [key])

  const start = useCallback(
    (messages: Array<{ role: string; content: string }>) => {
      // Guard: if this key is already streaming in the background, skip.
      // This prevents duplicate generation when the component remounts
      // (e.g. user navigated away and back while generation was in progress).
      const existing = bgStore.get(key)
      if (existing?.isStreaming) return

      // Clean up any completed (non-streaming) entry
      if (existing) {
        existing.unlisteners.forEach((fn) => fn())
        bgStore.delete(key)
      }

      setText("")
      setError(null)
      setOutputFile(null)
      setStreamMeta(null)
      setIsStreaming(true)

      // Create background stream entry
      const bg: BgStream = {
        text: "",
        isStreaming: true,
        error: null,
        outputFile: null,
        streamMeta: null,
        unlisteners: [],
        notify: (patch) => notifyRef.current?.(patch),
      }
      bgStore.set(key, bg)

      // Set up listeners BEFORE invoking the backend
      Promise.all([
        listen<string>("stream_chunk", (event) => {
          bg.text += event.payload
          bg.notify?.({ textChunk: event.payload })
        }),
        listen<StreamDonePayload>("stream_done", (event) => {
          const { outputFile: file, durationMs, inputTokens, outputTokens } = event.payload
          bg.outputFile = file
          bg.streamMeta = { durationMs, inputTokens, outputTokens }
          bg.isStreaming = false
          bg.unlisteners.forEach((fn) => fn())
          bg.unlisteners = []
          bg.notify?.({
            isStreaming: false,
            outputFile: file,
            streamMeta: { durationMs, inputTokens, outputTokens },
          })
        }),
        listen<string>("stream_error", (event) => {
          bg.error = event.payload
          bg.isStreaming = false
          bg.unlisteners.forEach((fn) => fn())
          bg.unlisteners = []
          bg.notify?.({ isStreaming: false, error: event.payload })
        }),
      ]).then((unlisteners) => {
        bg.unlisteners = unlisteners

        api.startStream({ projectId, phase, messages }).catch((err: unknown) => {
          bg.error = String(err)
          bg.isStreaming = false
          bg.unlisteners.forEach((fn) => fn())
          bg.unlisteners = []
          bgStore.delete(key)
          bg.notify?.({ isStreaming: false, error: String(err) })
        })
      })
    },
    [projectId, phase, key]
  )

  return { text, isStreaming, isThinking, elapsedSeconds, error, outputFile, streamMeta, start, reset }
}

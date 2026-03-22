import { useState, useCallback, useRef, useEffect } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { api } from "@/lib/tauri-api"

interface StreamChunkPayload {
  streamKey: string
  text: string
}

interface StreamErrorPayload {
  streamKey: string
  message: string
}

interface StreamDonePayload {
  streamKey: string
  outputFile: string
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  finalText?: string
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
  textReplace?: string
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
  /** Unix ms timestamp when this stream was started — used to restore elapsed timer on remount */
  startedAt: number
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
  start: (messages: Array<{ role: string; content: string }>, options?: { excludedContext?: string[]; styleId?: string; designSpec?: string }) => void
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
    if (patch.textReplace !== undefined) setText(patch.textReplace)
    if (patch.isStreaming !== undefined) setIsStreaming(patch.isStreaming)
    if ("error" in patch) setError(patch.error ?? null)
    if ("outputFile" in patch) setOutputFile(patch.outputFile ?? null)
    if ("streamMeta" in patch) setStreamMeta(patch.streamMeta ?? null)
  }

  // Elapsed timer — restores actual elapsed time from bgStore.startedAt on remount
  useEffect(() => {
    if (!isStreaming) return
    const bg = bgStore.get(key)
    const startedAt = bg?.startedAt ?? Date.now()
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [isStreaming, key])

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
    (messages: Array<{ role: string; content: string }>, options?: { excludedContext?: string[]; styleId?: string; designSpec?: string }) => {
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

      // Mark phase as in-progress when streaming starts and notify sidebar
      if (phase !== "review-modify") {
        api.updatePhase({ projectId, phase, status: "in_progress" })
          .catch((err) => console.error("[AiStream] failed to mark in_progress:", err))
        window.dispatchEvent(new CustomEvent("project-phase-updated", { detail: { projectId } }))
      }

      // Create background stream entry
      const bg: BgStream = {
        text: "",
        isStreaming: true,
        error: null,
        outputFile: null,
        streamMeta: null,
        unlisteners: [],
        startedAt: Date.now(),
        notify: (patch) => notifyRef.current?.(patch),
      }
      bgStore.set(key, bg)

      // Set up listeners BEFORE invoking the backend
      Promise.all([
        listen<StreamChunkPayload>("stream_chunk", (event) => {
          const { streamKey, text } = event.payload
          const parts = streamKey.split(":")
          const evtKey = parts.slice(1).join(":")
          const target = bgStore.get(evtKey)
          if (!target) return
          target.text += text
          target.notify?.({ textChunk: text })
        }),
        listen<StreamDonePayload>("stream_done", (event) => {
          const { streamKey, outputFile: file, durationMs, inputTokens, outputTokens, finalText } = event.payload
          const parts = streamKey.split(":")
          const evtKey = parts.slice(1).join(":")
          const target = bgStore.get(evtKey)
          if (!target) return

          target.outputFile = file
          target.streamMeta = { durationMs, inputTokens, outputTokens }
          target.isStreaming = false
          target.unlisteners.forEach((fn) => fn())
          target.unlisteners = []

          const patch: BgPatch = {
            isStreaming: false,
            outputFile: file,
            streamMeta: { durationMs, inputTokens, outputTokens },
          }

          // CLI mode: if AI wrote content directly to disk via Write tool, finalText
          // (read from disk by the backend) may be the authoritative content. Accept it
          // whenever it's meaningfully longer than accumulated stdout, OR when stdout is
          // suspiciously short (< 500 chars) and finalText is substantial — this handles
          // the common case where Claude outputs only a brief confirmation to stdout.
          if (finalText && finalText.trim().length > 100) {
            const streamLen = target.text.trim().length
            if (finalText.trim().length > streamLen + 100 || streamLen < 500) {
              target.text = finalText
              patch.textReplace = finalText
            }
          }

          target.notify?.(patch)

          // Dock bounce when AI completes and window is not focused (Task 25)
          getCurrentWindow().isFocused().then((focused) => {
            if (!focused) {
              // UserAttentionType.Informational = 2 (bounces Dock icon once)
              getCurrentWindow().requestUserAttention(2).catch(() => {})
            }
          }).catch(() => {})

          // Auto-mark phase as completed and notify sidebar to refresh
          api.updatePhase({ projectId, phase, status: "completed", outputFile: file })
            .catch((err) => console.error("[AiStream]", err))
          window.dispatchEvent(new CustomEvent("project-phase-updated", { detail: { projectId } }))
        }),
        listen<StreamErrorPayload>("stream_error", (event) => {
          const { streamKey, message } = event.payload
          const parts = streamKey.split(":")
          const evtKey = parts.slice(1).join(":")
          const target = bgStore.get(evtKey)
          if (!target) return
          target.error = message
          target.isStreaming = false
          target.unlisteners.forEach((fn) => fn())
          target.unlisteners = []
          target.notify?.({ isStreaming: false, error: message })
        }),
      ]).then((unlisteners) => {
        bg.unlisteners = unlisteners

        api.startStream({ projectId, phase, messages, excludedContext: options?.excludedContext, styleId: options?.styleId, designSpec: options?.designSpec }).catch((err: unknown) => {
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

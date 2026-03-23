import { useState, useCallback, useRef, useEffect } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { api } from "@/lib/tauri-api"
import type { StreamChunkPayload, StreamErrorPayload, StreamDonePayload, StreamToolPayload, StreamMeta } from "@/lib/stream-types"

const TOOL_LABELS: Record<string, string> = {
  WebSearch: "正在搜索网页",
  WebFetch: "正在获取网页内容",
  Bash: "正在执行命令",
  Write: "正在写入文件",
  Read: "正在读取文件",
  Edit: "正在编辑文件",
  Glob: "正在查找文件",
  Grep: "正在搜索代码",
}

function getToolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? `正在使用 ${tool}`
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
  toolStatus?: string | null
}

interface BgStream {
  text: string
  isStreaming: boolean
  error: string | null
  outputFile: string | null
  streamMeta: StreamMeta | null
  toolStatus: string | null
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
  toolStatus: string | null
  start: (messages: Array<{ role: string; content: string }>, options?: { excludedContext?: string[]; styleId?: string; designSpec?: string }) => void
  reset: () => void
}

export function useAiStream({ projectId, phase }: UseAiStreamOptions): UseAiStreamReturn {
  const key = `${projectId}:${phase}`

  // Initialize from background store if a stream is already in progress
  const bgInit = bgStore.get(key)

  const [text, setText] = useState(() => {
    if (bgInit?.text) return bgInit.text
    // Crash recovery: check for a snapshot saved by a previous interrupted stream
    const stored = localStorage.getItem(`stream-recovery:${key}`)
    if (stored) {
      try {
        const { text: recoveredText, timestamp } = JSON.parse(stored)
        if (recoveredText && recoveredText.length > 100 && Date.now() - timestamp < 24 * 60 * 60 * 1000) {
          localStorage.removeItem(`stream-recovery:${key}`)
          return recoveredText as string
        }
      } catch { /* ignore malformed data */ }
      localStorage.removeItem(`stream-recovery:${key}`)
    }
    return ""
  })
  const [isStreaming, setIsStreaming] = useState(bgInit?.isStreaming ?? false)
  const [error, setError] = useState<string | null>(bgInit?.error ?? null)
  const [outputFile, setOutputFile] = useState<string | null>(bgInit?.outputFile ?? null)
  const [streamMeta, setStreamMeta] = useState<StreamMeta | null>(bgInit?.streamMeta ?? null)
  const [toolStatus, setToolStatus] = useState<string | null>(bgInit?.toolStatus ?? null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const isThinking = isStreaming && text === ""

  // rAF batching — accumulate high-frequency chunks and flush once per frame
  const chunkBufferRef = useRef("")
  const rafIdRef = useRef(0)

  // Mutable ref — always captures the latest setState functions so background
  // listeners can safely call them even after component re-renders.
  const notifyRef = useRef<((patch: BgPatch) => void) | null>(null)
  notifyRef.current = (patch: BgPatch) => {
    if (patch.textChunk !== undefined) {
      chunkBufferRef.current += patch.textChunk
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          const buffered = chunkBufferRef.current
          chunkBufferRef.current = ""
          rafIdRef.current = 0
          if (buffered) setText((prev) => prev + buffered)
        })
      }
    }
    if (patch.textReplace !== undefined) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = 0
      }
      chunkBufferRef.current = ""
      setText(patch.textReplace)
    }
    if (patch.isStreaming !== undefined) setIsStreaming(patch.isStreaming)
    if ("error" in patch) setError(patch.error ?? null)
    if ("outputFile" in patch) setOutputFile(patch.outputFile ?? null)
    if ("streamMeta" in patch) setStreamMeta(patch.streamMeta ?? null)
    if ("toolStatus" in patch) setToolStatus(patch.toolStatus ?? null)
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
    try { localStorage.removeItem(`stream-recovery:${key}`) } catch { /* noop */ }
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = 0
    }
    chunkBufferRef.current = ""
    setText("")
    setIsStreaming(false)
    setError(null)
    setOutputFile(null)
    setStreamMeta(null)
    setToolStatus(null)
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
        toolStatus: null,
        unlisteners: [],
        startedAt: Date.now(),
        notify: (patch) => notifyRef.current?.(patch),
      }
      bgStore.set(key, bg)

      // Set up listeners BEFORE invoking the backend
      Promise.all([
        listen<StreamChunkPayload>("stream_chunk", (event) => {
          const { streamKey, text } = event.payload
          if (!streamKey.startsWith("generate:")) return  // ignore brainstorm/tool events
          const evtKey = streamKey.slice("generate:".length)
          const target = bgStore.get(evtKey)
          if (!target) return
          target.text += text
          target.notify?.({ textChunk: text })
        }),
        listen<StreamDonePayload>("stream_done", (event) => {
          const { streamKey, outputFile: file, durationMs, inputTokens, outputTokens, costUsd, finalText } = event.payload
          if (!streamKey.startsWith("generate:")) return  // ignore brainstorm/tool events
          const evtKey = streamKey.slice("generate:".length)
          const target = bgStore.get(evtKey)
          if (!target) return

          target.outputFile = file
          target.streamMeta = { durationMs, inputTokens, outputTokens, costUsd }
          target.isStreaming = false
          try { localStorage.removeItem(`stream-recovery:${evtKey}`) } catch { /* noop */ }
          target.unlisteners.forEach((fn) => fn())
          target.unlisteners = []

          const patch: BgPatch = {
            isStreaming: false,
            outputFile: file,
            streamMeta: { durationMs, inputTokens, outputTokens, costUsd },
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

          target.toolStatus = null
          patch.toolStatus = null

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
          if (!streamKey.startsWith("generate:")) return
          const evtKey = streamKey.slice("generate:".length)
          const target = bgStore.get(evtKey)
          if (!target) return
          target.error = message
          target.isStreaming = false
          target.toolStatus = null
          target.unlisteners.forEach((fn) => fn())
          target.unlisteners = []
          target.notify?.({ isStreaming: false, error: message, toolStatus: null })
        }),
        listen<StreamToolPayload>("stream_tool", (event) => {
          const { streamKey, tool, status } = event.payload
          if (!streamKey.startsWith("generate:")) return
          const evtKey = streamKey.slice("generate:".length)
          const target = bgStore.get(evtKey)
          if (!target) return
          const label = status === "idle" ? null : getToolLabel(tool)
          target.toolStatus = label
          target.notify?.({ toolStatus: label })
        }),
      ]).then((unlisteners) => {
        bg.unlisteners = unlisteners

        // Periodic snapshot for crash recovery (every 5s)
        const snapshotKey = `stream-recovery:${key}`
        const snapshotTimer = setInterval(() => {
          const snap = bgStore.get(key)
          if (snap && snap.isStreaming && snap.text.length > 100) {
            try {
              localStorage.setItem(snapshotKey, JSON.stringify({ text: snap.text, timestamp: Date.now() }))
            } catch { /* storage full or unavailable — ignore */ }
          }
        }, 5000)
        bg.unlisteners.push(() => clearInterval(snapshotTimer))

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

  return { text, isStreaming, isThinking, elapsedSeconds, error, outputFile, streamMeta, toolStatus, start, reset }
}

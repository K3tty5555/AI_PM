import { useState, useCallback, useRef, useEffect } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { api } from "@/lib/tauri-api"
import type { StreamChunkPayload, StreamErrorPayload, StreamDonePayload, StreamMeta } from "@/lib/stream-types"

interface UseToolStreamReturn {
  text: string
  isStreaming: boolean
  isThinking: boolean
  elapsedSeconds: number
  error: string | null
  streamMeta: StreamMeta | null
  run: (userInput: string, filePath?: string, mode?: string) => void
  reset: () => void
}

interface UseToolStreamOptions {
  projectId?: string
  /** Stream key prefix — default "tool". Pass "plaza" for plaza skill pages. */
  streamKeyPrefix?: string
}

export function useToolStream(toolName: string, options?: string | UseToolStreamOptions): UseToolStreamReturn {
  const projectId = typeof options === "string" ? options : options?.projectId
  const streamKeyPrefix = (typeof options === "string" ? "tool" : options?.streamKeyPrefix) ?? "tool"

  const [text, setText] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamMeta, setStreamMeta] = useState<StreamMeta | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const unlistenersRef = useRef<UnlistenFn[]>([])

  const isThinking = isStreaming && text === ""

  useEffect(() => {
    if (!isStreaming) return
    setElapsedSeconds(0)
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [isStreaming])

  const reset = useCallback(() => {
    unlistenersRef.current.forEach((fn) => fn())
    unlistenersRef.current = []
    setText("")
    setIsStreaming(false)
    setError(null)
    setStreamMeta(null)
  }, [])

  const run = useCallback(
    (userInput: string, filePath?: string, mode?: string) => {
      // 清理上次的 listeners
      unlistenersRef.current.forEach((fn) => fn())
      unlistenersRef.current = []

      setText("")
      setError(null)
      setStreamMeta(null)
      setIsStreaming(true)

      const expectedKey = `${streamKeyPrefix}:${toolName}`

      Promise.all([
        listen<StreamChunkPayload>("stream_chunk", (event) => {
          const { streamKey, text } = event.payload
          if (streamKey !== expectedKey) return
          setText((prev) => prev + text)
        }),
        listen<StreamDonePayload>("stream_done", (event) => {
          const { streamKey, durationMs, inputTokens, outputTokens, finalText } = event.payload
          if (streamKey !== expectedKey) return
          unlistenersRef.current.forEach((fn) => fn())
          unlistenersRef.current = []
          setIsStreaming(false)
          setStreamMeta({ durationMs, inputTokens, outputTokens })
          // 仅当 finalText 明显长于累积流文本时替换（CLI 写文件模式）
          // 防止 API 模式下短确认消息覆盖完整流内容
          setText((current) => {
            if (finalText && finalText.trim().length > current.trim().length + 100) {
              return finalText
            }
            return current
          })
        }),
        listen<StreamErrorPayload>("stream_error", (event) => {
          const { streamKey, message } = event.payload
          if (streamKey !== expectedKey) return
          unlistenersRef.current.forEach((fn) => fn())
          unlistenersRef.current = []
          setIsStreaming(false)
          setError(message)
        }),
      ]).then((unlisteners) => {
        unlistenersRef.current = unlisteners
        if (streamKeyPrefix === "plaza") {
          api.runPlazaSkill({ skillId: toolName, userInput }).catch((err: unknown) => {
            unlistenersRef.current.forEach((fn) => fn())
            unlistenersRef.current = []
            setIsStreaming(false)
            setError(String(err))
          })
        } else {
          api.runTool({ toolName, userInput, filePath, projectId, mode }).catch((err: unknown) => {
            unlistenersRef.current.forEach((fn) => fn())
            unlistenersRef.current = []
            setIsStreaming(false)
            setError(String(err))
          })
        }
      })
    },
    [toolName, projectId, streamKeyPrefix]
  )

  return { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset }
}

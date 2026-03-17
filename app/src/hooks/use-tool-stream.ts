import { useState, useCallback, useRef, useEffect } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { api } from "@/lib/tauri-api"

interface StreamDonePayload {
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

interface UseToolStreamReturn {
  text: string
  isStreaming: boolean
  isThinking: boolean
  elapsedSeconds: number
  error: string | null
  streamMeta: StreamMeta | null
  run: (userInput: string, filePath?: string) => void
  reset: () => void
}

export function useToolStream(toolName: string, projectId?: string): UseToolStreamReturn {
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
    (userInput: string, filePath?: string) => {
      // 清理上次的 listeners
      unlistenersRef.current.forEach((fn) => fn())
      unlistenersRef.current = []

      setText("")
      setError(null)
      setStreamMeta(null)
      setIsStreaming(true)

      Promise.all([
        listen<string>("stream_chunk", (event) => {
          setText((prev) => prev + event.payload)
        }),
        listen<StreamDonePayload>("stream_done", (event) => {
          const { durationMs, inputTokens, outputTokens, finalText } = event.payload
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
        listen<string>("stream_error", (event) => {
          unlistenersRef.current.forEach((fn) => fn())
          unlistenersRef.current = []
          setIsStreaming(false)
          setError(event.payload)
        }),
      ]).then((unlisteners) => {
        unlistenersRef.current = unlisteners
        api.runTool({ toolName, userInput, filePath, projectId }).catch((err: unknown) => {
          unlistenersRef.current.forEach((fn) => fn())
          unlistenersRef.current = []
          setIsStreaming(false)
          setError(String(err))
        })
      })
    },
    [toolName, projectId]
  )

  return { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset }
}

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
          // 如果 finalText 比 stream 累积内容更长（CLI 写文件场景），替换显示
          if (finalText && finalText.trim().length > 0) {
            setText(finalText)
          }
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

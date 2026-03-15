"use client"

import { useState, useCallback, useRef } from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAiStream({
  projectId,
  phase,
}: UseAiStreamOptions): UseAiStreamReturn {
  const [text, setText] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outputFile, setOutputFile] = useState<string | null>(null)

  // Keep a ref to the current AbortController so we can cancel on reset
  const abortRef = useRef<AbortController | null>(null)
  // Buffer for partial SSE lines across chunks
  const bufferRef = useRef("")

  const reset = useCallback(() => {
    // Abort any in-flight request
    abortRef.current?.abort()
    abortRef.current = null
    bufferRef.current = ""
    setText("")
    setIsStreaming(false)
    setError(null)
    setOutputFile(null)
  }, [])

  const start = useCallback(
    (messages: Array<{ role: string; content: string }>) => {
      // Reset previous state
      abortRef.current?.abort()
      bufferRef.current = ""
      setText("")
      setError(null)
      setOutputFile(null)
      setIsStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      ;(async () => {
        try {
          const response = await fetch("/api/ai/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, phase, messages }),
            signal: controller.signal,
          })

          if (!response.ok) {
            const errBody = await response.text()
            let errMsg = "请求失败"
            try {
              const parsed = JSON.parse(errBody)
              errMsg = parsed.error || errMsg
            } catch {
              // not JSON, use default
            }
            setError(errMsg)
            setIsStreaming(false)
            return
          }

          const reader = response.body?.getReader()
          if (!reader) {
            setError("无法读取响应流")
            setIsStreaming(false)
            return
          }

          const decoder = new TextDecoder()

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            // Decode chunk and prepend any leftover buffer
            const chunk = bufferRef.current + decoder.decode(value, { stream: true })
            const lines = chunk.split("\n")

            // The last element may be an incomplete line — save it for next iteration
            bufferRef.current = lines.pop() ?? ""

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || !trimmed.startsWith("data: ")) continue

              const jsonStr = trimmed.slice(6)
              if (!jsonStr) continue

              try {
                const data = JSON.parse(jsonStr) as {
                  text?: string
                  done?: boolean
                  outputFile?: string
                  error?: string
                }

                if (data.text) {
                  setText((prev) => prev + data.text)
                }
                if (data.done) {
                  setOutputFile(data.outputFile ?? null)
                }
                if (data.error) {
                  setError(data.error)
                }
              } catch {
                // Malformed JSON line — skip
              }
            }
          }

          // Process any remaining buffer
          if (bufferRef.current.trim().startsWith("data: ")) {
            const jsonStr = bufferRef.current.trim().slice(6)
            try {
              const data = JSON.parse(jsonStr) as {
                text?: string
                done?: boolean
                outputFile?: string
                error?: string
              }
              if (data.text) setText((prev) => prev + data.text)
              if (data.done) setOutputFile(data.outputFile ?? null)
              if (data.error) setError(data.error)
            } catch {
              // ignore
            }
            bufferRef.current = ""
          }
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === "AbortError") {
            // User cancelled — not an error
            return
          }
          const message = err instanceof Error ? err.message : String(err)
          setError(message)
        } finally {
          setIsStreaming(false)
          bufferRef.current = ""
        }
      })()
    },
    [projectId, phase]
  )

  return { text, isStreaming, error, outputFile, start, reset }
}

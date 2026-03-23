import { useState, useEffect, useCallback, useRef } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { api, type BrainstormMessage } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"

// ─── Event payloads ──────────────────────────────────────────────────────
import type { StreamChunkPayload, StreamDonePayload, StreamErrorPayload } from "@/lib/stream-types"

// ─── Public interface ──────────────────────────────────────────────────────

interface UseBrainstormReturn {
  messages: BrainstormMessage[]
  loading: boolean
  streaming: boolean
  streamingText: string
  messageCount: number
  roundCount: number
  isMaxRounds: boolean
  sendMessage: (content: string) => Promise<void>
  clearMessages: () => Promise<void>
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useBrainstorm(projectId: string, phase: string): UseBrainstormReturn {
  const [messages, setMessages] = useState<BrainstormMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState("")
  const [messageCount, setMessageCount] = useState(0)

  const { toast } = useToast()

  // Refs to keep callbacks stable and prevent dependency loops
  const streamingTextRef = useRef("")
  const unlistenersRef = useRef<UnlistenFn[]>([])
  const mountedRef = useRef(true)
  const messagesRef = useRef<BrainstormMessage[]>([])
  const sendingRef = useRef(false)

  const expectedStreamKey = `brainstorm:${projectId}:${phase}`

  // ── Load messages on mount ────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    async function load() {
      try {
        const [msgs, count] = await Promise.all([
          api.loadBrainstormMessages(projectId, phase),
          api.brainstormMessageCount(projectId, phase),
        ])
        if (!cancelled) {
          setMessages(msgs)
          messagesRef.current = msgs
          setMessageCount(count)
        }
      } catch (err) {
        console.error("[useBrainstorm] Failed to load messages:", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
      mountedRef.current = false
      // Clean up any active listeners
      unlistenersRef.current.forEach((fn) => fn())
      unlistenersRef.current = []
    }
  }, [projectId, phase])

  // ── Set up stream event listeners ─────────────────────────────────────

  const setupListeners = useCallback(async () => {
    // Clean up previous listeners
    unlistenersRef.current.forEach((fn) => fn())
    unlistenersRef.current = []

    const fns = await Promise.all([
      listen<StreamChunkPayload>("stream_chunk", (event) => {
        const { streamKey, text } = event.payload
        if (streamKey !== expectedStreamKey) return
        streamingTextRef.current += text
        if (mountedRef.current) {
          setStreamingText(streamingTextRef.current)
        }
      }),
      listen<StreamDonePayload>("stream_done", (event) => {
        const { streamKey } = event.payload
        if (streamKey !== expectedStreamKey) return

        const finalContent = streamingTextRef.current.trim()
        if (!mountedRef.current) return

        // Save assistant message to DB, then add to local state
        if (finalContent) {
          api
            .saveBrainstormMessage({
              projectId,
              phase,
              role: "assistant",
              content: finalContent,
            })
            .then((saved) => {
              if (mountedRef.current) {
                const updated = [...messagesRef.current, saved]
                setMessages(updated)
                messagesRef.current = updated
                setMessageCount((prev) => prev + 1)
              }
            })
            .catch((err) =>
              console.error("[useBrainstorm] Failed to save assistant message:", err)
            )
        }

        streamingTextRef.current = ""
        setStreamingText("")
        setStreaming(false)
        sendingRef.current = false

        // Clean up listeners
        unlistenersRef.current.forEach((fn) => fn())
        unlistenersRef.current = []
      }),
      listen<StreamErrorPayload>("stream_error", (event) => {
        const { streamKey, message } = event.payload
        if (streamKey !== expectedStreamKey) return

        if (mountedRef.current) {
          // ROUND_LIMIT_EXCEEDED is handled by the frontend status card — skip toast
          if (message !== "ROUND_LIMIT_EXCEEDED") {
            toast(message || "AI 回复出错", "error")
          }
          streamingTextRef.current = ""
          setStreamingText("")
          setStreaming(false)
          sendingRef.current = false
        }

        // Clean up listeners
        unlistenersRef.current.forEach((fn) => fn())
        unlistenersRef.current = []
      }),
    ])
    unlistenersRef.current = fns
  }, [projectId, phase, expectedStreamKey, toast])

  // ── Send a message ────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return
      // Double lock: React state + ref (ref survives across re-renders)
      if (sendingRef.current) return
      sendingRef.current = true

      try {
        // Save user message to DB
        const saved = await api.saveBrainstormMessage({
          projectId,
          phase,
          role: "user",
          content: content.trim(),
        })

        // Add to local messages (use ref to avoid stale closure)
        const updatedMessages = [...messagesRef.current, saved]
        setMessages(updatedMessages)
        messagesRef.current = updatedMessages
        setMessageCount((prev) => prev + 1)

        // Prepare message history for the API call
        const chatHistory = updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        // Start streaming
        streamingTextRef.current = ""
        setStreamingText("")
        setStreaming(true)

        // Set up event listeners before calling the API
        await setupListeners()

        // Fire the brainstorm chat request
        await api.brainstormChat({
          projectId,
          phase,
          messages: chatHistory,
        })
      } catch (err) {
        console.error("[useBrainstorm] sendMessage error:", err)
        toast("发送消息失败", "error")
        setStreaming(false)
      }
      // Note: sendingRef is cleared in stream_done/stream_error handlers
    },
    [projectId, phase, setupListeners, toast]
  )

  // ── Clear all messages ────────────────────────────────────────────────

  const clearMessages = useCallback(async () => {
    try {
      await api.clearBrainstorm(projectId, phase)
      setMessages([])
      setMessageCount(0)
      streamingTextRef.current = ""
      setStreamingText("")
      setStreaming(false)
    } catch (err) {
      console.error("[useBrainstorm] clearMessages error:", err)
      toast("清空消息失败", "error")
    }
  }, [projectId, phase, toast])

  const roundCount = messages.filter((m) => m.role === "user").length
  const isMaxRounds = roundCount >= 15

  return {
    messages,
    loading,
    streaming,
    streamingText,
    messageCount,
    roundCount,
    isMaxRounds,
    sendMessage,
    clearMessages,
  }
}

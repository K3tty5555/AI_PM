import { useState, useEffect, useCallback, useRef } from "react"

interface UseProgressiveRevealOptions {
  text: string
  isStreaming: boolean
  staggerMs?: number
}

interface UseProgressiveRevealReturn {
  visibleText: string
  isRevealing: boolean
  revealedCount: number
  totalCount: number
  skipReveal: () => void
}

export function useProgressiveReveal({
  text,
  isStreaming,
  staggerMs = 150,
}: UseProgressiveRevealOptions): UseProgressiveRevealReturn {
  const [revealedCount, setRevealedCount] = useState(0)
  const [skipped, setSkipped] = useState(false)
  const prevTextLenRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const paragraphs = text ? text.split(/\n\n+/) : []
  const totalCount = paragraphs.length

  // 检测"从无到有"的跳变（CLI 模式一次性到达）
  const isNewBulkArrival = !isStreaming && text.length > 100 && prevTextLenRef.current === 0 && !skipped

  useEffect(() => {
    prevTextLenRef.current = text.length
  }, [text])

  useEffect(() => {
    if (!isNewBulkArrival || totalCount === 0) return

    setRevealedCount(1)
    if (totalCount <= 1) return

    const timer = setInterval(() => {
      setRevealedCount((prev) => {
        const next = prev + 1
        if (next >= totalCount) clearInterval(timer)
        return next
      })
    }, staggerMs)

    timerRef.current = timer
    return () => clearInterval(timer)
  }, [isNewBulkArrival, totalCount, staggerMs])

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const skipReveal = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setSkipped(true)
    setRevealedCount(totalCount)
  }, [totalCount])

  const isRevealing = isNewBulkArrival && revealedCount < totalCount

  let visibleText: string
  if (isStreaming || skipped || !isNewBulkArrival) {
    visibleText = text
  } else {
    visibleText = paragraphs.slice(0, revealedCount).join("\n\n")
  }

  return { visibleText, isRevealing, revealedCount, totalCount, skipReveal }
}

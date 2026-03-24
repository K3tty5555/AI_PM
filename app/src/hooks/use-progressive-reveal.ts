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
  const [isActive, setIsActive] = useState(false)
  const prevTextLenRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const staggerRef = useRef(staggerMs)
  staggerRef.current = staggerMs

  const paragraphs = text ? text.split(/\n\n+/) : []
  const totalCount = paragraphs.length

  // Detect bulk arrival: text jumps from empty to substantial while not streaming
  useEffect(() => {
    const wasBulk = !isStreaming && text.length > 100 && prevTextLenRef.current === 0
    prevTextLenRef.current = text.length

    if (wasBulk && !isActive) {
      setIsActive(true)
      setRevealedCount(1)
    }
  }, [text, isStreaming]) // eslint-disable-line react-hooks/exhaustive-deps

  // Run stagger timer when active
  useEffect(() => {
    if (!isActive || totalCount <= 1) return

    const timer = setInterval(() => {
      setRevealedCount((prev) => {
        const next = prev + 1
        if (next >= totalCount) {
          clearInterval(timer)
          setIsActive(false)
        }
        return next
      })
    }, staggerRef.current)

    timerRef.current = timer
    return () => clearInterval(timer)
  }, [isActive, totalCount])

  const skipReveal = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsActive(false)
    setRevealedCount(totalCount)
  }, [totalCount])

  let visibleText: string
  if (isActive && revealedCount < totalCount) {
    visibleText = paragraphs.slice(0, revealedCount).join("\n\n")
  } else {
    visibleText = text
  }

  const isRevealing = isActive && revealedCount < totalCount

  return { visibleText, isRevealing, revealedCount, totalCount, skipReveal }
}

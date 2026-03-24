import { useRef, useState, useEffect } from "react"

/**
 * Lazy render hook using IntersectionObserver.
 * Returns a ref to attach to a wrapper element and a boolean indicating visibility.
 * When the element enters the viewport, isVisible becomes true and stays true (no re-hiding).
 */
export function useLazyRender(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || isVisible) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "200px" }  // Pre-load 200px before viewport
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [isVisible])

  return [ref, isVisible]
}

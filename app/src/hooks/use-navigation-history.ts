import { useEffect, useRef, useCallback } from "react"
import { useLocation, useNavigate } from "react-router-dom"

/**
 * Track navigation history for back/forward button states.
 *
 * React Router v7 doesn't expose the history stack, so we maintain
 * our own back/forward stacks based on location changes.
 *
 * A `navAction` ref distinguishes user-initiated back/forward from
 * normal navigation so stacks are updated correctly.
 */
export function useNavigationHistory() {
  const location = useLocation()
  const navigate = useNavigate()

  const backStackRef = useRef<string[]>([])
  const forwardStackRef = useRef<string[]>([])
  // "push" = normal navigation, "back" / "forward" = our own goBack / goForward
  const navActionRef = useRef<"push" | "back" | "forward">("push")
  const currentKeyRef = useRef<string>("")

  useEffect(() => {
    const key = location.key ?? location.pathname
    // Ignore the very first render (initial page load)
    if (currentKeyRef.current === "") {
      currentKeyRef.current = key
      return
    }
    // Avoid processing the same location twice
    if (key === currentKeyRef.current) return

    const action = navActionRef.current

    if (action === "back") {
      // We called goBack → push current to forwardStack (already done in goBack)
      // Nothing extra needed here.
    } else if (action === "forward") {
      // We called goForward → push current to backStack (already done in goForward)
      // Nothing extra needed here.
    } else {
      // Normal navigation → push previous location to backStack, clear forward
      backStackRef.current = [...backStackRef.current, currentKeyRef.current]
      forwardStackRef.current = []
    }

    currentKeyRef.current = key
    // Reset action for next navigation
    navActionRef.current = "push"
  }, [location])

  const canGoBack = backStackRef.current.length > 0
  const canGoForward = forwardStackRef.current.length > 0

  const goBack = useCallback(() => {
    if (backStackRef.current.length === 0) return
    navActionRef.current = "back"
    // Push current to forward stack
    forwardStackRef.current = [...forwardStackRef.current, currentKeyRef.current]
    // Pop from back stack
    const newBack = [...backStackRef.current]
    newBack.pop()
    backStackRef.current = newBack
    navigate(-1)
  }, [navigate])

  const goForward = useCallback(() => {
    if (forwardStackRef.current.length === 0) return
    navActionRef.current = "forward"
    // Push current to back stack
    backStackRef.current = [...backStackRef.current, currentKeyRef.current]
    // Pop from forward stack
    const newForward = [...forwardStackRef.current]
    newForward.pop()
    forwardStackRef.current = newForward
    navigate(1)
  }, [navigate])

  return { canGoBack, canGoForward, goBack, goForward }
}

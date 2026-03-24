import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { useLazyRender } from "@/hooks/use-lazy-render"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MermaidRendererProps {
  chart: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function MermaidRenderer({ chart }: MermaidRendererProps) {
  const [lazyRef, isVisible] = useLazyRender()
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isVisible) return

    let cancelled = false

    async function render() {
      try {
        setLoading(true)
        setError(null)

        const mermaid = (await import("mermaid")).default
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          fontFamily:
            "var(--font-geist-mono), 'Courier New', Courier, monospace",
        })

        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        let svg: string
        try {
          ;({ svg } = await mermaid.render(id, chart.trim()))
        } catch (renderErr) {
          // Mermaid injects a #d{id} error element into document.body before throwing.
          // Remove it so it doesn't appear floating at the bottom of the page.
          document.getElementById(`d${id}`)?.remove()
          throw renderErr
        }

        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    render()
    return () => {
      cancelled = true
    }
  }, [isVisible, chart])

  // Error fallback: show raw code
  if (error) {
    return (
      <div ref={lazyRef} className="my-3">
        <div className="border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 px-3 py-2 mb-1">
          <span className="text-[11px] text-[var(--destructive)]">
            MERMAID_RENDER_ERROR
          </span>
        </div>
        <pre
          className={cn(
            "overflow-x-auto p-4 text-xs",
            "bg-[var(--secondary)] text-[var(--text-primary)]",
            "border-l-3 border-l-[var(--accent-color)]",
            "font-mono",
          )}
        >
          <code>{chart}</code>
        </pre>
      </div>
    )
  }

  return (
    <div ref={lazyRef} className="my-3 relative">
      {isVisible ? (
        <>
          {/* Loading state */}
          {loading && (
            <div className="flex items-center gap-2 py-4">
              <span
                className={cn(
                  "inline-block w-2 h-2 bg-[var(--accent-color)]",
                  "animate-[dotPulse_2s_ease-in-out_infinite]",
                )}
                style={{ borderRadius: "50%" }}
              />
              <span className="text-[11px] text-[var(--text-tertiary)]">
                RENDERING...
              </span>
            </div>
          )}

          {/* SVG container */}
          <div
            ref={ref}
            className={cn(
              "overflow-x-auto",
              "[&_svg]:max-w-full [&_svg]:h-auto",
              loading && "hidden",
            )}
          />
        </>
      ) : (
        <div className="h-32 bg-[var(--hover-bg)] rounded-lg animate-pulse" />
      )}
    </div>
  )
}

export { MermaidRenderer }
export type { MermaidRendererProps }

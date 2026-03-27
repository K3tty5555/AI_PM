import { useEffect, useRef, useState, useCallback } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LightboxProps {
  open: boolean
  src: string
  alt?: string
  fileName?: string
  dimensions?: string
  createdAt?: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function Lightbox({
  open,
  src,
  alt,
  fileName,
  dimensions,
  createdAt,
  onClose,
}: LightboxProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)

  // Reset loaded state when src changes or lightbox closes
  useEffect(() => {
    if (!open) setLoaded(false)
  }, [open, src])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  const handleLoad = useCallback(() => setLoaded(true), [])

  if (!open) return null

  const hasInfo = fileName || dimensions || createdAt

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/30 backdrop-blur-[4px]"
      style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
      role="dialog"
      aria-modal="true"
      aria-label={alt ?? fileName ?? "图片预览"}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-black/40 text-white/80 transition-colors hover:bg-black/60 hover:text-white cursor-pointer"
        aria-label="关闭"
      >
        <X className="size-5" />
      </button>

      {/* Image area */}
      <div className="relative flex items-center justify-center">
        {/* Skeleton placeholder */}
        {!loaded && (
          <div className="flex max-h-[85vh] max-w-[90vw] items-center justify-center">
            <div className="h-[320px] w-[480px] animate-pulse rounded-lg bg-white/10" />
          </div>
        )}

        <img
          src={src}
          alt={alt ?? fileName ?? ""}
          onLoad={handleLoad}
          className={cn(
            "max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-[var(--shadow-xl)] transition-opacity duration-150",
            loaded ? "opacity-100" : "opacity-0 absolute",
          )}
          draggable={false}
        />
      </div>

      {/* Bottom info bar */}
      {hasInfo && loaded && (
        <div className="mt-3 flex items-center gap-3 text-[13px] text-[var(--text-secondary)]">
          {fileName && <span>{fileName}</span>}
          {fileName && dimensions && (
            <span className="text-[var(--text-tertiary)]">&middot;</span>
          )}
          {dimensions && <span>{dimensions}</span>}
          {(fileName || dimensions) && createdAt && (
            <span className="text-[var(--text-tertiary)]">&middot;</span>
          )}
          {createdAt && <span>{createdAt}</span>}
        </div>
      )}
    </div>
  )
}

export { Lightbox }
export type { LightboxProps }

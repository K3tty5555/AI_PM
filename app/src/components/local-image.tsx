import { useState, useEffect } from "react"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { ImageOff } from "lucide-react"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LocalImageProps {
  /** Absolute path or output-relative path to the image file */
  src: string
  alt?: string
  className?: string
  onClick?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a local filesystem image inside the Tauri webview.
 *
 * Uses `api.readLocalImage` (Tauri command) to read the file as a base64 data
 * URL — the same approach used by the Illustration tool page.
 */
export function LocalImage({ src, alt, className, onClick }: LocalImageProps) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading")
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    setState("loading")
    setDataUrl(null)

    api
      .readLocalImage(src)
      .then((url) => {
        setDataUrl(url)
        setState("loaded")
      })
      .catch(() => {
        setState("error")
      })
  }, [src])

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (state === "loading") {
    return (
      <div
        className={cn(
          "animate-pulse rounded-lg bg-[var(--secondary)]",
          className,
        )}
        style={{ minHeight: 120 }}
      />
    )
  }

  // ── Error placeholder ───────────────────────────────────────────────────
  if (state === "error") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg",
          "border border-dashed border-[var(--border)] bg-[var(--secondary)] p-6",
          className,
        )}
      >
        <ImageOff className="size-6 text-[var(--text-tertiary)]" />
        <p className="text-sm text-[var(--text-tertiary)]">图片未找到</p>
        <p className="max-w-[300px] break-all text-center text-[12px] text-[var(--text-tertiary)]">
          {src}
        </p>
      </div>
    )
  }

  // ── Loaded ──────────────────────────────────────────────────────────────
  return (
    <img
      src={dataUrl || ""}
      alt={alt || ""}
      className={cn("rounded-lg", onClick && "cursor-pointer", className)}
      onClick={onClick}
      loading="lazy"
    />
  )
}

export type { LocalImageProps }

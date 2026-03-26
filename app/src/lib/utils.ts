import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Platform-aware file manager label: Finder (macOS) / 资源管理器 (Windows) / 文件管理器 (Linux) */
export const FILE_MANAGER_LABEL = navigator.userAgent.includes("Macintosh") || navigator.userAgent.includes("Mac OS")
  ? "Finder"
  : navigator.userAgent.includes("Windows")
    ? "资源管理器"
    : "文件管理器"

/**
 * Copy markdown content as rich text (HTML) to clipboard.
 * Extracts rendered HTML from the nearest PrdViewer DOM container if available,
 * falls back to plain-text copy otherwise.
 *
 * @param markdown - The raw markdown text (used as plain-text fallback)
 * @param containerSelector - Optional CSS selector to locate the rendered HTML container
 */
export async function copyRichText(
  markdown: string,
  containerSelector = "[data-slot='prd-viewer']",
): Promise<void> {
  // Try to grab rendered HTML from PrdViewer DOM
  let html: string | null = null
  const el = document.querySelector(containerSelector)
  if (el) {
    html = el.innerHTML
  }

  if (html && typeof ClipboardItem !== "undefined") {
    const htmlBlob = new Blob([html], { type: "text/html" })
    const textBlob = new Blob([markdown], { type: "text/plain" })
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      }),
    ])
  } else {
    await navigator.clipboard.writeText(markdown)
  }
}

/**
 * Extract a short status hint from streaming AI output.
 * Returns the last non-empty line that contains meaningful content,
 * stripped of markdown syntax, truncated to 20 chars.
 */
export function extractStreamStatus(text: string): string {
  if (!text) return ""
  const lines = text.split("\n")
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i].trim()
    if (!raw) continue
    // Strip markdown: headings, bullets, ordered lists, bold, code fences
    const stripped = raw
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*>]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .trim()
    if (stripped.length < 4) continue
    // Must contain at least one CJK char to be meaningful
    if (!/[\u4e00-\u9fff]/.test(stripped)) continue
    // Avoid double ellipsis
    const stripped2 = stripped.replace(/…$/, "").trim()
    // Truncate by codepoint (not code unit) to handle surrogate pairs correctly
    const chars = [...stripped2]
    return chars.length > 20 ? chars.slice(0, 20).join("") + "…" : stripped2 + "…"
  }
  return ""
}

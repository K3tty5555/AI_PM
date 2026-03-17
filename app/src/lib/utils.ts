import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

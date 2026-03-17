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
    // Strip markdown: headings, bullets, bold, code fences
    const stripped = raw
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*>]\s+/, "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .trim()
    if (stripped.length < 4) continue
    // Must contain at least one CJK char to be meaningful
    if (!/[\u4e00-\u9fff]/.test(stripped)) continue
    return stripped.length > 20 ? stripped.slice(0, 20) + "…" : stripped + "…"
  }
  return ""
}

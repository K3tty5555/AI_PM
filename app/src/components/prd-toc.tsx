import { useMemo } from "react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TocItem {
  id: string
  text: string
  level: 2 | 3
  index: string // monospace序号如 "01" "01.1"
}

interface PrdTocProps {
  markdown: string
  activeSection?: string
  onSectionClick: (id: string) => void
}

// ---------------------------------------------------------------------------
// Heading parser
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function parseHeadings(markdown: string): TocItem[] {
  const lines = markdown.split("\n")
  const items: TocItem[] = []
  let h2Count = 0
  let h3Count = 0

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)/)
    const h3Match = line.match(/^### (.+)/)

    if (h2Match) {
      h2Count++
      h3Count = 0
      const text = h2Match[1].trim()
      items.push({
        id: slugify(text),
        text,
        level: 2,
        index: String(h2Count).padStart(2, "0"),
      })
    } else if (h3Match) {
      h3Count++
      const text = h3Match[1].trim()
      items.push({
        id: slugify(text),
        text,
        level: 3,
        index: `${String(h2Count).padStart(2, "0")}.${h3Count}`,
      })
    }
  }

  return items
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function PrdToc({ markdown, activeSection, onSectionClick }: PrdTocProps) {
  const items = useMemo(() => parseHeadings(markdown), [markdown])

  if (items.length === 0) return null

  return (
    <nav
      data-slot="prd-toc"
      className={cn(
        "sticky top-0 max-h-[calc(100vh-200px)] overflow-y-auto",
        "border border-[var(--border)] bg-[var(--card)]",
        "p-4",
        "animate-[fadeInUp_0.28s_cubic-bezier(0.16,1,0.3,1)]",
      )}
    >
      {/* Title */}
      <div className="mb-3 pb-2 border-b border-[var(--border)]">
        <span className="text-[11px] font-semibold text-[var(--text-tertiary)]">
          TOC_NAV
        </span>
      </div>

      {/* Items */}
      <ul className="space-y-0.5">
        {items.map((item) => {
          const isActive = activeSection === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSectionClick(item.id)}
                className={cn(
                  "relative w-full text-left px-3 py-1.5",
                  "text-xs leading-relaxed",
                  "transition-all duration-[0.28s] ease-[cubic-bezier(0.16,1,0.3,1)]",
                  "cursor-pointer",
                  "hover:bg-[var(--accent-light)]",
                  item.level === 3 && "pl-7",
                  // Active state: yellow left bar
                  isActive && [
                    "bg-[var(--accent-light)]",
                    "before:absolute before:left-0 before:top-0 before:bottom-0",
                    "before:w-[3px] before:bg-[var(--accent-color)] before:content-['']",
                  ],
                )}
              >
                <span
                  className={cn(
                    "inline-block w-8 mr-1.5 text-[10px]",
                    isActive
                      ? "text-[var(--text-primary)] font-semibold"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  {item.index}
                </span>
                <span
                  className={cn(
                    isActive
                      ? "text-[var(--text-primary)] font-medium"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  {item.text}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export { PrdToc, slugify }
export type { PrdTocProps }

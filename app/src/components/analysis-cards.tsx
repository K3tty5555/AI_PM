import { useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { AccentStripeCard } from "@/components/accent-stripe-card"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalysisCardsProps {
  markdown: string
  isStreaming: boolean
}

interface Section {
  title: string
  content: string
  accent: "gold" | "teal" | "gray"
}

// ---------------------------------------------------------------------------
// Section parsing
// ---------------------------------------------------------------------------

function classifyAccent(title: string): "gold" | "teal" | "gray" {
  const t = title.toLowerCase()

  // Teal: user/persona related
  if (/用户|角色|画像|persona|user/.test(t)) return "teal"

  // Gold: pain-point, risk, feature, scope, priority
  if (/痛点|问题|风险|功能|范围|优先|核心|目标|价值|竞品|场景/.test(t)) return "gold"

  return "gray"
}

function parseSections(markdown: string): Section[] {
  if (!markdown.trim()) return []

  // Split by ## headings, keeping the heading text
  const parts = markdown.split(/^(?=## )/m)
  const sections: Section[] = []

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    // Check if this part starts with a ## heading
    const headingMatch = trimmed.match(/^## (.+)/)
    if (headingMatch) {
      const title = headingMatch[1].trim()
      const content = trimmed.slice(headingMatch[0].length).trim()
      sections.push({
        title,
        content,
        accent: classifyAccent(title),
      })
    } else {
      // Content before the first ## heading — treat as overview
      sections.push({
        title: "概述",
        content: trimmed,
        accent: "gray",
      })
    }
  }

  return sections
}

// ---------------------------------------------------------------------------
// Typing cursor component
// ---------------------------------------------------------------------------

function TypingCursor() {
  return (
    <span
      className={cn(
        "inline-block w-2 h-4 ml-0.5 align-middle",
        "bg-[var(--accent-color)]",
        "animate-[blink_1s_step-end_infinite]",
      )}
      aria-hidden
    />
  )
}

// ---------------------------------------------------------------------------
// Markdown renderer configuration
// ---------------------------------------------------------------------------

const markdownComponents = {
  h1: ({ children, ...props }: React.ComponentProps<"h1">) => (
    <h1
      className="text-lg font-semibold text-[var(--text-primary)] mt-3 mb-2"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: React.ComponentProps<"h2">) => (
    <h2
      className="text-base font-semibold text-[var(--text-primary)] mt-3 mb-2"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: React.ComponentProps<"h3">) => (
    <h3
      className="text-sm font-semibold text-[var(--text-primary)] mt-2 mb-1"
      {...props}
    >
      {children}
    </h3>
  ),
  p: ({ children, ...props }: React.ComponentProps<"p">) => (
    <p
      className="text-sm text-[var(--text-primary)] leading-relaxed mb-2 last:mb-0"
      {...props}
    >
      {children}
    </p>
  ),
  ul: ({ children, ...props }: React.ComponentProps<"ul">) => (
    <ul className="text-sm text-[var(--text-primary)] list-disc pl-5 mb-2 space-y-1" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: React.ComponentProps<"ol">) => (
    <ol className="text-sm text-[var(--text-primary)] list-decimal pl-5 mb-2 space-y-1" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }: React.ComponentProps<"li">) => (
    <li className="text-sm text-[var(--text-primary)] leading-relaxed" {...props}>
      {children}
    </li>
  ),
  strong: ({ children, ...props }: React.ComponentProps<"strong">) => (
    <strong className="font-semibold text-[var(--text-primary)]" {...props}>
      {children}
    </strong>
  ),
  blockquote: ({ children, ...props }: React.ComponentProps<"blockquote">) => (
    <blockquote
      className="border-l-2 border-[var(--accent-color)] pl-3 my-2 text-sm text-[var(--text-secondary)] italic"
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({
    className: codeClassName,
    children,
    ...props
  }: React.ComponentProps<"code">) => {
    // Inline code — no language class
    const isInline = !codeClassName
    if (isInline) {
      return (
        <code
          className="px-1 py-0.5 text-xs bg-[var(--secondary)] border border-[var(--border)] rounded font-sans"
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code className={cn(codeClassName, "text-xs")} {...props}>
        {children}
      </code>
    )
  },
  table: ({ children, ...props }: React.ComponentProps<"table">) => (
    <div className="overflow-x-auto mb-2">
      <table className="text-sm w-full border-collapse" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }: React.ComponentProps<"th">) => (
    <th
      className="border border-[var(--border)] px-3 py-1.5 text-left text-xs font-semibold bg-[var(--secondary)]"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }: React.ComponentProps<"td">) => (
    <td
      className="border border-[var(--border)] px-3 py-1.5 text-sm"
      {...props}
    >
      {children}
    </td>
  ),
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AnalysisCards({ markdown, isStreaming }: AnalysisCardsProps) {
  const sections = useMemo(() => parseSections(markdown), [markdown])

  if (sections.length === 0 && !isStreaming) {
    return null
  }

  // While streaming with no sections yet, show a placeholder
  if (sections.length === 0 && isStreaming) {
    return (
      <div className="flex items-center gap-3 py-8">
        <span
          className={cn(
            "inline-block w-2 h-2 bg-[var(--accent-color)]",
            "animate-[dotPulse_2s_ease-in-out_infinite]",
          )}
          style={{ borderRadius: "50%" }}
        />
        <span className="text-[12px] font-medium text-[var(--text-tertiary)]">
          正在分析...
        </span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {sections.map((section, index) => {
        const isLast = index === sections.length - 1

        return (
          <AccentStripeCard key={`${section.title}-${index}`} accent={section.accent}>
            {/* Card title */}
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              {section.title}
            </h3>

            {/* Markdown content */}
            <div className="prose-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {section.content}
              </ReactMarkdown>
            </div>

            {/* Typing cursor on last card during streaming */}
            {isStreaming && isLast && <TypingCursor />}
          </AccentStripeCard>
        )
      })}
    </div>
  )
}

export { AnalysisCards }
export type { AnalysisCardsProps }

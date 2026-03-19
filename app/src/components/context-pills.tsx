import { useState, useEffect } from "react"
import { api, type ContextFile } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

interface ContextPillsProps {
  projectId: string
  /** Called whenever excluded set changes */
  onExcludeChange: (excluded: string[]) => void
  className?: string
}

/** "ai-pm-interview-2026-03-17.md" → "Interview 03-17" */
function formatPillName(fileName: string): string {
  const base = fileName.replace(/^ai-pm-/, "").replace(/\.md$/, "")
  const dateMatch = base.match(/(\d{4})-(\d{2})-(\d{2})$/)
  if (dateMatch) {
    const toolPart = base.replace(/-\d{4}-\d{2}-\d{2}$/, "")
    const label = toolPart.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    return `${label} ${dateMatch[2]}-${dateMatch[3]}`
  }
  return base.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export function ContextPills({ projectId, onExcludeChange, className }: ContextPillsProps) {
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([])
  const [knowledgeCount, setKnowledgeCount] = useState(0)
  const [excluded, setExcluded] = useState<string[]>([])
  const [tooltip, setTooltip] = useState<{ name: string; preview: string } | null>(null)

  useEffect(() => {
    setExcluded([])
    onExcludeChange([])
    api.listProjectContext(projectId).then(setContextFiles).catch(console.error)
    api.listKnowledge().then((entries) => setKnowledgeCount(entries.length)).catch(console.error)
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (name: string) => {
    const next = excluded.includes(name)
      ? excluded.filter((n) => n !== name)
      : [...excluded, name]
    setExcluded(next)
    onExcludeChange(next)
  }

  if (contextFiles.length === 0 && knowledgeCount === 0) return null

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 py-3",
        className,
      )}
    >
      {/* Label */}
      <span className="text-[11px] font-medium text-[var(--text-tertiary)] shrink-0">上下文：</span>

      {/* Context file pills */}
      {contextFiles.map((file) => {
        const isExcluded = excluded.includes(file.name)
        return (
          <div
            key={file.name}
            className="relative"
            onMouseEnter={() => setTooltip(file)}
            onMouseLeave={() => setTooltip(null)}
          >
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors duration-200",
                isExcluded
                  ? "opacity-50 line-through border-[var(--border)] text-[var(--text-tertiary)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] hover:bg-[var(--accent-light)]"
              )}
            >
              {formatPillName(file.name)}
              <button
                type="button"
                onClick={() => toggle(file.name)}
                className="opacity-50 hover:opacity-100 transition-opacity"
                title={isExcluded ? "重新包含" : "排除此上下文"}
              >
                ×
              </button>
            </div>

            {/* Preview tooltip */}
            {tooltip?.name === file.name && (
              <div className="absolute bottom-full left-0 mb-1 z-50 w-64 p-3 rounded-lg bg-[var(--secondary)] border border-[var(--border)] shadow-lg">
                <p className="text-[11px] font-medium text-[var(--text-tertiary)] mb-1">
                  {file.name}
                </p>
                <p className="text-xs text-[var(--dark)] leading-relaxed line-clamp-4">
                  {file.preview}
                </p>
              </div>
            )}
          </div>
        )
      })}

      {/* Knowledge pill (no × — knowledge exclusion is out of scope) */}
      {knowledgeCount > 0 && (
        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border border-[var(--border)] text-[var(--text-secondary)]">
          知识库 · {knowledgeCount}条
        </span>
      )}
    </div>
  )
}

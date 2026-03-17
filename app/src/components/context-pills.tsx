import { useState, useEffect } from "react"
import { api, type ContextFile } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

interface ContextPillsProps {
  projectId: string
  /** Called whenever excluded set changes */
  onExcludeChange: (excluded: string[]) => void
  className?: string
}

/** "ai-pm-interview-2026-03-17.md" → "INTERVIEW 03-17" */
function formatPillName(fileName: string): string {
  const base = fileName.replace(/^ai-pm-/, "").replace(/\.md$/, "")
  const dateMatch = base.match(/(\d{4})-(\d{2})-(\d{2})$/)
  if (dateMatch) {
    const toolPart = base.replace(/-\d{4}-\d{2}-\d{2}$/, "").toUpperCase()
    return `${toolPart} ${dateMatch[2]}-${dateMatch[3]}`
  }
  return base.toUpperCase()
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
      <span className="font-terminal text-[10px] uppercase tracking-[2px] text-[var(--text-muted)] shrink-0">
        注入上下文：
      </span>

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
                "inline-flex items-center gap-1.5 px-2 py-0.5",
                "font-terminal text-[10px] uppercase tracking-[1px]",
                "border transition-colors duration-[var(--duration-terminal)]",
                isExcluded
                  ? "border-[var(--border)] text-[var(--text-muted)] opacity-40 line-through"
                  : "border-[var(--border)] text-[var(--dark)]"
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
              <div className="absolute bottom-full left-0 mb-1 z-50 w-64 p-3 bg-[var(--secondary)] border border-[var(--border)] shadow-lg">
                <p className="font-terminal text-[9px] uppercase tracking-[1px] text-[var(--text-muted)] mb-1">
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
        <span className="inline-flex items-center px-2 py-0.5 font-terminal text-[10px] uppercase tracking-[1px] border border-[var(--border)] text-[var(--text-muted)]">
          知识库 · {knowledgeCount}条
        </span>
      )}
    </div>
  )
}

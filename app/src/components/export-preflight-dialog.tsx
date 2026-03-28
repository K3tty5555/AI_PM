import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { SensitiveMatch, PlaceholderMatch } from "@/lib/tauri-api"
import type { MermaidBlock } from "@/lib/mermaid-utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportPreflightOptions {
  redact: boolean
  mermaidChoices: Record<number, "ai" | "local" | "skip">
  aiStyles: Record<number, { layout: string; style: string }>
}

interface ExportPreflightDialogProps {
  open: boolean
  sensitiveMatches: SensitiveMatch[]
  placeholderMatches: PlaceholderMatch[]
  mermaidBlocks: MermaidBlock[]
  onExport: (options: ExportPreflightOptions) => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type TabId = "sensitive" | "placeholder" | "mermaid"

interface TabDef {
  id: TabId
  label: string
  count: number
  icon: string
  severity: "error" | "warning" | "info"
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityColor(severity: "error" | "warning" | "info") {
  switch (severity) {
    case "error": return "var(--destructive)"
    case "warning": return "var(--warning)"
    case "info": return "var(--accent-color)"
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ExportPreflightDialog({
  open,
  sensitiveMatches,
  placeholderMatches,
  mermaidBlocks,
  onExport,
  onCancel,
}: ExportPreflightDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const [redact, setRedact] = useState(true)
  const [mermaidChoices, setMermaidChoices] = useState<Record<number, "ai" | "local" | "skip">>({})

  // Build visible tabs — only show categories with issues
  const tabs: TabDef[] = []
  if (sensitiveMatches.length > 0) {
    tabs.push({ id: "sensitive", label: "敏感信息", count: sensitiveMatches.length, icon: "\u26A0\uFE0F", severity: "error" })
  }
  if (placeholderMatches.length > 0) {
    tabs.push({ id: "placeholder", label: "占位符", count: placeholderMatches.length, icon: "\u2753", severity: "warning" })
  }
  if (mermaidBlocks.length > 0) {
    tabs.push({ id: "mermaid", label: "Mermaid 图表", count: mermaidBlocks.length, icon: "\uD83D\uDCC8", severity: "info" })
  }

  const [activeTab, setActiveTab] = useState<TabId>(tabs[0]?.id ?? "sensitive")

  // Reset active tab when tabs change
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some(t => t.id === activeTab)) {
      setActiveTab(tabs[0].id)
    }
  }, [tabs.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize mermaid choices
  useEffect(() => {
    if (mermaidBlocks.length > 0 && Object.keys(mermaidChoices).length === 0) {
      const defaults: Record<number, "ai" | "local" | "skip"> = {}
      mermaidBlocks.forEach(b => { defaults[b.index] = "skip" })
      setMermaidChoices(defaults)
    }
  }, [mermaidBlocks]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  // No issues at all — shouldn't show dialog, but handle gracefully
  if (tabs.length === 0) {
    onExport({ redact: false, mermaidChoices: {}, aiStyles: {} })
    return null
  }

  const handleExport = () => {
    const aiStyles: Record<number, { layout: string; style: string }> = {}
    mermaidBlocks.forEach(b => {
      if (mermaidChoices[b.index] === "ai") {
        aiStyles[b.index] = { layout: b.recommendedLayout, style: b.recommendedStyle }
      }
    })
    onExport({ redact, mermaidChoices, aiStyles })
  }

  const updateMermaidChoice = (index: number, choice: "ai" | "local" | "skip") => {
    setMermaidChoices(prev => ({ ...prev, [index]: choice }))
  }

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onCancel() }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[4px]"
      style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preflight-dialog-title"
        className="w-full max-w-[580px] rounded-xl bg-[var(--background)] p-6 shadow-[var(--shadow-xl)]"
        style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
      >
        {/* Title */}
        <h2
          id="preflight-dialog-title"
          className="mb-4 text-base font-semibold text-[var(--text-primary)]"
        >
          导出预检
        </h2>

        {/* Tab bar */}
        {tabs.length > 1 && (
          <div className="mb-4 flex gap-1 rounded-lg bg-[var(--card)] p-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors cursor-pointer",
                  activeTab === tab.id
                    ? "bg-[var(--background)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                {tab.icon} {tab.label}
                <span
                  className="ml-1.5 inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: severityColor(tab.severity) }}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Tab content */}
        <div className="mb-6 max-h-[360px] overflow-y-auto pr-1">
          {/* Sensitive info tab */}
          {activeTab === "sensitive" && sensitiveMatches.length > 0 && (
            <div className="space-y-2">
              {sensitiveMatches.map((m, i) => (
                <div
                  key={`s-${m.line}-${m.column}-${i}`}
                  className={cn(
                    "rounded-lg px-3 py-2.5",
                    m.severity === "high" ? "bg-[var(--destructive)]/5" : "bg-[var(--warning)]/5"
                  )}
                >
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className={cn(
                      "inline-block size-2 shrink-0 rounded-full",
                      m.severity === "high" ? "bg-[var(--destructive)]" : "bg-[var(--warning)]"
                    )} />
                    <span className="font-medium text-[var(--text-secondary)]">L{m.line}</span>
                    <span className="text-[var(--text-tertiary)]">&middot;</span>
                    <span className={cn(
                      "font-medium",
                      m.severity === "high" ? "text-[var(--destructive)]" : "text-[var(--warning)]"
                    )}>
                      {m.ruleName}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[13px] text-[var(--text-primary)]">{m.redacted}</p>
                  {m.context && (
                    <p className="mt-0.5 truncate text-[12px] text-[var(--text-tertiary)]">{m.context}</p>
                  )}
                </div>
              ))}

              {/* Redact toggle */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setRedact(!redact)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <span className={cn(
                    "inline-flex size-4 shrink-0 items-center justify-center border transition-colors",
                    redact
                      ? "border-[var(--accent-color)] bg-[var(--accent-color)]"
                      : "border-[var(--border)] bg-transparent"
                  )}>
                    {redact && <span className="block size-2 bg-white" />}
                  </span>
                  <span className="text-[13px] text-[var(--text-secondary)]">导出时脱敏处理</span>
                </button>
              </div>
            </div>
          )}

          {/* Placeholder tab */}
          {activeTab === "placeholder" && placeholderMatches.length > 0 && (
            <div className="space-y-2">
              {placeholderMatches.map((m, i) => (
                <div
                  key={`p-${m.line}-${m.column}-${i}`}
                  className="rounded-lg bg-[var(--warning)]/5 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="inline-block size-2 shrink-0 rounded-full bg-[var(--warning)]" />
                    <span className="font-medium text-[var(--text-secondary)]">L{m.line}</span>
                    <span className="text-[var(--text-tertiary)]">&middot;</span>
                    <span className="font-medium text-[var(--warning)]">{m.ruleName}</span>
                  </div>
                  <p className="mt-1 font-mono text-[13px] text-[var(--text-primary)]">{m.matchedText}</p>
                  {m.context && (
                    <p className="mt-0.5 truncate text-[12px] text-[var(--text-tertiary)]">{m.context}</p>
                  )}
                </div>
              ))}
              <p className="mt-2 text-[12px] text-[var(--text-tertiary)]">
                这些占位符可能是模板残留，建议导出前填写完整内容。
              </p>
            </div>
          )}

          {/* Mermaid tab */}
          {activeTab === "mermaid" && mermaidBlocks.length > 0 && (
            <div className="space-y-3">
              {mermaidBlocks.map(b => (
                <div key={b.index} className="rounded-lg bg-[var(--accent-light)] px-3 py-2.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-medium text-[var(--text-primary)]">
                      {b.chartType} (L{b.lineNumber})
                    </span>
                    <div className="flex gap-1">
                      {(["ai", "local", "skip"] as const).map(choice => (
                        <button
                          key={choice}
                          onClick={() => updateMermaidChoice(b.index, choice)}
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                            mermaidChoices[b.index] === choice
                              ? "bg-[var(--accent-color)] text-white"
                              : "bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                          )}
                        >
                          {choice === "ai" ? "AI 生图" : choice === "local" ? "本地渲染" : "跳过"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <pre className="mt-1.5 max-h-[60px] overflow-hidden text-[11px] text-[var(--text-tertiary)] font-mono leading-relaxed">
                    {b.code.slice(0, 120)}{b.code.length > 120 ? "..." : ""}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            返回编辑
          </button>
          <Button variant="primary" size="sm" onClick={handleExport}>
            导出
          </Button>
        </div>
      </div>
    </div>
  )
}

export { ExportPreflightDialog }
export type { ExportPreflightDialogProps }

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { cn } from "@/lib/utils"
import type { MermaidBlock } from "@/lib/mermaid-utils"
export type { MermaidBlock }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MermaidExportChoices {
  renderModes: Record<number, "ai" | "local" | "skip">
  aiStyles: Record<number, { layout: string; style: string }>
}

interface MermaidRenderDialogProps {
  open: boolean
  blocks: MermaidBlock[]
  onConfirm: (choices: MermaidExportChoices) => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type RenderMode = "ai" | "local" | "skip"

const MODE_ITEMS: { key: RenderMode; label: string }[] = [
  { key: "ai", label: "AI 生成" },
  { key: "local", label: "本地渲染" },
  { key: "skip", label: "跳过" },
]

const STYLE_LABELS: Record<string, string> = {
  "corporate-memphis": "扁平商务",
  "technical-schematic": "技术图示",
  "ikea-manual": "简约线条",
}

const CHART_TYPE_LABELS: Record<string, string> = {
  graph: "流程图",
  flowchart: "流程图",
  sequenceDiagram: "时序图",
  classDiagram: "类图",
  stateDiagram: "状态图",
  erDiagram: "ER 图",
  gantt: "甘特图",
  pie: "饼图",
  journey: "旅程图",
  gitGraph: "Git 图",
  mindmap: "思维导图",
  timeline: "时间线",
  quadrantChart: "象限图",
  sankey: "桑基图",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatStyleBadge(style: string, layout: string): string {
  const styleLabel = STYLE_LABELS[style] ?? style
  return `${styleLabel} · ${layout}`
}

function chartTypeDisplay(chartType: string): string {
  const label = CHART_TYPE_LABELS[chartType]
  return label ? `${chartType}（${label}）` : chartType
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function MermaidRenderDialog({
  open,
  blocks,
  onConfirm,
  onCancel,
}: MermaidRenderDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  // Per-block render mode; default all to "local"
  const [modes, setModes] = useState<Record<number, RenderMode>>({})

  // Reset state when dialog opens with new blocks
  useEffect(() => {
    if (open && blocks.length > 0) {
      const initial: Record<number, RenderMode> = {}
      for (const b of blocks) {
        initial[b.index] = "local"
      }
      setModes(initial)
    }
  }, [open, blocks])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onCancel])

  // Batch apply default mode
  const applyDefault = useCallback(
    (mode: RenderMode) => {
      const next: Record<number, RenderMode> = {}
      for (const b of blocks) {
        next[b.index] = mode
      }
      setModes(next)
    },
    [blocks],
  )

  // Set mode for single block
  const setBlockMode = useCallback((index: number, mode: RenderMode) => {
    setModes((prev) => ({ ...prev, [index]: mode }))
  }, [])

  // Confirm handler — assemble choices
  const handleConfirm = useCallback(() => {
    const renderModes: Record<number, RenderMode> = {}
    const aiStyles: Record<number, { layout: string; style: string }> = {}

    for (const b of blocks) {
      const mode = modes[b.index] ?? "local"
      renderModes[b.index] = mode
      if (mode === "ai") {
        aiStyles[b.index] = {
          layout: b.recommendedLayout,
          style: b.recommendedStyle,
        }
      }
    }

    onConfirm({ renderModes, aiStyles })
  }, [blocks, modes, onConfirm])

  // Count how many blocks chose AI
  const aiCount = Object.values(modes).filter((m) => m === "ai").length

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onCancel()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[4px]"
      style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mermaid-dialog-title"
        className="w-full max-w-[560px] rounded-xl bg-[var(--background)] p-6 shadow-[var(--shadow-xl)]"
        style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
      >
        {/* Title */}
        <h2
          id="mermaid-dialog-title"
          className="mb-4 text-base font-semibold text-[var(--text-primary)]"
        >
          流程图渲染方式
        </h2>

        {/* Separator */}
        <div className="mb-4 h-px bg-[var(--border)]" />

        {/* Default mode selector */}
        <div className="mb-4 flex items-center gap-3">
          <span className="shrink-0 text-[13px] text-[var(--text-secondary)]">
            默认渲染方式
          </span>
          <select
            className={cn(
              "h-7 rounded-md border border-[var(--border)] bg-[var(--card)] px-2",
              "text-[13px] text-[var(--text-primary)] outline-none",
              "focus:border-[var(--accent-color)]/60 focus:ring-2 focus:ring-[var(--accent-color)]/20",
              "transition-colors cursor-pointer",
            )}
            defaultValue="local"
            onChange={(e) => applyDefault(e.target.value as RenderMode)}
          >
            <option value="local">本地渲染</option>
            <option value="ai">AI 生成</option>
            <option value="skip">跳过</option>
          </select>
          <span className="text-[12px] text-[var(--text-tertiary)]">
            全部应用
          </span>
        </div>

        {/* Block list */}
        <div className="mb-4 max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {blocks.map((block) => {
            const mode = modes[block.index] ?? "local"
            return (
              <div
                key={block.index}
                className="rounded-lg bg-[var(--secondary)]/50 px-3 py-2.5"
              >
                {/* Header row: index + chart type + line number + mode control */}
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-[13px] font-medium text-[var(--text-primary)]">
                    #{block.index + 1}
                  </span>
                  <span className="text-[13px] font-medium text-[var(--accent-color)]">
                    {chartTypeDisplay(block.chartType)}
                  </span>
                  <span className="text-[12px] text-[var(--text-tertiary)]">
                    第 {block.lineNumber} 行
                  </span>
                  <div className="ml-auto shrink-0">
                    <SegmentedControl
                      value={mode}
                      onChange={(v) => setBlockMode(block.index, v)}
                      items={MODE_ITEMS}
                      className="text-[12px]"
                    />
                  </div>
                </div>

                {/* AI style recommendation — shown when mode is "ai" */}
                {mode === "ai" && (
                  <div
                    className="mt-2 flex items-center gap-2"
                    style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
                  >
                    <span className="text-[12px] text-[var(--text-tertiary)]">
                      推荐风格
                    </span>
                    <Badge variant="default">
                      {formatStyleBadge(
                        block.recommendedStyle,
                        block.recommendedLayout,
                      )}
                    </Badge>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Cost hint */}
        {aiCount > 0 && (
          <p className="mb-4 text-[12px] text-[var(--text-tertiary)]">
            已选择 {aiCount} 个流程图使用 AI 生成，将调用 API，会产生少量费用
          </p>
        )}
        {aiCount === 0 && (
          <p className="mb-4 text-[12px] text-[var(--text-tertiary)]">
            选择「AI 生成」将调用 API，会产生少量费用
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={handleConfirm}>
            导出
          </Button>
        </div>
      </div>
    </div>
  )
}

export { MermaidRenderDialog }
export type { MermaidRenderDialogProps }

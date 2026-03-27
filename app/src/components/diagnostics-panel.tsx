import { useState, useMemo } from "react"
import { ChevronDown, ChevronRight, Download, CheckCircle2, AlertTriangle, XCircle, Play, X } from "lucide-react"
import { useDiagnostics } from "@/hooks/use-diagnostics"
import { ProgressBar } from "@/components/ui/progress-bar"
import type { DiagnosticItem } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  dependency: "依赖检测",
  connectivity: "网络连通",
  local: "本地环境",
  config: "配置检查",
}

const EXPECTED_TOTAL = 12

// ── Helpers ─────────────────────────────────────────────────────────────────

function statusIcon(status: DiagnosticItem["status"]) {
  switch (status) {
    case "ok":
      return <CheckCircle2 className="size-4 shrink-0 text-green-600" />
    case "warning":
      return <AlertTriangle className="size-4 shrink-0 text-amber-500" />
    case "error":
    case "timeout":
      return <XCircle className="size-4 shrink-0 text-red-500" />
  }
}

function groupByCategory(items: DiagnosticItem[]) {
  const groups: Record<string, DiagnosticItem[]> = {}
  for (const item of items) {
    ;(groups[item.category] ??= []).push(item)
  }
  return groups
}

function hasIssue(items: DiagnosticItem[]) {
  return items.some((i) => i.status === "warning" || i.status === "error" || i.status === "timeout")
}

// ── Export Report ───────────────────────────────────────────────────────────

function buildReport(items: DiagnosticItem[]): string {
  const lines: string[] = [
    `AI PM 环境诊断报告`,
    `生成时间: ${new Date().toLocaleString("zh-CN")}`,
    `${"─".repeat(50)}`,
    "",
  ]

  const groups = groupByCategory(items)
  for (const [cat, list] of Object.entries(groups)) {
    lines.push(`## ${CATEGORY_LABELS[cat] ?? cat}`)
    for (const item of list) {
      const badge = item.status === "ok" ? "✅" : item.status === "warning" ? "⚠️" : "❌"
      lines.push(`  ${badge} ${item.name}: ${item.message} (${item.durationMs}ms)`)
      if (item.fixHint) lines.push(`     修复建议: ${item.fixHint}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

// ── CategoryGroup ───────────────────────────────────────────────────────────

function CategoryGroup({
  category,
  items,
  defaultOpen,
}: {
  category: string
  items: DiagnosticItem[]
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const passCount = items.filter((i) => i.status === "ok").length
  const allPassed = passCount === items.length

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-[var(--hover-bg)] rounded-xl"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-[var(--text-tertiary)]" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-[var(--text-tertiary)]" />
        )}
        <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">
          {CATEGORY_LABELS[category] ?? category}
        </span>
        <span
          className={cn(
            "text-xs",
            allPassed ? "text-green-600" : "text-amber-500",
          )}
        >
          {passCount}/{items.length} 通过
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-0 border-t border-[var(--border)]">
          {items.map((item) => (
            <div
              key={item.name}
              className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] last:border-b-0"
            >
              {statusIcon(item.status)}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-[var(--text-primary)]">{item.name}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">{item.durationMs}ms</span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{item.message}</p>
                {item.fixHint && (
                  <p className="mt-1 text-xs text-amber-500">
                    修复建议: {item.fixHint}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── DiagnosticsPanel ────────────────────────────────────────────────────────

export function DiagnosticsPanel() {
  const { items, summary, running, run, cancel } = useDiagnostics()

  const groups = useMemo(() => groupByCategory(items), [items])
  const progress = Math.round((items.length / EXPECTED_TOTAL) * 100)
  const isEmpty = items.length === 0 && !running

  const handleExport = () => {
    const text = buildReport(items)
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `diagnostics-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Summary row */}
      {summary && (
        <div className="flex items-center justify-between rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <span className="text-sm text-[var(--text-primary)]">
            {summary.total} 项检查，
            <span className="text-green-600">{summary.passed} 通过</span>
            {summary.warnings > 0 && (
              <>，<span className="text-amber-500">{summary.warnings} 警告</span></>
            )}
            {summary.errors > 0 && (
              <>，<span className="text-red-500">{summary.errors} 失败</span></>
            )}
          </span>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          >
            <Download className="size-3.5" />
            导出报告
          </button>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-[var(--card)] border border-[var(--border)] py-16">
          <div className="text-3xl opacity-30">🔍</div>
          <p className="text-sm text-[var(--text-tertiary)]">
            点击下方按钮开始环境检查
          </p>
        </div>
      )}

      {/* Category groups */}
      {Object.keys(groups).length > 0 && (
        <div className="flex flex-col gap-3">
          {Object.entries(groups).map(([cat, list]) => (
            <CategoryGroup
              key={cat}
              category={cat}
              items={list}
              defaultOpen={hasIssue(list)}
            />
          ))}
        </div>
      )}

      {/* Progress + action bar */}
      <div className="flex flex-col gap-3 rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
        {running && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-secondary)]">
                检测中... {items.length}/{EXPECTED_TOTAL}
              </span>
              <span className="text-xs text-[var(--text-tertiary)]">{progress}%</span>
            </div>
            <ProgressBar value={progress} animated />
          </div>
        )}

        <div className="flex items-center gap-2">
          {running ? (
            <button
              onClick={cancel}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--secondary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)]"
            >
              <X className="size-3.5" />
              取消
            </button>
          ) : (
            <button
              onClick={() => run(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] active:scale-[0.97]"
            >
              <Play className="size-3.5" />
              开始深度诊断
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

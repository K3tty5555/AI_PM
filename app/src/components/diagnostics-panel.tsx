import { useState, useMemo } from "react"
import { ChevronDown, ChevronRight, Download, CheckCircle2, AlertTriangle, XCircle, Play, X, ShieldCheck, Activity } from "lucide-react"
import { useDiagnostics } from "@/hooks/use-diagnostics"
import { ProgressBar } from "@/components/ui/progress-bar"
import { Button } from "@/components/ui/button"
import type { DiagnosticItem } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  dependency: "依赖检测",
  connectivity: "网络连通",
  local: "本地环境",
  config: "配置检查",
  ai_context: "AI 上下文",
}

const EXPECTED_TOTAL = 10

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

function getHealthScore(items: DiagnosticItem[]) {
  if (items.length === 0) return 0
  const penalty = items.reduce((sum, item) => {
    if (item.status === "error" || item.status === "timeout") return sum + 18
    if (item.status === "warning") return sum + 8
    return sum
  }, 0)
  return Math.max(0, Math.min(100, 100 - penalty))
}

function getHealthLabel(score: number, hasItems: boolean) {
  if (!hasItems) return "未体检"
  if (score >= 90) return "健康"
  if (score >= 70) return "需关注"
  return "需修复"
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
  const issueItems = useMemo(
    () => items.filter((item) => item.status === "warning" || item.status === "error" || item.status === "timeout"),
    [items],
  )
  const healthScore = summary ? getHealthScore(items) : 0
  const healthLabel = getHealthLabel(healthScore, items.length > 0)
  const primaryIssue = issueItems[0]

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
      <div className="grid gap-3 md:grid-cols-[240px_1fr]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--text-primary)]">Doctor</span>
            <ShieldCheck className="size-4 text-[var(--accent-color)]" />
          </div>
          <div className="mt-5 flex items-end gap-2">
            <span className="text-4xl font-semibold tabular-nums text-[var(--text-primary)]">
              {items.length > 0 ? healthScore : "--"}
            </span>
            <span className="pb-1 text-sm text-[var(--text-secondary)]">{healthLabel}</span>
          </div>
          <div className="mt-4">
            <ProgressBar value={items.length > 0 ? healthScore : 0} />
          </div>
          {summary && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-[var(--secondary)] px-2 py-2">
                <p className="text-sm font-semibold tabular-nums text-[var(--success)]">{summary.passed}</p>
                <p className="text-[11px] text-[var(--text-tertiary)]">通过</p>
              </div>
              <div className="rounded-lg bg-[var(--secondary)] px-2 py-2">
                <p className="text-sm font-semibold tabular-nums text-[var(--warning)]">{summary.warnings}</p>
                <p className="text-[11px] text-[var(--text-tertiary)]">警告</p>
              </div>
              <div className="rounded-lg bg-[var(--secondary)] px-2 py-2">
                <p className="text-sm font-semibold tabular-nums text-[var(--destructive)]">{summary.errors}</p>
                <p className="text-[11px] text-[var(--text-tertiary)]">失败</p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-sm)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-[var(--accent-color)]" />
                <h2 className="text-sm font-medium text-[var(--text-primary)]">诊断中心</h2>
              </div>
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                {primaryIssue
                  ? `${primaryIssue.name}: ${primaryIssue.message}`
                  : summary
                    ? "当前未发现阻断项"
                    : "检查依赖、AI 上下文、资源打包和本地环境"}
              </p>
              {primaryIssue?.fixHint && (
                <p className="mt-2 text-[12px] text-[var(--warning)]">建议：{primaryIssue.fixHint}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {summary && (
                <Button variant="ghost" size="sm" onClick={handleExport}>
                  <Download className="size-3.5" />
                  导出报告
                </Button>
              )}
              {running ? (
                <Button variant="ghost" size="sm" onClick={cancel}>
                  <X className="size-3.5" />
                  取消
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => run(false)}>
                    <Play className="size-3.5" />
                    快速检查
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => run(true)}>
                    <ShieldCheck className="size-3.5" />
                    深度诊断
                  </Button>
                </>
              )}
            </div>
          </div>

          {issueItems.length > 0 && (
            <div className="mt-4 grid gap-2">
              {issueItems.slice(0, 3).map((item) => (
                <div key={`${item.category}-${item.name}`} className="flex items-start gap-2 rounded-lg bg-[var(--secondary)] px-3 py-2">
                  {statusIcon(item.status)}
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[var(--text-primary)]">{item.name}</p>
                    <p className="text-[12px] text-[var(--text-secondary)]">{item.fixHint || item.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-[var(--card)] border border-[var(--border)] py-16">
          <ShieldCheck className="size-8 text-[var(--text-tertiary)]" />
          <p className="text-sm text-[var(--text-tertiary)]">
            选择快速检查或深度诊断开始体检
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

        {!running && summary && (
          <p className="text-[12px] text-[var(--text-tertiary)]">
            最近一次诊断完成，共 {summary.total} 项。
          </p>
        )}
      </div>
    </div>
  )
}

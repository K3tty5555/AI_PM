import { useEffect, useRef } from "react"
import { FileInput, FileOutput, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface PlanStep {
  label: string
  /** 可选耗时占比提示，例如 "约 50%" */
  weight?: string
}

export interface PlanModeContent {
  title: string
  steps: PlanStep[]
  reads: string[]
  writes: string[]
  /** 可选 token 预估，例如 "约 30k input / 8k output" */
  tokensHint?: string
  /** 备注（如 hybrid/agent 多 1 步） */
  note?: string
}

const PRD_PLAN: PlanModeContent = {
  title: "PRD 生成",
  steps: [
    { label: "PRD 生成前确认" },
    { label: "写作风格选择" },
    { label: "产品概述" },
    { label: "用户角色" },
    { label: "功能规格", weight: "最耗时·约 50%" },
    { label: "数据结构" },
    { label: "交互流程" },
    { label: "非功能需求" },
    { label: "落盘 + 摘要 + 成本记录" },
  ],
  reads: [
    "01-requirement-draft.md",
    "02-analysis-report.md",
    "03-competitor-report.md",
    "04-user-stories.md",
  ],
  writes: ["05-prd/05-PRD-v1.0.md（≥20KB 自动生成摘要）"],
  note: "agent / hybrid 产品多 1 步「Agent 专项设计」（共 10 步）。可在生成中随时取消。",
}

const PROTOTYPE_PLAN: PlanModeContent = {
  title: "原型生成",
  steps: [
    { label: "原型生成前确认" },
    { label: "原型蓝图 + 视觉方向" },
    { label: "动效档位选择" },
    { label: "页面框架搭建" },
    { label: "各页面生成", weight: "最耗时" },
    { label: "样式精修" },
    { label: "原型落盘 + 成本记录" },
    { label: "完整性 + 设计质量审计（自动）" },
    { label: "审计报告落盘" },
  ],
  reads: ["_summaries/prd-summary.md（或 05-prd/05-PRD-v1.0.md）"],
  writes: ["06-prototype/index.html", "07-audit-report.md"],
  note: "审计未达 9/12 分时会标红待修。可在生成中随时取消。",
}

export const PLAN_MODE_PRESETS: Record<"prd" | "prototype", PlanModeContent> = {
  prd: PRD_PLAN,
  prototype: PROTOTYPE_PLAN,
}

interface PlanModeDialogProps {
  open: boolean
  phase: "prd" | "prototype"
  /** 可覆盖默认计划（如 hybrid PRD 多步骤、有摘要等） */
  override?: Partial<PlanModeContent>
  onConfirm: () => void
  onCancel: () => void
}

export function PlanModeDialog({ open, phase, override, onConfirm, onCancel }: PlanModeDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const base = PLAN_MODE_PRESETS[phase]
  const plan: PlanModeContent = {
    ...base,
    ...override,
    steps: override?.steps ?? base.steps,
    reads: override?.reads ?? base.reads,
    writes: override?.writes ?? base.writes,
  }

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onConfirm()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onCancel, onConfirm])

  if (!open) return null

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
        aria-labelledby="plan-mode-dialog-title"
        className="w-full max-w-[560px] max-h-[85vh] overflow-y-auto rounded-xl bg-[var(--background)] p-6 shadow-[var(--shadow-xl)]"
        style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
      >
        <div className="mb-1 flex items-center gap-2">
          <h2 id="plan-mode-dialog-title" className="text-base font-semibold text-[var(--text-primary)]">
            即将开始：{plan.title}
          </h2>
        </div>
        <p className="mb-3 text-xs text-[var(--text-tertiary)]">执行前请确认计划。可在生成中随时取消。</p>
        <div className="mb-4 h-px bg-[var(--border)]" />

        {/* 步骤列表 */}
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">
            <Clock className="size-3.5" strokeWidth={1.75} />
            执行步骤（共 {plan.steps.length} 步）
          </div>
          <ol className="space-y-1.5">
            {plan.steps.map((step, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--secondary)]/40 px-3 py-2 text-[13px]"
              >
                <span className="tabular-nums text-[var(--text-tertiary)] w-5">{i + 1}.</span>
                <span className="flex-1 text-[var(--text-primary)]">{step.label}</span>
                {step.weight && (
                  <span className="text-[11px] text-[var(--accent-color)]">{step.weight}</span>
                )}
              </li>
            ))}
          </ol>
        </div>

        {/* 读取 / 写入文件 */}
        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">
              <FileInput className="size-3.5" strokeWidth={1.75} />
              读取文件
            </div>
            <ul className="space-y-1 text-[12px] font-mono text-[var(--text-secondary)]">
              {plan.reads.map((f, i) => (
                <li key={i} className="truncate">{f}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">
              <FileOutput className="size-3.5" strokeWidth={1.75} />
              写入文件
            </div>
            <ul className="space-y-1 text-[12px] font-mono text-[var(--text-secondary)]">
              {plan.writes.map((f, i) => (
                <li key={i} className="truncate">{f}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* token 提示 */}
        {plan.tokensHint && (
          <p className="mb-3 text-[12px] text-[var(--text-tertiary)]">预估 token：{plan.tokensHint}</p>
        )}

        {/* 备注 */}
        {plan.note && (
          <p className="mb-5 text-[12px] leading-relaxed text-[var(--text-tertiary)]">
            {plan.note}
          </p>
        )}

        <div className="mb-4 h-px bg-[var(--border)]" />

        {/* 操作按钮 */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono">⌘ Enter</kbd> 确认 ·{" "}
            <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono">Esc</kbd> 取消
          </span>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={onConfirm}>
              确认开始
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { useIllustration } from "@/hooks/use-illustration"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────────────

type InputMode = "mermaid" | "natural"

// ─── Main Component ─────────────────────────────────────────────────────────

export function ToolIllustrationPage() {
  const [mode, setMode] = useState<InputMode>("mermaid")
  const [input, setInput] = useState("")
  const { generating, result, error, generate, reset } = useIllustration()

  const handleGenerate = useCallback(() => {
    const text = input.trim()
    if (!text) return
    generate({ prompt: text })
  }, [input, generate])

  const handleReset = useCallback(() => {
    reset()
    setInput("")
  }, [reset])

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">AI 插图工具</h1>
        <span className="text-sm text-[var(--text-secondary)]">当前支持 Mermaid 流程图和自然语言描述生成</span>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {/* Input mode toggle */}
      <SegmentedControl
        value={mode}
        onChange={setMode}
        items={[
          { key: "mermaid", label: "Mermaid" },
          { key: "natural", label: "自然语言" },
        ]}
        className="mt-4"
      />

      {/* Input & action area — visible when idle */}
      {!generating && !result && !error && (
        <div className="mt-6">
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            {mode === "mermaid"
              ? "输入 Mermaid 语法，生成流程图"
              : "用自然语言描述你想要的插图"}
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              mode === "mermaid"
                ? "graph TD\n  A[开始] --> B{判断}\n  B -->|是| C[执行]\n  B -->|否| D[结束]"
                : "一个用户从注册到完成首单的流程示意图，包含注册、浏览商品、加入购物车、结算四个步骤"
            }
            rows={8}
            className={cn(
              "w-full rounded-lg px-4 py-3 text-sm",
              "bg-transparent border border-[var(--border)]",
              "placeholder:text-[var(--text-secondary)]",
              "outline-none resize-none",
              "focus:border-[var(--accent-color)] transition-[border-color]",
            )}
          />
          <div className="mt-3 flex justify-end">
            <Button variant="primary" onClick={handleGenerate} disabled={!input.trim()}>
              生成插图
            </Button>
          </div>
        </div>
      )}

      {/* Generating state */}
      {generating && (
        <div className="mt-6 flex flex-col items-center justify-center py-12">
          <svg className="size-6 animate-spin text-[var(--accent-color)]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">AI 绘制中...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[color-mix(in_srgb,var(--destructive)_5%,transparent)] px-4 py-3">
          <p className="text-sm text-[var(--destructive)]">{error}</p>
          <Button variant="ghost" size="sm" onClick={handleReset} className="mt-2">
            重置
          </Button>
        </div>
      )}

      {/* Success state */}
      {result && !generating && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] text-[var(--text-secondary)]">生成完成</span>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              重新生成
            </Button>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-8 text-center">
            <p className="text-sm text-[var(--text-primary)]">插图已生成</p>
            <p className="mt-1 text-[12px] text-[var(--text-tertiary)] break-all">{result.filePath}</p>
          </div>
        </div>
      )}

      {/* History gallery placeholder */}
      <div className="mt-10">
        <div className="mb-3 h-px bg-[var(--border)]" />
        <p className="px-1 pb-2 pt-1 text-[11px] font-medium text-[var(--text-tertiary)]">历史画廊</p>
        <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-12 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">还没有生成过插图</p>
        </div>
      </div>
    </div>
  )
}

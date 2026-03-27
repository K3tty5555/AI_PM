import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { useIllustration } from "@/hooks/use-illustration"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────────────

type InputMode = "mermaid" | "natural"

// ─── Mermaid Detection & Style Recommendations ──────────────────────────────

function detectMermaidType(code: string): string {
  const firstLine = code.trim().split("\n")[0].trim()
  for (const type of ["sequenceDiagram", "flowchart", "classDiagram", "graph"]) {
    if (firstLine.startsWith(type)) return type
  }
  return "graph"
}

const STYLE_RECOMMENDATIONS: Record<string, { layout: string; style: string; label: string }> = {
  graph:           { layout: "linear-progression", style: "corporate-memphis", label: "线性流程 × 扁平商务" },
  flowchart:       { layout: "linear-progression", style: "corporate-memphis", label: "线性流程 × 扁平商务" },
  sequenceDiagram: { layout: "linear-progression", style: "technical-schematic", label: "线性流程 × 技术图示" },
  classDiagram:    { layout: "structural-breakdown", style: "technical-schematic", label: "层级结构 × 技术图示" },
}

const ALL_STYLES = [
  { layout: "linear-progression", style: "corporate-memphis", label: "线性流程 × 扁平商务" },
  { layout: "linear-progression", style: "technical-schematic", label: "线性流程 × 技术图示" },
  { layout: "tree-branching", style: "corporate-memphis", label: "树状分支 × 扁平商务" },
  { layout: "hub-spoke", style: "ikea-manual", label: "中心辐射 × 简约线条" },
  { layout: "structural-breakdown", style: "technical-schematic", label: "层级结构 × 技术图示" },
]

// ─── Main Component ─────────────────────────────────────────────────────────

export function ToolIllustrationPage() {
  const [mode, setMode] = useState<InputMode>("mermaid")
  const [input, setInput] = useState("")
  const { generating, result, error, generate, cancel, reset } = useIllustration()

  // Style recommendation state
  const [styleExpanded, setStyleExpanded] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState<{ layout: string; style: string } | null>(null)
  const [customStyle, setCustomStyle] = useState("")
  const [customSelected, setCustomSelected] = useState(false)
  const radioGroupRef = useRef<HTMLDivElement>(null)

  // Detect mermaid type and compute recommended style
  const recommendedStyle = useMemo(() => {
    if (mode !== "mermaid") return STYLE_RECOMMENDATIONS["graph"]
    const mType = detectMermaidType(input)
    return STYLE_RECOMMENDATIONS[mType] ?? STYLE_RECOMMENDATIONS["graph"]
  }, [mode, input])

  // Auto-select recommended style when input changes (mermaid mode only)
  useEffect(() => {
    if (mode === "mermaid" && !customSelected) {
      setSelectedStyle({ layout: recommendedStyle.layout, style: recommendedStyle.style })
    }
  }, [mode, recommendedStyle, customSelected])

  const activeLabel = customSelected
    ? customStyle || "自定义风格"
    : selectedStyle
      ? ALL_STYLES.find((s) => s.layout === selectedStyle.layout && s.style === selectedStyle.style)?.label ?? recommendedStyle.label
      : recommendedStyle.label

  const handleGenerate = useCallback(() => {
    const text = input.trim()
    if (!text) return
    generate({
      prompt: text,
      stylePreset: customStyle || selectedStyle?.style || recommendedStyle.style,
      layout: selectedStyle?.layout || recommendedStyle.layout,
    })
  }, [input, generate, customStyle, selectedStyle, recommendedStyle])

  const handleReset = useCallback(() => {
    reset()
    setInput("")
    setSelectedStyle(null)
    setCustomStyle("")
    setCustomSelected(false)
  }, [reset])

  const handleStyleSelect = (layout: string, style: string) => {
    setSelectedStyle({ layout, style })
    setCustomSelected(false)
    setCustomStyle("")
    setStyleExpanded(false)
  }

  const handleCustomSelect = () => {
    setCustomSelected(true)
    setSelectedStyle(null)
  }

  // Keyboard navigation for radio group
  const handleRadioKeyDown = (e: React.KeyboardEvent, index: number) => {
    const total = ALL_STYLES.length + 1 // +1 for custom
    let next = -1

    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault()
      next = (index + 1) % total
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault()
      next = (index - 1 + total) % total
    }

    if (next >= 0 && radioGroupRef.current) {
      const items = radioGroupRef.current.querySelectorAll<HTMLElement>("[role='radio']")
      items[next]?.focus()
    }
  }

  const isRecommended = (s: typeof ALL_STYLES[number]) =>
    s.layout === recommendedStyle.layout && s.style === recommendedStyle.style

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

      {/* Input area — always visible */}
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
          disabled={generating}
          className={cn(
            "w-full rounded-lg px-4 py-3 text-sm",
            "bg-transparent border border-[var(--border)]",
            "placeholder:text-[var(--text-secondary)]",
            "outline-none resize-none",
            "focus:border-[var(--accent-color)] transition-[border-color]",
            generating && "opacity-60 cursor-not-allowed",
          )}
        />

        {/* Style recommendation panel (mermaid mode only) */}
        {mode === "mermaid" && (
          <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)]">
            {/* Collapsed header */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[var(--text-secondary)]">风格：</span>
                <span className="text-[var(--text-primary)]">{activeLabel}</span>
              </div>
              <button
                type="button"
                onClick={() => setStyleExpanded(!styleExpanded)}
                className="text-[13px] text-[var(--accent-color)] hover:underline"
              >
                {styleExpanded ? "收起" : "调整风格"}
              </button>
            </div>

            {/* Expanded style options */}
            {styleExpanded && (
              <div className="border-t border-[var(--border)] px-4 py-3">
                <div
                  ref={radioGroupRef}
                  role="radiogroup"
                  aria-label="风格选择"
                  className="flex flex-col gap-2"
                >
                  {ALL_STYLES.map((s, idx) => {
                    const checked =
                      !customSelected &&
                      selectedStyle?.layout === s.layout &&
                      selectedStyle?.style === s.style

                    return (
                      <div
                        key={`${s.layout}-${s.style}`}
                        role="radio"
                        aria-checked={checked}
                        tabIndex={checked ? 0 : -1}
                        onClick={() => handleStyleSelect(s.layout, s.style)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            handleStyleSelect(s.layout, s.style)
                          }
                          handleRadioKeyDown(e, idx)
                        }}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm cursor-pointer transition-colors",
                          "outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]",
                          checked
                            ? "border-[var(--accent-color)] bg-[color-mix(in_srgb,var(--accent-color)_6%,transparent)]"
                            : "border-[var(--border)] hover:border-[var(--border-hover,var(--border))]",
                        )}
                      >
                        {/* Radio indicator */}
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            checked
                              ? "border-[var(--accent-color)]"
                              : "border-[var(--text-tertiary)]",
                          )}
                        >
                          {checked && (
                            <span className="size-2 rounded-full bg-[var(--accent-color)]" />
                          )}
                        </span>
                        <span className="text-[var(--text-primary)]">{s.label}</span>
                        {isRecommended(s) && (
                          <span className="rounded-full bg-[color-mix(in_srgb,var(--accent-color)_12%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-color)]">
                            推荐
                          </span>
                        )}
                      </div>
                    )
                  })}

                  {/* Custom option */}
                  <div
                    role="radio"
                    aria-checked={customSelected}
                    tabIndex={customSelected ? 0 : -1}
                    onClick={handleCustomSelect}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleCustomSelect()
                      }
                      handleRadioKeyDown(e, ALL_STYLES.length)
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm cursor-pointer transition-colors",
                      "outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]",
                      customSelected
                        ? "border-[var(--accent-color)] bg-[color-mix(in_srgb,var(--accent-color)_6%,transparent)]"
                        : "border-[var(--border)] hover:border-[var(--border-hover,var(--border))]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        customSelected
                          ? "border-[var(--accent-color)]"
                          : "border-[var(--text-tertiary)]",
                      )}
                    >
                      {customSelected && (
                        <span className="size-2 rounded-full bg-[var(--accent-color)]" />
                      )}
                    </span>
                    <span className="text-[var(--text-primary)]">自定义</span>
                  </div>

                  {/* Custom style text input */}
                  {customSelected && (
                    <input
                      type="text"
                      value={customStyle}
                      onChange={(e) => setCustomStyle(e.target.value)}
                      placeholder="描述你想要的风格，例如：极简线条 + 低饱和配色"
                      className={cn(
                        "ml-7 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm",
                        "placeholder:text-[var(--text-secondary)]",
                        "outline-none focus:border-[var(--accent-color)] transition-[border-color]",
                      )}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action button */}
        <div className="mt-3 flex justify-end">
          {generating ? (
            <Button variant="ghost" onClick={cancel}>
              取消生成
            </Button>
          ) : (
            <Button variant="primary" onClick={handleGenerate} disabled={!input.trim()}>
              生成插图
            </Button>
          )}
        </div>
      </div>

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

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Lightbox } from "@/components/lightbox"
import { useIllustration } from "@/hooks/use-illustration"
import { useToast } from "@/hooks/use-toast"
import { api, type IllustrationEntry } from "@/lib/tauri-api"
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

// ─── Progress text helper ───────────────────────────────────────────────────

function getProgressText(elapsedSec: number): string {
  if (elapsedSec < 30) return "AI 绘制中..."
  if (elapsedSec < 60) return "生成时间较长，请耐心等待..."
  return "生成时间较长..."
}

// ─── Error hint helper ──────────────────────────────────────────────────────

function getErrorHint(error: string): { text: string; link?: string } | null {
  const lower = error.toLowerCase()
  if (lower.includes("api key") || lower.includes("apikey") || lower.includes("unauthorized") || lower.includes("未配置")) {
    return { text: "前往 API 配置", link: "/settings?tab=api" }
  }
  if (lower.includes("network") || lower.includes("timeout") || lower.includes("连接")) {
    return { text: "请检查网络连接后重试" }
  }
  return null
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ToolIllustrationPage() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [mode, setMode] = useState<InputMode>("mermaid")
  const [input, setInput] = useState("")
  const { generating, result, error, generate, cancel, reset } = useIllustration()

  // Style recommendation state
  const [styleExpanded, setStyleExpanded] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState<{ layout: string; style: string } | null>(null)
  const [customStyle, setCustomStyle] = useState("")
  const [customSelected, setCustomSelected] = useState(false)
  const radioGroupRef = useRef<HTMLDivElement>(null)

  // API Key warning
  const [apiKeyMissing, setApiKeyMissing] = useState(false)

  // Progress timer
  const [elapsedSec, setElapsedSec] = useState(0)

  // Image preview
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // Last generation args (for retry)
  const lastArgsRef = useRef<{ prompt: string; stylePreset?: string; layout?: string } | null>(null)

  // History gallery
  const [illustrations, setIllustrations] = useState<IllustrationEntry[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [thumbMap, setThumbMap] = useState<Record<string, string>>({})
  const [galleryLightbox, setGalleryLightbox] = useState<{ src: string; fileName: string } | null>(null)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)

  // ── Check API Key on mount ──────────────────────────────────────────────
  useEffect(() => {
    api.getIllustrationConfig().then((config) => {
      if (config.apiKeySource === "none") {
        setApiKeyMissing(true)
      }
    }).catch(() => {
      // Silently ignore — config fetch failure is not critical here
    })
  }, [])

  // ── Progress timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!generating) {
      setElapsedSec(0)
      return
    }
    setElapsedSec(0)
    const timer = setInterval(() => {
      setElapsedSec((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [generating])

  // ── Load image preview when result changes ──────────────────────────────
  useEffect(() => {
    if (!result) {
      setPreviewSrc(null)
      return
    }
    let cancelled = false
    api.readLocalImage(result.filePath).then((dataUrl) => {
      if (!cancelled) setPreviewSrc(dataUrl)
    }).catch(() => {
      // Fall back — preview unavailable
      if (!cancelled) setPreviewSrc(null)
    })
    return () => { cancelled = true }
  }, [result])

  // ── Load history gallery ─────────────────────────────────────────────────
  useEffect(() => {
    api.listIllustrations({}).then(setIllustrations).catch(() => {
      // Silently ignore — list fetch failure is not critical
    })
  }, [refreshKey])

  // Refresh gallery when a new image is generated
  useEffect(() => {
    if (result && !generating) {
      setRefreshKey((k) => k + 1)
    }
  }, [result, generating])

  // Load thumbnails for gallery entries
  useEffect(() => {
    if (illustrations.length === 0) return
    let cancelled = false
    const newMap: Record<string, string> = {}
    const loadAll = illustrations.map((entry) => {
      // Use thumbPath if available, otherwise fall back to filePath
      const imgPath = entry.thumbPath || entry.filePath
      return api.readLocalImage(imgPath).then((dataUrl) => {
        if (!cancelled) newMap[entry.filePath] = dataUrl
      }).catch(() => {
        // Skip entries that fail to load
      })
    })
    Promise.all(loadAll).then(() => {
      if (!cancelled) setThumbMap(newMap)
    })
    return () => { cancelled = true }
  }, [illustrations])

  // ── Gallery actions ────────────────────────────────────────────────────
  const handleGalleryClick = useCallback((entry: IllustrationEntry) => {
    // Load full image for lightbox
    api.readLocalImage(entry.filePath).then((dataUrl) => {
      setGalleryLightbox({ src: dataUrl, fileName: entry.fileName })
    }).catch(() => {
      toast("无法加载图片", "error")
    })
  }, [toast])

  const handleDeleteIllustration = useCallback((entry: IllustrationEntry, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingPath(entry.filePath)
  }, [])

  const confirmDelete = useCallback(() => {
    if (!deletingPath) return
    api.deleteIllustration(deletingPath).then(() => {
      toast("已删除", "success")
      setRefreshKey((k) => k + 1)
    }).catch(() => {
      toast("删除失败", "error")
    }).finally(() => {
      setDeletingPath(null)
    })
  }, [deletingPath, toast])

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
    const args = {
      prompt: text,
      stylePreset: customStyle || selectedStyle?.style || recommendedStyle.style,
      layout: selectedStyle?.layout || recommendedStyle.layout,
    }
    lastArgsRef.current = args
    generate(args)
  }, [input, generate, customStyle, selectedStyle, recommendedStyle])

  const handleRetry = useCallback(() => {
    if (lastArgsRef.current) {
      generate(lastArgsRef.current)
    }
  }, [generate])

  const handleReset = useCallback(() => {
    reset()
    setInput("")
    setSelectedStyle(null)
    setCustomStyle("")
    setCustomSelected(false)
    setPreviewSrc(null)
  }, [reset])

  const handleRegenerate = useCallback(() => {
    // Keep input, just re-generate
    reset()
    setPreviewSrc(null)
    handleGenerate()
  }, [reset, handleGenerate])

  const handleCopyReference = useCallback(() => {
    if (!result) return
    // Extract relative path (from output/ onwards)
    const outputIdx = result.filePath.indexOf("output/")
    const relativePath = outputIdx >= 0 ? result.filePath.slice(outputIdx) : result.filePath
    const markdown = `![插图](${relativePath})`
    navigator.clipboard.writeText(markdown).then(() => {
      toast("已复制到剪贴板", "success")
    }).catch(() => {
      toast("复制失败", "error")
    })
  }, [result, toast])

  const handleCopyPath = useCallback(() => {
    if (!result) return
    navigator.clipboard.writeText(result.filePath).then(() => {
      toast("路径已复制", "success")
    }).catch(() => {
      toast("复制失败", "error")
    })
  }, [result, toast])

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

      {/* API Key missing warning */}
      {apiKeyMissing && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-amber-300/40 bg-amber-50/60 px-4 py-2.5 dark:border-amber-500/30 dark:bg-amber-900/15">
          <svg className="size-4 shrink-0 text-amber-600 dark:text-amber-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span className="text-sm text-amber-800 dark:text-amber-300">
            请先在设置中配置图片生成 API Key
          </span>
          <button
            onClick={() => navigate("/settings?tab=api")}
            className="ml-auto text-[13px] font-medium text-amber-700 hover:underline dark:text-amber-400"
          >
            前往设置
          </button>
        </div>
      )}

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

      {/* Generating state — dynamic progress text + optional cancel */}
      {generating && (
        <div className="mt-6 flex flex-col items-center justify-center py-12">
          <svg className="size-6 animate-spin text-[var(--accent-color)]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            {getProgressText(elapsedSec)}
          </p>
          {elapsedSec >= 60 && (
            <button
              onClick={cancel}
              className="mt-2 text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] underline underline-offset-2 transition-colors"
            >
              取消
            </button>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[color-mix(in_srgb,var(--destructive)_5%,transparent)] px-4 py-3">
          <p className="text-sm text-[var(--destructive)]">{error}</p>
          {(() => {
            const hint = getErrorHint(error)
            if (!hint) return null
            return hint.link ? (
              <button
                onClick={() => navigate(hint.link!)}
                className="mt-1 text-[13px] text-[var(--accent-color)] hover:underline"
              >
                {hint.text}
              </button>
            ) : (
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{hint.text}</p>
            )
          })()}
          <div className="mt-2 flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleRetry}>
              重试
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              重置
            </Button>
          </div>
        </div>
      )}

      {/* Success state — image preview + actions */}
      {result && !generating && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] text-[var(--text-secondary)]">生成完成</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleCopyReference}>
                复制引用
              </Button>
              <Button variant="ghost" size="sm" onClick={handleRegenerate}>
                重新生成
              </Button>
            </div>
          </div>

          {/* Image preview card */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--secondary)] overflow-hidden">
            {previewSrc ? (
              <div className="flex justify-center px-4 py-6">
                <img
                  src={previewSrc}
                  alt="生成的插图"
                  onClick={() => setLightboxOpen(true)}
                  className="max-h-[420px] w-auto rounded-lg object-contain cursor-pointer transition-shadow hover:shadow-lg"
                  draggable={false}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center px-4 py-12">
                <div className="h-[200px] w-[300px] animate-pulse rounded-lg bg-[var(--border)]" />
              </div>
            )}

            {/* File info bar */}
            <div className="flex items-center gap-3 border-t border-[var(--border)] px-4 py-2.5">
              <p
                className="flex-1 truncate text-[12px] text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-secondary)] transition-colors"
                onClick={handleCopyPath}
                title="点击复制路径"
              >
                {result.filePath}
              </p>
              {result.width > 0 && result.height > 0 && (
                <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">
                  {result.width} x {result.height}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {previewSrc && result && (
        <Lightbox
          open={lightboxOpen}
          src={previewSrc}
          alt="生成的插图"
          fileName={result.filePath.split("/").pop()}
          dimensions={result.width > 0 && result.height > 0 ? `${result.width} x ${result.height}` : undefined}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* History gallery */}
      <div className="mt-10">
        <div className="mb-3 h-px bg-[var(--border)]" />
        <p className="px-1 pb-2 pt-1 text-[11px] font-medium text-[var(--text-tertiary)]">历史画廊</p>

        {illustrations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-12 text-center">
            <p className="text-sm text-[var(--text-tertiary)]">还没有生成过插图，试试上方的输入框</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {illustrations.map((entry) => {
              const thumb = thumbMap[entry.filePath]
              return (
                <div
                  key={entry.filePath}
                  className="relative group cursor-pointer"
                  onClick={() => handleGalleryClick(entry)}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={entry.fileName}
                      className="aspect-square w-full object-cover rounded-lg"
                      draggable={false}
                    />
                  ) : (
                    <div className="aspect-square w-full animate-pulse rounded-lg bg-[var(--secondary)]" />
                  )}

                  {/* Delete button — visible on hover */}
                  <button
                    type="button"
                    onClick={(e) => handleDeleteIllustration(entry, e)}
                    className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
                    aria-label="删除"
                  >
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>

                  {/* File name */}
                  <p className="mt-1 truncate text-[11px] text-[var(--text-tertiary)]">{entry.fileName}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Gallery Lightbox */}
      {galleryLightbox && (
        <Lightbox
          open={!!galleryLightbox}
          src={galleryLightbox.src}
          alt={galleryLightbox.fileName}
          fileName={galleryLightbox.fileName}
          onClose={() => setGalleryLightbox(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      {deletingPath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeletingPath(null)}>
          <div
            className="mx-4 w-full max-w-sm rounded-xl bg-[var(--bg-primary)] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-[var(--text-primary)]">确认删除这张插图？</p>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">删除后无法恢复</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeletingPath(null)}>
                取消
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete}>
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

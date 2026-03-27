import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ProgressBar } from "@/components/ui/progress-bar"
import { useAiStream } from "@/hooks/use-ai-stream"
import { api, type UiSpecEntry } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"
import { StreamProgress } from "@/components/StreamProgress"
import { cn, extractStreamStatus } from "@/lib/utils"
import { PHASE_META } from "@/lib/phase-meta"
import { PhaseEmptyState } from "@/components/phase-empty-state"
import { ContextPills } from "@/components/context-pills"
import { ReferenceFiles } from "@/components/reference-files"

const PROTOTYPE_FILE = "06-prototype.html"

const DEVICE_PRESETS = [
  { width: 375, label: "iPhone" },
  { width: 768, label: "iPad" },
  { width: 1024, label: "Laptop" },
  { width: 1440, label: "Desktop" },
] as const

// ── Types ──────────────────────────────────────────────────────────────

interface ManifestSection {
  id: string
  label: string
  file: string
  screenshot?: string
  description?: string
}

// ── CSS inlining helpers ───────────────────────────────────────────────

async function resolveImports(
  css: string,
  projectId: string,
  cssDir: string,
): Promise<string> {
  const importRe = /@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)\s*;?/gi
  const imports = [...css.matchAll(importRe)]
  if (!imports.length) return css

  let result = css
  for (const m of imports) {
    const href = m[1]
    if (/^https?:\/\/|^\/\//.test(href)) continue
    try {
      const imported = await api.readProjectFile(projectId, cssDir + href)
      if (imported) result = result.replace(m[0], imported)
    } catch { /* not found */ }
  }
  return result
}

async function inlineExternalCss(
  html: string,
  projectId: string,
  baseDir: string,
): Promise<string> {
  const linkRe = /<link\b[^>]*>/gi
  const matches = html.match(linkRe)
  if (!matches) return html

  let result = html
  for (const tag of matches) {
    if (!/rel\s*=\s*["']stylesheet["']/i.test(tag)) continue
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i)
    if (!hrefMatch) continue
    const href = hrefMatch[1]
    if (/^https?:\/\/|^\/\//.test(href)) continue

    const cssPath = baseDir + href
    const cssDir = cssPath.replace(/[^/]*$/, "")
    try {
      let css = await api.readProjectFile(projectId, cssPath)
      if (css) {
        css = await resolveImports(css, projectId, cssDir)
        result = result.replace(tag, `<style>\n${css}\n</style>`)
      }
    } catch {
      // CSS file not found — leave the link tag as-is
    }
  }

  return result
}

// ── Inline external <script src="..."> for Blob URL rendering ─────────

async function inlineExternalJs(
  html: string,
  projectId: string,
  baseDir: string,
): Promise<string> {
  const scriptRe = /<script\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi
  const matches = [...html.matchAll(scriptRe)]
  if (!matches.length) return html

  let result = html
  for (const m of matches) {
    const src = m[1]
    if (/^https?:\/\/|^\/\//.test(src)) continue
    try {
      const js = await api.readProjectFile(projectId, baseDir + src)
      if (js) {
        result = result.replace(m[0], `<script>\n${js}\n</script>`)
      }
    } catch { /* not found */ }
  }
  return result
}

// ── Audit report parser ───────────────────────────────────────────────

interface AuditItem {
  name: string
  status: "covered" | "partial" | "uncovered"
  note: string
}

interface AuditReport {
  coverage: { covered: number; total: number }
  items: AuditItem[]
}

function parseAuditReport(md: string): AuditReport {
  const items: AuditItem[] = []

  // Match markdown table rows: | name | status_emoji | note |
  const rowRe = /^\|(.+)\|(.+)\|(.+)\|$/gm
  let match: RegExpExecArray | null
  let headerSkipped = false

  while ((match = rowRe.exec(md)) !== null) {
    const col1 = match[1].trim()
    const col2 = match[2].trim()
    const col3 = match[3].trim()

    // Skip the header row and separator row
    if (/^-+$/.test(col1) || /^-+$/.test(col2) || /^-+$/.test(col3)) continue
    if (!headerSkipped) {
      // First non-separator row is the header
      headerSkipped = true
      continue
    }

    let status: AuditItem["status"] = "uncovered"
    if (col2.includes("\u2705") || col2.includes("covered") || col2.includes("\u2714")) {
      status = "covered"
    } else if (col2.includes("\u26A0") || col2.includes("partial")) {
      status = "partial"
    }
    // else ❌ or anything else → uncovered

    items.push({ name: col1, status, note: col3 })
  }

  const covered = items.filter(i => i.status === "covered" || i.status === "partial").length
  return {
    coverage: { covered, total: items.length },
    items,
  }
}

// ── Audit Card component ──────────────────────────────────────────────

function AuditCard({
  projectId,
  onSupplement,
}: {
  projectId: string
  onSupplement: (items: string[]) => void
}) {
  const [report, setReport] = useState<AuditReport | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.readProjectFile(projectId, "07-audit-report.md").then((content) => {
      if (cancelled || !content) return
      const parsed = parseAuditReport(content)
      if (parsed.items.length > 0) setReport(parsed)
    }).catch(() => { /* file not found — don't show card */ })
    return () => { cancelled = true }
  }, [projectId])

  if (!report) return null

  const { covered, total } = report.coverage
  const uncoveredItems = report.items.filter(i => i.status === "uncovered")
  const ratio = total > 0 ? covered / total : 0
  const coverageColor =
    ratio >= 1 ? "text-[var(--success)]"
      : ratio >= 0.8 ? "text-[var(--warning)]"
        : "text-[var(--destructive)]"

  const toggleItem = (name: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleConfirmSupplement = () => {
    setConfirmOpen(false)
    const items = Array.from(selectedItems)
    setSelectedItems(new Set())
    onSupplement(items)
  }

  return (
    <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-sm)] animate-[fadeInUp_250ms_var(--ease-decelerate)]">
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className={cn(
          "flex w-full items-center justify-between px-4 py-3",
          "text-left transition-colors duration-[var(--dur-base)] ease-[var(--ease-standard)]",
          "hover:bg-[var(--hover-bg)]",
          expanded && "border-b border-[var(--border)]",
        )}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          <span aria-hidden>&#x1F4CB;</span>
          {" "}原型完整性:{" "}
          <span className={cn("tabular-nums font-semibold", coverageColor)}>
            {covered}/{total}
          </span>
          {" "}覆盖
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          {expanded ? "收起 \u25B2" : "展开 \u25BC"}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 py-3 animate-[fadeInUp_200ms_var(--ease-decelerate)]">
          {/* Coverage table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2 pr-4 text-left text-[11px] font-semibold text-[var(--text-secondary)]">PRD 功能点</th>
                  <th className="py-2 pr-4 text-left text-[11px] font-semibold text-[var(--text-secondary)]">状态</th>
                  <th className="py-2 text-left text-[11px] font-semibold text-[var(--text-secondary)]">说明</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((item) => (
                  <tr key={item.name} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="py-2 pr-4 text-[var(--text-primary)]">{item.name}</td>
                    <td className="py-2 pr-4">
                      {item.status === "covered" && <span className="text-[var(--success)]">{"\u2705"}</span>}
                      {item.status === "partial" && <span className="text-[var(--warning)]">{"\u26A0\uFE0F"}</span>}
                      {item.status === "uncovered" && <span className="text-[var(--destructive)]">{"\u274C"}</span>}
                    </td>
                    <td className="py-2 text-[var(--text-secondary)]">{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Uncovered items checkboxes + supplement button */}
          {uncoveredItems.length > 0 && (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <p className="mb-2 text-[11px] font-medium text-[var(--text-tertiary)]">
                选择需要补充的功能点
              </p>
              <div className="flex flex-wrap gap-3">
                {uncoveredItems.map((item) => (
                  <label
                    key={item.name}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm",
                      "transition-colors duration-[var(--dur-base)] ease-[var(--ease-standard)]",
                      selectedItems.has(item.name)
                        ? "border-[var(--accent-color)] bg-[var(--accent-light)] text-[var(--accent-color)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)]/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.name)}
                      onChange={() => toggleItem(item.name)}
                      className="sr-only"
                    />
                    <span className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      "transition-colors duration-[var(--dur-base)]",
                      selectedItems.has(item.name)
                        ? "border-[var(--accent-color)] bg-[var(--accent-color)] text-white"
                        : "border-[var(--border)] bg-transparent",
                    )}>
                      {selectedItems.has(item.name) && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {item.name}
                  </label>
                ))}
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={selectedItems.size === 0}
                  onClick={() => setConfirmOpen(true)}
                >
                  补充选中项
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title="补充原型功能"
        description={`将为以下 ${selectedItems.size} 个未覆盖功能点重新生成原型：${Array.from(selectedItems).join("、")}。当前原型内容会被替换。`}
        confirmLabel="开始生成"
        cancelLabel="取消"
        variant="default"
        onConfirm={handleConfirmSupplement}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────

export function PrototypePage() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [deviceWidth, setDeviceWidth] = useState(0) // 0 = 全屏
  const [customWidth, setCustomWidth] = useState("")
  const [showDeviceMenu, setShowDeviceMenu] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [iframeHeight, setIframeHeight] = useState(680)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [excludedContext, setExcludedContext] = useState<string[]>([])
  const [protoDir, setProtoDir] = useState("")
  const startedRef = useRef(false)

  // Design spec selector
  const [designSpecs, setDesignSpecs] = useState<UiSpecEntry[]>([])
  const [selectedSpec, setSelectedSpec] = useState<string>("ai-contextual")

  // Single-file mode
  const [existingHtml, setExistingHtml] = useState<string | null>(null)

  // Multi-file mode
  const [manifest, setManifest] = useState<ManifestSection[] | null>(null)
  const [activePageId, setActivePageId] = useState("")
  const [pageHtml, setPageHtml] = useState<string | null>(null)

  const { text, isStreaming, isThinking, elapsedSeconds, streamMeta, toolStatus, error, start, reset } = useAiStream({
    projectId: projectId!,
    phase: "prototype",
  })

  useEffect(() => {
    if (!projectId) return
    Promise.all([
      api.listUiSpecs(),
      api.getProjectDesignSpec(projectId),
    ]).then(([specs, saved]) => {
      setDesignSpecs(specs)
      if (saved) setSelectedSpec(saved)
    }).catch((err) => console.error("[Prototype] spec load:", err))
  }, [projectId])

  const [searchParams] = useSearchParams()
  const autostart = searchParams.get("autostart") === "1"

  // ── Display logic ──────────────────────────────────────────────────

  // The HTML to show in iframe — differs by mode
  const displayHtml = manifest
    ? pageHtml                                                // multi-file: active page
    : existingHtml ?? (text && !isStreaming ? text : null)     // single-file

  // Detect truncated / incomplete HTML (single-file only)
  const isHtmlMissingStructure = !manifest && !!(displayHtml && !/<html[\s>]/i.test(displayHtml) && !/<head[\s>]/i.test(displayHtml) && !/<style[\s>]/i.test(displayHtml))
  const isHtmlMissingScripts = !manifest && !!(displayHtml && /onclick\s*=/i.test(displayHtml) && !/<script[\s>]/i.test(displayHtml))
  const isHtmlIncomplete = isHtmlMissingStructure || isHtmlMissingScripts

  // ── Detect & load prototype (used on mount and after streaming) ────

  const detectAndLoad = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false

    // 1. Multi-file: manifest.json
    try {
      const raw = await api.readProjectFile(projectId, "06-prototype/manifest.json")
      if (raw) {
        const parsed = JSON.parse(raw)
        const sections: ManifestSection[] = parsed.sections ?? []
        if (sections.length > 0) {
          setManifest(sections)
          setActivePageId(sections[0].id)
          setProtoDir("06-prototype/")
          setExistingHtml(null)
          return true
        }
      }
    } catch { /* not found or invalid */ }

    // 2. Single-file flat
    try {
      const html = await api.readProjectFile(projectId, PROTOTYPE_FILE)
      if (html) {
        setExistingHtml(html)
        setProtoDir("")
        setManifest(null)
        return true
      }
    } catch {}

    // 3. Single-file in directory
    try {
      const html = await api.readProjectFile(projectId, "06-prototype/index.html")
      if (html) {
        setExistingHtml(html)
        setProtoDir("06-prototype/")
        setManifest(null)
        return true
      }
    } catch {}

    return false
  }, [projectId])

  // ── Load on mount ──────────────────────────────────────────────────

  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    async function load() {
      try {
        const found = await detectAndLoad()
        if (!cancelled && !found && autostart && !startedRef.current) {
          startedRef.current = true
          start([{ role: "user", content: "请生成产品原型" }])
        }
      } catch (err) {
        console.error("Failed to load prototype:", err)
        if (!cancelled && !startedRef.current && autostart) {
          startedRef.current = true
          start([{ role: "user", content: "请生成产品原型" }])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [projectId, start, detectAndLoad])

  // ── After streaming ends → re-detect ───────────────────────────────

  const wasStreamingRef = useRef(false)
  useEffect(() => {
    const justFinished = wasStreamingRef.current && !isStreaming
    wasStreamingRef.current = isStreaming
    if (!justFinished || !projectId) return
    detectAndLoad()
  }, [isStreaming, projectId, detectAndLoad])

  // ── Load page HTML on tab switch (multi-file) ─────────────────────

  useEffect(() => {
    if (!manifest || !activePageId || !projectId) return
    const section = manifest.find(s => s.id === activePageId)
    if (!section) return

    let cancelled = false
    async function loadPage() {
      try {
        const html = await api.readProjectFile(projectId!, `06-prototype/${section!.file}`)
        if (!cancelled) setPageHtml(html)
      } catch {
        if (!cancelled) setPageHtml(null)
      }
    }
    setPageHtml(null) // clear while loading
    loadPage()
    return () => { cancelled = true }
  }, [activePageId, manifest, projectId])

  // ── Create blob URL from displayHtml ──────────────────────────────

  useEffect(() => {
    if (!displayHtml || !projectId) {
      setBlobUrl(null)
      return
    }

    let cancelled = false
    let currentUrl: string | null = null

    async function prepare() {
      let inlined = await inlineExternalCss(displayHtml!, projectId!, protoDir)
      inlined = await inlineExternalJs(inlined, projectId!, protoDir)
      if (cancelled) return

      // Inject resize script for iframe height auto-adaptation
      const resizeScript = `<script>(function(){try{var ro=new ResizeObserver(function(){parent.postMessage({type:'aipm-resize',height:document.documentElement.scrollHeight},'*')});ro.observe(document.body);parent.postMessage({type:'aipm-resize',height:document.documentElement.scrollHeight},'*')}catch(e){}})()</script>`
      const htmlWithResize = inlined.replace(/<\/body>/i, resizeScript + '</body>')
        || inlined.replace(/<\/html>/i, resizeScript + '</html>')
        || inlined + resizeScript

      const blob = new Blob([htmlWithResize], { type: "text/html" })
      currentUrl = URL.createObjectURL(blob)
      setBlobUrl(currentUrl)
    }

    prepare()

    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [displayHtml, projectId, protoDir])

  // ── iframe height auto-adaptation via postMessage ────────────────
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "aipm-resize" && typeof e.data.height === "number") {
        setIframeHeight(Math.max(400, Math.min(e.data.height + 16, window.innerHeight * 3)))
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])

  // ── Fullscreen Esc exit ─────────────────────────────────────────
  useEffect(() => {
    if (!isFullscreen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setIsFullscreen(false) }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isFullscreen])

  // ── Streaming progress ────────────────────────────────────────────

  const progressValue = isStreaming
    ? Math.min(90, Math.floor(text.length / 50))
    : (displayHtml || manifest) ? 100 : 0

  // ── Actions ───────────────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    startedRef.current = true
    start([{ role: "user", content: "请生成产品原型" }], { excludedContext, designSpec: selectedSpec })
  }, [start, excludedContext, selectedSpec])

  const handleRegenerate = useCallback(() => {
    reset()
    setExistingHtml(null)
    setManifest(null)
    setActivePageId("")
    setPageHtml(null)
    setBlobUrl(null)
    startedRef.current = true
    start([{ role: "user", content: "请重新生成产品原型" }], { excludedContext, designSpec: selectedSpec })
  }, [reset, start, excludedContext, selectedSpec])

  const handleAdvance = useCallback(async () => {
    if (!projectId) return
    setAdvancing(true)
    try {
      // Single-file from streaming: save to disk
      if (!existingHtml && !manifest && text) {
        await api.saveProjectFile({ projectId, fileName: PROTOTYPE_FILE, content: text })
      }
      await api.advancePhase(projectId)
      navigate(`/project/${projectId}/review?autostart=1`)
    } catch (err) {
      console.error("Failed to advance:", err)
      toast("推进阶段失败，请重试", "error")
      setAdvancing(false)
    }
  }, [projectId, existingHtml, manifest, text, navigate])

  const handleSupplement = useCallback((items: string[]) => {
    if (items.length === 0) return
    reset()
    setExistingHtml(null)
    setManifest(null)
    setActivePageId("")
    setPageHtml(null)
    setBlobUrl(null)
    startedRef.current = true
    const supplementPrompt = `请在现有原型基础上补充以下未覆盖的功能点：${items.join("、")}。保持已有页面不变，仅新增缺失部分。`
    start([{ role: "user", content: supplementPrompt }], { excludedContext, designSpec: selectedSpec })
  }, [reset, start, excludedContext, selectedSpec])

  // ── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-[var(--text-tertiary)]">加载中...</span>
      </div>
    )
  }

  if (!loading && !existingHtml && !manifest && !text && !isStreaming && !error) {
    return (
      <div className="mx-auto w-full max-w-[900px]">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-base font-semibold text-[var(--text-primary)]">原型设计</h1>
        </div>
        <div className="h-px bg-[var(--border)]" />
        <ContextPills
          projectId={projectId!}
          onExcludeChange={setExcludedContext}
          className="border-b border-[var(--border)]"
        />
        <ReferenceFiles projectId={projectId!} className="px-1 py-2 border-b border-[var(--border)]" />
        <div className="flex items-center gap-2 px-1 py-3 border-b border-[var(--border)]">
          <span className="text-xs text-[var(--text-secondary)] shrink-0">设计规范</span>
          <select
            value={selectedSpec}
            onChange={(e) => {
              const val = e.target.value
              setSelectedSpec(val)
              if (projectId) {
                api.setProjectDesignSpec(projectId, val).catch((err) => console.error("[Prototype]", err))
              }
            }}
            className={cn(
              "h-7 px-2 text-xs rounded-lg",
              "bg-[var(--secondary)] border border-[var(--border)]",
              "text-[var(--text-primary)]",
              "outline-none cursor-pointer",
              "hover:border-[var(--accent-color)]/60 transition-colors",
              "focus:border-[var(--accent-color)]",
            )}
          >
            <option value="ai-contextual">AI 情境定制</option>
            <option value="ant-design">Ant Design</option>
            <option value="material-design">Material Design</option>
            <option value="element-plus">Element Plus</option>
            {designSpecs.length > 0 && (
              <option disabled>──────</option>
            )}
            {designSpecs.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>
        <PhaseEmptyState
          phaseLabel="PROTOTYPE"
          description="交互原型"
          onGenerate={handleGenerate}
        />
      </div>
    )
  }

  const hasContent = !!(displayHtml || manifest)
  const canAdvance = hasContent && !isStreaming && !advancing

  return (
    <div className="mx-auto w-full max-w-[900px]">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">原型设计</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleRegenerate} disabled={isStreaming}>
            &#x21bb; 重新生成
          </Button>
        </div>
      </div>

      <div className="h-px bg-[var(--border)]" />

      <ContextPills
        projectId={projectId!}
        onExcludeChange={setExcludedContext}
        className="border-b border-[var(--border)]"
      />
      <ReferenceFiles projectId={projectId!} className="px-1 py-2 border-b border-[var(--border)]" />

      {/* Streaming progress */}
      {isStreaming && (
        <div className="mt-4">
          <ProgressBar value={progressValue} animated />
          {isThinking
            ? <p className="mt-2 text-[13px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">思考中...</p>
            : extractStreamStatus(text)
              ? <p className="mt-2 text-[13px] text-[var(--text-secondary)]">{extractStreamStatus(text)}</p>
              : null
          }
          <StreamProgress isStreaming={isStreaming} isThinking={isThinking} elapsedSeconds={elapsedSeconds} streamMeta={streamMeta} toolStatus={toolStatus} />
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
          <p className="text-sm text-[var(--destructive)]">{error}</p>
          <Button variant="ghost" size="sm" onClick={handleRegenerate} className="mt-2">重试</Button>
        </div>
      )}

      {/* Incomplete HTML warning (single-file only) */}
      {isHtmlIncomplete && !isStreaming && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--warning,#F59E0B)] bg-[var(--warning,#F59E0B)]/5 px-4 py-3">
          <p className="text-sm text-[var(--text-primary)]">
            {isHtmlMissingScripts
              ? "原型文件缺少交互脚本，按钮点击不会响应，建议重新生成。"
              : "原型文件不完整，可能是生成中断导致，建议重新生成。"}
          </p>
          <Button variant="ghost" size="sm" onClick={handleRegenerate} className="mt-2">重新生成</Button>
        </div>
      )}

      {/* Prototype preview */}
      {(blobUrl || (manifest && !pageHtml && !isStreaming)) && (
        <div className="mt-6 overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-sm)]">
          {/* Toolbar: device switcher + fullscreen */}
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--secondary)] px-4 py-2">
            <div className="flex items-center gap-1">
              {/* Device selector dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowDeviceMenu(v => !v)}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {deviceWidth === 0 ? "自适应" : `${deviceWidth}px`}
                  <span className="text-[10px]">▾</span>
                </button>
                {showDeviceMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowDeviceMenu(false)} />
                    <div className="absolute top-full left-0 mt-1 z-20 w-48 rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg py-1 animate-[fadeIn_100ms]">
                      <button
                        onClick={() => { setDeviceWidth(0); setShowDeviceMenu(false) }}
                        className={cn("w-full px-3 py-1.5 text-left text-[12px] hover:bg-[var(--hover-bg)] transition-colors",
                          deviceWidth === 0 ? "text-[var(--accent-color)] font-medium" : "text-[var(--text-secondary)]")}
                      >
                        自适应
                      </button>
                      {DEVICE_PRESETS.map(p => (
                        <button
                          key={p.width}
                          onClick={() => { setDeviceWidth(p.width); setShowDeviceMenu(false) }}
                          className={cn("w-full px-3 py-1.5 text-left text-[12px] hover:bg-[var(--hover-bg)] transition-colors flex justify-between",
                            deviceWidth === p.width ? "text-[var(--accent-color)] font-medium" : "text-[var(--text-secondary)]")}
                        >
                          <span>{p.label}</span>
                          <span className="tabular-nums text-[var(--text-tertiary)]">{p.width}px</span>
                        </button>
                      ))}
                      <div className="border-t border-[var(--border)] mt-1 pt-1 px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[var(--text-tertiary)]">自定义</span>
                          <input
                            type="number"
                            min={280}
                            max={2560}
                            value={customWidth}
                            onChange={e => setCustomWidth(e.target.value)}
                            onBlur={() => {
                              const v = parseInt(customWidth)
                              if (v && v >= 280 && v <= 2560) {
                                setDeviceWidth(v)
                                setShowDeviceMenu(false)
                              }
                            }}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                const v = parseInt(customWidth)
                                if (v && v >= 280 && v <= 2560) {
                                  setDeviceWidth(v)
                                  setShowDeviceMenu(false)
                                }
                              }
                            }}
                            placeholder="px"
                            className="w-20 h-6 px-1.5 text-[12px] tabular-nums rounded border border-[var(--border)] bg-transparent text-[var(--text-primary)] outline-none focus:border-[var(--accent-color)]"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Design spec badge */}
              <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border)]">
                {selectedSpec === "ai-contextual" ? "AI 情境定制"
                  : selectedSpec === "ant-design" ? "Ant Design"
                  : selectedSpec === "material-design" ? "Material Design"
                  : selectedSpec === "element-plus" ? "Element Plus"
                  : selectedSpec}
              </span>
              {/* Page count badge */}
              {manifest && manifest.length > 1 && (
                <span className="rounded-full bg-[var(--accent-light)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--accent-color)]">
                  {manifest.findIndex(s => s.id === activePageId) + 1} / {manifest.length}
                </span>
              )}
              {/* Fullscreen button */}
              <button
                onClick={() => setIsFullscreen(true)}
                className="rounded-md px-2 py-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                title="全屏预览"
              >
                ⛶
              </button>
            </div>
          </div>

          {/* Page tabs (multi-file mode) */}
          {manifest && manifest.length > 1 && (
            <div
              className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--secondary)] px-3 py-1.5"
              style={{ maskImage: "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)" }}
            >
              {manifest.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActivePageId(section.id)}
                  className={cn(
                    "shrink-0 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors duration-[var(--dur-base)] ease-[var(--ease-standard)] active:scale-[0.97] active:duration-[100ms]",
                    activePageId === section.id
                      ? "bg-[var(--accent-color)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {section.label}
                </button>
              ))}
            </div>
          )}

          {/* iframe container */}
          <div className="flex justify-center bg-[var(--secondary)]/30 py-4">
            {blobUrl && !isHtmlMissingStructure ? (
              <div
                key={activePageId || "single"}
                className="animate-[fadeInUp_250ms_var(--ease-decelerate)] transition-[width] duration-200"
                style={{ width: deviceWidth === 0 ? "100%" : Math.min(deviceWidth, 9999) }}
              >
                <iframe
                  ref={iframeRef}
                  src={blobUrl}
                  style={{
                    width: deviceWidth === 0 ? "100%" : deviceWidth,
                    height: iframeHeight,
                    border: "none",
                    ...(deviceWidth > 0 ? { boxShadow: "0 0 0 1px var(--border)" } : {}),
                  }}
                  title="原型预览"
                />
              </div>
            ) : (
              <div className="flex h-[400px] w-full flex-col gap-4 p-8">
                <div className="h-8 w-1/3 rounded-md bg-[var(--secondary)] animate-[indeterminate_1.5s_infinite]" />
                <div className="h-4 w-2/3 rounded-md bg-[var(--secondary)] animate-[indeterminate_1.5s_infinite]" />
                <div className="flex-1 rounded-lg bg-[var(--secondary)] animate-[indeterminate_1.5s_infinite]" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audit card — shown when 07-audit-report.md exists */}
      {hasContent && !isStreaming && projectId && (
        <AuditCard projectId={projectId} onSupplement={handleSupplement} />
      )}

      {/* Bottom action bar */}
      <div className="mt-8 flex items-center justify-between border-t border-[var(--border)] pt-6">
        <Button
          variant="ghost"
          onClick={() => navigate(`/project/${projectId}/analytics`)}
          disabled={isStreaming || advancing}
        >
          {PHASE_META.prototype.backLabel}
        </Button>
        <div className="flex flex-col items-end gap-1">
          <Button variant="primary" onClick={handleAdvance} disabled={!canAdvance}>
            {advancing ? "推进中..." : PHASE_META.prototype.nextLabel + " →"}
          </Button>
          {!advancing && (
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {PHASE_META.prototype.nextDescription}
            </p>
          )}
        </div>
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && blobUrl && (
        <div className="fixed inset-0 z-40 bg-white dark:bg-[var(--background)] animate-[fadeIn_150ms_ease]">
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <span className="text-[12px] text-[var(--text-tertiary)]">Esc 退出</span>
            <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(false)}>
              退出全屏
            </Button>
          </div>
          <iframe src={blobUrl} className="w-full h-full border-none" title="原型全屏预览" />
        </div>
      )}
    </div>
  )
}

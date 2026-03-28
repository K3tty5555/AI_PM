import { useState, useCallback, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { api, type PptxOutlineSlide, type ProjectSummary } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { ChevronUp, ChevronDown, Loader2, FileDown, FolderOpen } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3

interface ColorSchemeInfo {
  label: string
  colors: string[]
}

// ── Main Component ─────────────────────────────────────────────────────

export function ToolPptxPage() {
  const [searchParams] = useSearchParams()
  const { toast } = useToast()

  const preselectedProjectId = searchParams.get("projectId")

  // Wizard state
  const [step, setStep] = useState<WizardStep>(1)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(preselectedProjectId || "")
  const [colorSchemes, setColorSchemes] = useState<Record<string, ColorSchemeInfo>>({})
  const [schemeGroups, setSchemeGroups] = useState<Record<string, string[]>>({})
  const [industryDefaults, setIndustryDefaults] = useState<Record<string, string>>({})
  const [selectedScheme, setSelectedScheme] = useState("tech-blue")
  const [selectedStyle, setSelectedStyle] = useState("modern")
  const [outline, setOutline] = useState<PptxOutlineSlide[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [resultPath, setResultPath] = useState<string | null>(null)

  // Load projects + color schemes
  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => {})
    api.listPptxColorSchemes().then((data: Record<string, unknown>) => {
      const d = data as { groups: Record<string, string[]>; schemes: Record<string, ColorSchemeInfo>; industry_defaults: Record<string, string> }
      setSchemeGroups(d.groups)
      setColorSchemes(d.schemes)
      setIndustryDefaults(d.industry_defaults)
    }).catch(() => {})
  }, [])

  // Auto-select color scheme based on project industry
  useEffect(() => {
    if (!selectedProjectId) return
    const proj = projects.find(p => p.id === selectedProjectId)
    if (proj?.industry && industryDefaults[proj.industry]) {
      setSelectedScheme(industryDefaults[proj.industry])
    }
  }, [selectedProjectId, projects, industryDefaults])

  // Step 1 → generate outline
  const handleNext1 = useCallback(async () => {
    if (!selectedProjectId) return
    setLoading(true)
    try {
      const slides = await api.generatePptxOutline(selectedProjectId)
      setOutline(slides)
      setStep(2)
    } catch (err) {
      toast(String(err), "error")
    } finally {
      setLoading(false)
    }
  }, [selectedProjectId, toast])

  // Step 3 → generate PPTX
  const handleGenerate = useCallback(async () => {
    if (!selectedProjectId || outline.length === 0) return
    setGenerating(true)
    try {
      const result = await api.generatePptx(selectedProjectId, outline, selectedScheme, selectedStyle)
      setResultPath(result.path)
      toast(`PPT 已生成，共 ${result.slideCount} 页`, "success")
    } catch (err) {
      toast(String(err), "error")
    } finally {
      setGenerating(false)
    }
  }, [selectedProjectId, outline, selectedScheme, selectedStyle, toast])

  // Outline editing helpers
  const moveSlide = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= outline.length) return
    const arr = [...outline]
    ;[arr[index], arr[next]] = [arr[next], arr[index]]
    setOutline(arr)
  }

  const updateSlideTitle = (index: number, title: string) => {
    const arr = [...outline]
    arr[index] = { ...arr[index], title }
    setOutline(arr)
  }

  // ── Render ───────────────────────────────────────────────────────────

  const PAGE_TYPE_LABELS: Record<string, string> = {
    cover: "封面", section: "章节", content: "内容", chart: "图表", end: "结束",
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">演示文稿生成</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">从 PRD 自动生成 PPT 演示文稿</p>
        {/* Step indicator */}
        <div className="flex gap-2 mt-3">
          {[1, 2, 3].map(s => (
            <div key={s} className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              s <= step ? "bg-[var(--accent)]" : "bg-[var(--border)]"
            )} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Step 1: Source selection */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">选择项目 PRD</h2>
            <select
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)]"
            >
              <option value="">请选择项目...</option>
              {projects.filter(p => p.status === "active").map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <Button onClick={handleNext1} disabled={!selectedProjectId || loading} className="w-full">
              {loading ? <><Loader2 className="size-4 animate-spin mr-2" />分析 PRD 结构...</> : "下一步：生成大纲"}
            </Button>
          </div>
        )}

        {/* Step 2: Design scheme */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">设计方案</h2>

            {/* Style */}
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">风格</label>
              <div className="flex gap-2">
                {["modern", "corporate", "classic", "creative"].map(s => (
                  <button
                    key={s}
                    onClick={() => setSelectedStyle(s)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs border transition-colors",
                      selectedStyle === s
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50"
                    )}
                  >
                    {{ modern: "现代简约", corporate: "商务正式", classic: "经典学术", creative: "创意活泼" }[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Color schemes by group */}
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">配色方案</label>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {Object.entries(schemeGroups).map(([group, names]) => (
                  <div key={group}>
                    <div className="text-xs text-[var(--text-tertiary)] mb-1">{group}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {names.map(name => {
                        const scheme = colorSchemes[name]
                        if (!scheme) return null
                        return (
                          <button
                            key={name}
                            onClick={() => setSelectedScheme(name)}
                            className={cn(
                              "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border transition-colors",
                              selectedScheme === name
                                ? "border-[var(--accent)] bg-[var(--accent)]/10"
                                : "border-[var(--border)] hover:border-[var(--accent)]/50"
                            )}
                          >
                            <div className="flex">
                              {scheme.colors.slice(0, 3).map((c, i) => (
                                <div key={i} className="size-3 rounded-full -ml-0.5 first:ml-0 border border-white/50" style={{ backgroundColor: c }} />
                              ))}
                            </div>
                            <span className="text-[var(--text-primary)]">{scheme.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>上一步</Button>
              <Button onClick={() => setStep(3)} className="flex-1">下一步：确认大纲</Button>
            </div>
          </div>
        )}

        {/* Step 3: Outline confirmation */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">
              幻灯片大纲（共 {outline.length} 页）
            </h2>
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {outline.map((slide, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)]">
                  <span className="text-xs text-[var(--text-tertiary)] w-5 text-right shrink-0">{idx + 1}</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
                    slide.pageType === "cover" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" :
                    slide.pageType === "section" ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" :
                    slide.pageType === "end" ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" :
                    "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                  )}>
                    {PAGE_TYPE_LABELS[slide.pageType] || slide.pageType}
                  </span>
                  <input
                    value={slide.title}
                    onChange={e => updateSlideTitle(idx, e.target.value)}
                    className="flex-1 text-sm bg-transparent text-[var(--text-primary)] outline-none"
                  />
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => moveSlide(idx, -1)} disabled={idx === 0} className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30">
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button onClick={() => moveSlide(idx, 1)} disabled={idx === outline.length - 1} className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30">
                      <ChevronDown className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Result */}
            {resultPath && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <FileDown className="size-5 text-green-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">PPT 已生成</p>
                  <p className="text-xs text-green-600 dark:text-green-400 truncate">{resultPath}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => api.revealFile(resultPath)}>
                  <FolderOpen className="size-4 mr-1" />打开
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(2)}>上一步</Button>
              <Button onClick={handleGenerate} disabled={generating} className="flex-1">
                {generating ? <><Loader2 className="size-4 animate-spin mr-2" />生成中...</> : "生成 PPT"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

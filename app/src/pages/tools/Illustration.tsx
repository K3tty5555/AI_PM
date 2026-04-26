import { useCallback, useEffect, useMemo, useState } from "react"
import { Copy, ExternalLink, ImagePlus, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LocalImage } from "@/components/local-image"
import { ProjectSelector } from "@/components/project-selector"
import { api, type IllustrationConfigState, type IllustrationEntry, type IllustrationResult } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const STYLE_OPTIONS = ["专业商务", "扁平信息图", "蓝白技术文档", "教育产品", "极简线框"] as const
const LAYOUT_OPTIONS = ["横版", "纵版", "流程图", "决策树", "架构图"] as const

function formatSize(bytes: number) {
  if (!bytes) return "-"
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function defaultPrompt() {
  return [
    "flowchart LR",
    "  A[用户提出需求] --> B[AI 需求澄清]",
    "  B --> C[生成 PRD]",
    "  C --> D[PM 体检]",
    "  D --> E[评审修订]",
  ].join("\n")
}

export function ToolIllustrationPage() {
  const { toast } = useToast()
  const [boundProjectId, setBoundProjectId] = useState<string | null>(
    localStorage.getItem("tool-binding:illustration")
  )
  const [projectDir, setProjectDir] = useState<string | undefined>()
  const [config, setConfig] = useState<IllustrationConfigState | null>(null)
  const [prompt, setPrompt] = useState(defaultPrompt)
  const [stylePreset, setStylePreset] = useState<(typeof STYLE_OPTIONS)[number]>("专业商务")
  const [layout, setLayout] = useState<(typeof LAYOUT_OPTIONS)[number]>("横版")
  const [size, setSize] = useState("2560x1440")
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<IllustrationResult | null>(null)
  const [items, setItems] = useState<IllustrationEntry[]>([])
  const [deletingPath, setDeletingPath] = useState<string | null>(null)

  useEffect(() => {
    if (boundProjectId) localStorage.setItem("tool-binding:illustration", boundProjectId)
    else localStorage.removeItem("tool-binding:illustration")
  }, [boundProjectId])

  useEffect(() => {
    let cancelled = false
    if (!boundProjectId) {
      setProjectDir(undefined)
      return
    }
    api.getProject(boundProjectId)
      .then((project) => {
        if (!cancelled) setProjectDir(project?.outputDir)
      })
      .catch(() => {
        if (!cancelled) setProjectDir(undefined)
      })
    return () => { cancelled = true }
  }, [boundProjectId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const cfg = await api.getIllustrationConfig()
      setConfig(cfg)
      setSize(cfg.defaultSize)
      const list = await api.listIllustrations({ projectDir, limit: 24 })
      setItems(list)
    } catch (err) {
      toast(String(err), "error")
    } finally {
      setLoading(false)
    }
  }, [projectDir, toast])

  useEffect(() => { load() }, [load])

  const sizeOptions = useMemo(() => {
    const provider = config?.availableProviders.find((p) => p.id === config.provider)
    return provider?.sizes ?? ["2560x1440", "1920x1080", "1440x900", "1024x1024"]
  }, [config])

  const canGenerate = prompt.trim().length >= 8 && !generating && config?.apiKeySource !== "none"

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return
    setGenerating(true)
    setResult(null)
    try {
      const output = await api.generateIllustration({
        prompt,
        stylePreset,
        layout,
        size,
        projectDir,
      })
      setResult(output)
      toast("插图已生成", "success")
      const list = await api.listIllustrations({ projectDir, limit: 24 })
      setItems(list)
    } catch (err) {
      toast(String(err), "error")
    } finally {
      setGenerating(false)
    }
  }, [canGenerate, layout, projectDir, prompt, size, stylePreset, toast])

  const handleDelete = useCallback(async (path: string) => {
    setDeletingPath(path)
    try {
      await api.deleteIllustration(path)
      setItems((prev) => prev.filter((item) => item.filePath !== path))
      if (result?.filePath === path) setResult(null)
      toast("已删除插图", "success")
    } catch (err) {
      toast(String(err), "error")
    } finally {
      setDeletingPath(null)
    }
  }, [result?.filePath, toast])

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path)
    toast("路径已复制", "success")
  }, [toast])

  return (
    <div className="mx-auto w-full max-w-[1040px]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-[var(--text-primary)]">流程图配图</h1>
          <span className="text-sm text-[var(--text-secondary)]">Mermaid / 自然语言转产品文档插图</span>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading || generating}>
          <RefreshCw className="size-3.5" />
          刷新
        </Button>
      </div>
      <div className="h-px bg-[var(--border)]" />

      <ProjectSelector
        toolKey="illustration"
        value={boundProjectId}
        onChange={setBoundProjectId}
        className="mt-4"
      />

      {config?.apiKeySource === "none" && (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-3">
          <p className="text-sm text-[var(--text-secondary)]">
            未配置 ARK_API_KEY。请先到设置中配置火山引擎 Key；生成插图会产生 API 费用。
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">输入内容</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className={cn(
                "min-h-[260px] w-full resize-y rounded-lg border border-[var(--border)]",
                "bg-[var(--background)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]",
                "outline-none transition-colors focus:border-[var(--accent-color)]",
              )}
              placeholder="粘贴 Mermaid 代码，或用自然语言描述要生成的产品流程图"
              disabled={generating}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs text-[var(--text-secondary)]">风格</span>
              <select
                value={stylePreset}
                onChange={(e) => setStylePreset(e.target.value as typeof stylePreset)}
                className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 text-sm outline-none focus:border-[var(--accent-color)]"
              >
                {STYLE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-[var(--text-secondary)]">布局</span>
              <select
                value={layout}
                onChange={(e) => setLayout(e.target.value as typeof layout)}
                className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 text-sm outline-none focus:border-[var(--accent-color)]"
              >
                {LAYOUT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-[var(--text-secondary)]">尺寸</span>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 text-sm outline-none focus:border-[var(--accent-color)]"
              >
                {sizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleGenerate} disabled={!canGenerate}>
              <ImagePlus className="size-4" />
              {generating ? "生成中..." : "生成插图"}
            </Button>
            <Button variant="ghost" onClick={() => setPrompt(defaultPrompt())} disabled={generating}>
              使用示例
            </Button>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">当前配置</h2>
            <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
              <p>服务商：{config?.provider ?? "-"}</p>
              <p>模型：{config?.model ?? "-"}</p>
              <p>Key：{config?.apiKeyMasked ?? "未配置"}</p>
              <p>输出：{projectDir ? "当前项目 11-illustrations/" : "本地插图库"}</p>
            </div>
          </div>

          {result && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
              <h2 className="mb-3 text-sm font-medium text-[var(--text-primary)]">最新生成</h2>
              <LocalImage src={result.filePath} alt="最新插图" className="aspect-video w-full object-cover" />
              <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                <span>{result.width} x {result.height}</span>
                <span>{formatSize(result.sizeBytes)}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" size="xs" onClick={() => handleCopyPath(result.filePath)}>
                  <Copy className="size-3" />
                  复制路径
                </Button>
                <Button variant="ghost" size="xs" onClick={() => api.revealFile(result.filePath)}>
                  <ExternalLink className="size-3" />
                  定位
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">最近插图</h2>
          <span className="text-xs text-[var(--text-tertiary)]">{items.length} 张</span>
        </div>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] py-12 text-center">
            <p className="text-sm text-[var(--text-tertiary)]">暂无插图</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={item.filePath} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
                <LocalImage src={item.thumbPath || item.filePath} alt={item.fileName} className="aspect-video w-full object-cover" />
                <div className="mt-2 min-h-[42px]">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">{item.fileName}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">{item.prompt || "未记录 prompt"}</p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-[var(--text-tertiary)]">{formatSize(item.sizeBytes)}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopyPath(item.filePath)}
                      className="flex size-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors"
                      title="复制路径"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => api.revealFile(item.filePath)}
                      className="flex size-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors"
                      title="定位文件"
                    >
                      <ExternalLink className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.filePath)}
                      disabled={deletingPath === item.filePath}
                      className="flex size-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--destructive)]/10 hover:text-[var(--destructive)] transition-colors disabled:opacity-40"
                      title="删除"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

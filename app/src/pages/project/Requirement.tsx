import { useEffect, useState, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Upload } from "lucide-react"
import { open as dialogOpen } from "@tauri-apps/plugin-dialog"
import { Button } from "@/components/ui/button"
import { RichEditor } from "@/components/rich-editor"
import { FileUpload } from "@/components/file-upload"
import { api } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { ReferenceFiles } from "@/components/reference-files"

interface ProjectData {
  id: string
  name: string
  description: string | null
  currentPhase: string
}

const DRAFT_FILE = "01-requirement-draft.md"

export function RequirementPage() {
  const params = useParams()
  const navigate = useNavigate()
  const projectId = params?.id as string
  const { toast } = useToast()

  const [project, setProject] = useState<ProjectData | null>(null)
  const [content, setContent] = useState("")
  const [initialContent, setInitialContent] = useState<string | undefined>(
    undefined
  )
  const [files, setFiles] = useState<File[]>([])
  const [urlInput, setUrlInput] = useState("")
  const [urls, setUrls] = useState<string[]>([])
  const [teamMode, setTeamMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [saveHint, setSaveHint] = useState("")
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState(false)

  const handleImportFile = useCallback(async () => {
    const selected = await dialogOpen({
      multiple: false,
      filters: [{ name: "文档", extensions: ["txt", "md", "docx"] }],
    })
    if (!selected || typeof selected !== "string") return

    try {
      let imported: string
      if (selected.endsWith(".docx")) {
        imported = await api.extractDocxText(selected)
      } else {
        imported = await api.readFile(selected)
      }
      if (!imported.trim()) {
        toast("文件内容为空", "warning")
        return
      }
      const separator = `\n\n---\n*以下内容导入于 ${new Date().toLocaleString("zh-CN")}*\n\n`
      setContent((prev) => (prev ? prev + separator + imported : imported))
      setInitialContent((prev) => (prev ? prev + separator + imported : imported))
      toast(`已导入 ${imported.length} 字内容`, "success")
    } catch (err) {
      toast(String(err), "error")
    }
  }, [toast])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!["txt", "md", "docx"].includes(ext ?? "")) {
      toast("不支持该文件格式，请使用 .md .txt .docx 文件", "error")
      return
    }
    if (ext === "docx") {
      // For docx, we need the file path — Tauri drag events don't give us the path directly
      // Fall back to reading via FileReader for txt/md; docx needs the file picker
      toast("DOCX 文件请使用导入按钮选择", "info")
      return
    }
    const text = await file.text()
    if (!text.trim()) {
      toast("文件内容为空", "warning")
      return
    }
    const separator = `\n\n---\n*以下内容导入于 ${new Date().toLocaleString("zh-CN")}*\n\n`
    setContent((prev) => (prev ? prev + separator + text : text))
    setInitialContent((prev) => (prev ? prev + separator + text : text))
    toast(`已导入 ${text.length} 字内容`, "success")
  }, [toast])

  // Fetch project details and existing draft
  useEffect(() => {
    if (!projectId) return

    let cancelled = false

    async function load() {
      try {
        // Fetch project details
        const projectData = await api.getProject(projectId)
        if (!projectData) throw new Error("获取项目失败")
        if (cancelled) return
        setProject(projectData as ProjectData)
        setTeamMode(projectData.teamMode ?? false)

        // Try to load existing draft
        const draftText = await api.readProjectFile(projectId, DRAFT_FILE)
        if (!cancelled) {
          if (draftText) {
            setInitialContent(draftText)
            setContent(draftText)
          } else if (projectData.description) {
            setInitialContent(projectData.description)
            setContent(projectData.description)
          }
        }
      } catch (err) {
        console.error("Failed to load requirement page:", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  // Save draft
  const saveDraft = useCallback(async () => {
    if (!projectId || !content.trim()) return false
    setSaving(true)
    setSaveHint("")
    try {
      const contentWithUrls = urls.length > 0
        ? `${content.trim()}\n\n---\n参考网址：\n${urls.map(u => `- ${u}`).join("\n")}`
        : content.trim()
      await api.saveProjectFile({
        projectId,
        fileName: DRAFT_FILE,
        content: contentWithUrls,
      })
      setSaveHint("已暂存")
      setTimeout(() => setSaveHint(""), 2000)
      return true
    } catch (err) {
      console.error("Failed to save draft:", err)
      setSaveHint("保存失败")
      setTimeout(() => setSaveHint(""), 3000)
      return false
    } finally {
      setSaving(false)
    }
  }, [projectId, content, urls])

  // Advance to analysis
  const handleStart = useCallback(async () => {
    if (!projectId || !content.trim()) return
    setAdvancing(true)
    try {
      // Save draft first
      const saved = await saveDraft()
      if (!saved) {
        setAdvancing(false)
        return
      }

      // Advance phase
      await api.advancePhase(projectId)
      navigate(`/project/${projectId}/analysis?autostart=1${teamMode ? "&team=1" : ""}`)
    } catch (err) {
      console.error("Failed to advance:", err)
      toast("推进阶段失败，请重试", "error")
      setAdvancing(false)
    }
  }, [projectId, content, saveDraft, navigate, teamMode])

  const handleYolo = useCallback(async () => {
    if (!projectId || !content.trim()) return
    setAdvancing(true)
    try {
      const saved = await saveDraft()
      if (!saved) { setAdvancing(false); return }
      await api.advancePhase(projectId)
      navigate(`/project/${projectId}/analysis?autostart=1&yolo=1${teamMode ? "&team=1" : ""}`)
    } catch (err) {
      console.error("Failed to start yolo:", err)
      toast("启动一键直达失败，请重试", "error")
      setAdvancing(false)
    }
  }, [projectId, content, saveDraft, navigate, teamMode])

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-[var(--text-tertiary)]">加载中...</span>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-[var(--destructive)]">
          项目不存在或加载失败
        </span>
      </div>
    )
  }

  const canSubmit = content.trim().length > 0

  return (
    <div className="layout-focus page-enter">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">需求收集</h1>
      </div>

      <div className="h-px bg-[var(--border)]" />
      <ReferenceFiles projectId={projectId} className="px-1 py-2 border-b border-[var(--border)]" />

      {/* Requirement description — Rich Editor */}
      <div className="mt-8 mb-6">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-[var(--text-primary)]">
            需求描述
          </label>
          <Button variant="ghost" size="sm" onClick={handleImportFile} className="gap-1.5 h-7 text-xs">
            <Upload className="size-3.5" strokeWidth={1.75} />
            导入
          </Button>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn("relative", dragging && "ring-2 ring-[var(--accent-color)] ring-dashed rounded-lg")}
        >
          {dragging && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-[var(--accent-light)]/60 backdrop-blur-[2px]">
              <span className="text-sm font-medium text-[var(--accent-color)]">松开以导入</span>
            </div>
          )}
        {initialContent !== undefined ? (
          <RichEditor
            content={initialContent}
            placeholder="描述你的产品需求..."
            onChange={setContent}
            editable={!advancing}
          />
        ) : (
          <RichEditor
            placeholder="描述你的产品需求..."
            onChange={setContent}
            editable={!advancing}
          />
        )}
        </div>
      </div>

      {/* File upload */}
      <div className="mb-8">
        <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
          参考文件
          <span className="ml-1 text-xs font-normal text-[var(--text-secondary)]">
            (可选)
          </span>
        </label>
        <FileUpload files={files} onChange={setFiles} />
      </div>

      {/* Optional URL context (collapsible) */}
      <div className="mt-4">
        <details className="group">
          <summary className="cursor-pointer text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] list-none flex items-center gap-1 select-none">
            <span className="group-open:rotate-90 transition-transform text-[10px]">▶</span>
            <span className="ml-1">添加参考网址（可选）</span>
          </summary>
          <div className="mt-2 flex gap-2">
            <input
              type="url"
              placeholder="https://..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && urlInput.trim()) {
                  setUrls((prev) => [...prev, urlInput.trim()])
                  setUrlInput("")
                }
              }}
              className="flex-1 h-8 px-3 rounded text-[13px] bg-[var(--secondary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-color)] transition-colors"
            />
            <Button variant="ghost" size="sm" onClick={() => {
              if (urlInput.trim()) {
                setUrls((prev) => [...prev, urlInput.trim()])
                setUrlInput("")
              }
            }}>
              添加
            </Button>
          </div>
          {urls.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {urls.map((u, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[var(--secondary)] border border-[var(--border)] text-[var(--text-secondary)]">
                  {(() => { try { return new URL(u).hostname } catch { return u.slice(0, 30) } })()}
                  <button
                    onClick={() => setUrls((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    aria-label="删除网址"
                  >×</button>
                </span>
              ))}
            </div>
          )}
        </details>
      </div>

      {/* Team mode toggle */}
      <div className="mt-3 flex items-center justify-between py-2 px-3 rounded border border-[var(--border)] bg-[var(--secondary)]">
        <div>
          <p className="text-[13px] font-medium text-[var(--text-primary)]">团队模式</p>
          <p className="text-[11px] text-[var(--text-tertiary)]">开启后，AI 将使用团队协作提示词进行更深入分析</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={teamMode}
          onClick={async () => {
            const next = !teamMode
            setTeamMode(next)
            try {
              await api.setTeamMode(projectId, next)
            } catch {
              setTeamMode(!next)
            }
          }}
          className={cn(
            "relative inline-flex w-9 h-5 rounded-full transition-colors flex-shrink-0",
            teamMode ? "bg-[var(--accent-color)]" : "bg-[var(--border)]"
          )}
        >
          <span className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
            teamMode ? "translate-x-4" : "translate-x-0.5"
          )} />
        </button>
      </div>

      {/* Action bar */}
      <div className="mt-8 -mx-8 border-t border-[var(--border)] bg-[var(--background)] px-8 py-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {!canSubmit ? "请填写需求描述后继续" : ""}
          </span>
          <div className="flex items-center gap-3">
            {saveHint && (
              <span
                className="text-[11px] text-[var(--text-tertiary)]"
                style={{ animation: "fadeInUp 0.2s ease-out" }}
              >
                {saveHint}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleYolo}
              disabled={!canSubmit || advancing}
              title="自动执行需求分析→竞品研究→用户故事，在PRD前停下"
            >
              ⚡ 加急
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={saveDraft}
              disabled={saving || !canSubmit}
              title={!canSubmit ? "请先填写需求描述" : undefined}
            >
              {saving ? "保存中..." : "暂存草稿"}
            </Button>
            <Button
              variant="primary"
              onClick={handleStart}
              disabled={!canSubmit || advancing}
            >
              {advancing ? "启动分析中..." : "开始分析 →"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

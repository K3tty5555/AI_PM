"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RichEditor } from "@/components/rich-editor"
import { FileUpload } from "@/components/file-upload"

interface ProjectData {
  id: string
  name: string
  description: string
  currentPhase: string
}

const DRAFT_FILE = "01-requirement-draft.md"

export default function RequirementPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params?.id as string

  const [project, setProject] = useState<ProjectData | null>(null)
  const [content, setContent] = useState("")
  const [initialContent, setInitialContent] = useState<string | undefined>(
    undefined
  )
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [saveHint, setSaveHint] = useState("")
  const [loading, setLoading] = useState(true)

  // Fetch project details and existing draft
  useEffect(() => {
    if (!projectId) return

    let cancelled = false

    async function load() {
      try {
        // Fetch project details
        const projectRes = await fetch(`/api/projects/${projectId}`)
        if (!projectRes.ok) throw new Error("获取项目失败")
        const projectData = await projectRes.json()
        if (cancelled) return
        setProject(projectData)

        // Try to load existing draft
        const draftRes = await fetch(
          `/api/projects/${projectId}/files/${DRAFT_FILE}`
        )
        if (draftRes.ok) {
          const draftText = await draftRes.text()
          if (!cancelled && draftText) {
            setInitialContent(draftText)
            setContent(draftText)
          } else if (!cancelled && projectData.description) {
            setInitialContent(projectData.description)
            setContent(projectData.description)
          }
        } else if (!cancelled && projectData.description) {
          setInitialContent(projectData.description)
          setContent(projectData.description)
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
      const res = await fetch("/api/ai/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          fileName: DRAFT_FILE,
          content: content.trim(),
        }),
      })
      if (!res.ok) throw new Error("保存失败")
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
  }, [projectId, content])

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
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance" }),
      })
      if (!res.ok) throw new Error("推进阶段失败")

      router.push(`/project/${projectId}/analysis`)
    } catch (err) {
      console.error("Failed to advance:", err)
      setAdvancing(false)
    }
  }, [projectId, content, saveDraft, router])

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs uppercase tracking-[2px] text-[var(--text-muted)]">
          LOADING...
        </span>
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
    <div className="relative mx-auto w-full max-w-[720px] pb-24">
      {/* Header */}
      <div className="mb-8">
        <Badge variant="outline">REQUIREMENT_INPUT</Badge>
      </div>

      <div className="h-px bg-[var(--border)]" />

      {/* Requirement description — Rich Editor */}
      <div className="mt-8 mb-6">
        <label className="mb-2 block text-sm font-medium text-[var(--dark)]">
          需求描述
        </label>
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

      {/* File upload */}
      <div className="mb-8">
        <label className="mb-2 block text-sm font-medium text-[var(--dark)]">
          参考文件
          <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">
            (可选)
          </span>
        </label>
        <FileUpload files={files} onChange={setFiles} />
      </div>

      {/* Sticky bottom action bar */}
      <div className="sticky bottom-0 -mx-8 border-t border-[var(--border)] bg-[var(--background)] px-8 py-4">
        <div className="flex items-center justify-between">
          <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
            {!canSubmit ? "请填写需求描述后继续" : ""}
          </span>
          <div className="flex items-center gap-3">
            {saveHint && (
              <span
                className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]"
                style={{ animation: "fadeInUp 0.2s ease-out" }}
              >
                {saveHint}
              </span>
            )}
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
              {advancing ? "正在启动分析..." : "开始分析 →"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from "react"
import { api, type ReferenceFileEntry } from "@/lib/tauri-api"
import { open } from "@tauri-apps/plugin-dialog"
import { cn } from "@/lib/utils"

interface ReferenceFilesProps {
  projectId: string
  className?: string
}

const ACCEPT_EXTENSIONS = ["md", "txt", "docx", "pdf", "png", "jpg", "jpeg"]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function ReferenceFiles({ projectId, className }: ReferenceFilesProps) {
  const [files, setFiles] = useState<ReferenceFileEntry[]>([])
  const [uploading, setUploading] = useState(false)

  const loadFiles = useCallback(async () => {
    try {
      const list = await api.listReferenceFiles(projectId)
      setFiles(list)
    } catch (err) {
      console.error("[ReferenceFiles] list failed:", err)
    }
  }, [projectId])

  useEffect(() => { loadFiles() }, [loadFiles])

  const handleUpload = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: "参考文件",
          extensions: ACCEPT_EXTENSIONS,
        }],
      })
      if (!selected) return

      setUploading(true)
      const paths = Array.isArray(selected) ? selected : [selected]
      for (const filePath of paths) {
        try {
          await api.uploadReferenceFile(projectId, filePath)
        } catch (err) {
          console.error("[ReferenceFiles] upload failed:", filePath, err)
        }
      }
      await loadFiles()
    } finally {
      setUploading(false)
    }
  }, [projectId, loadFiles])

  const handleDelete = useCallback(async (fileName: string) => {
    try {
      await api.deleteReferenceFile(projectId, fileName)
      setFiles((prev) => prev.filter((f) => f.name !== fileName))
    } catch (err) {
      console.error("[ReferenceFiles] delete failed:", err)
    }
  }, [projectId])

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <button
        type="button"
        onClick={handleUpload}
        disabled={uploading}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px]",
          "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          "hover:bg-[var(--hover-bg)] transition-colors",
          "disabled:opacity-50",
        )}
        title="上传参考文件到 07-references/"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        {uploading ? "上传中..." : "参考文件"}
      </button>
      {files.map((f) => (
        <span
          key={f.name}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
            "bg-[var(--secondary)] text-[var(--text-secondary)]",
            "border border-[var(--border)]",
          )}
        >
          <span className="max-w-[120px] truncate" title={`${f.name} (${formatSize(f.size)})`}>
            {f.name}
          </span>
          <button
            type="button"
            onClick={() => handleDelete(f.name)}
            className="ml-0.5 text-[var(--text-tertiary)] hover:text-[var(--destructive)] transition-colors"
            title="删除"
            aria-label={`删除 ${f.name}`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}

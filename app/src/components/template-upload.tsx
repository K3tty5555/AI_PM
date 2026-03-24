import { useCallback, useEffect, useRef } from "react"
import { open as dialogOpen } from "@tauri-apps/plugin-dialog"

interface TemplateUploadProps {
  /** 显示标签，如"评估模板"、"周报模板" */
  label?: string
  /** localStorage key 后缀，用于记忆上次选择 */
  storageKey: string
  onSelect: (filePath: string | null) => void
  value: string | null
}

export function TemplateUpload({ label = "参考模板", storageKey, onSelect, value }: TemplateUploadProps) {
  const lsKey = `tool-template:${storageKey}`
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // 首次挂载时从 localStorage 恢复上次的模板路径
  useEffect(() => {
    if (value) return // 已有值则不覆盖
    const saved = localStorage.getItem(lsKey)
    if (saved) {
      onSelectRef.current(saved)
    }
  }, [lsKey, value])

  const handlePick = useCallback(async () => {
    const selected = await dialogOpen({
      multiple: false,
      filters: [
        { name: "文档", extensions: ["md", "txt", "docx", "pdf"] },
        { name: "表格", extensions: ["xlsx", "xls", "csv"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    })
    if (selected) {
      const path = selected as string
      onSelect(path)
      localStorage.setItem(lsKey, path)
    }
  }, [onSelect, lsKey])

  const handleClear = useCallback(() => {
    onSelect(null)
    localStorage.removeItem(lsKey)
  }, [onSelect, lsKey])

  if (!value) {
    return (
      <button
        onClick={handlePick}
        className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--accent-color)] transition-colors"
      >
        + 上传{label}（可选）
      </button>
    )
  }

  const fileName = value.split(/[/\\]/).pop() ?? value

  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="text-[var(--text-tertiary)]">{label}：</span>
      <span className="text-[var(--text-primary)] font-medium truncate max-w-[300px]">{fileName}</span>
      <button
        onClick={handleClear}
        aria-label="清除模板"
        className="text-[var(--text-tertiary)] hover:text-[var(--destructive)] transition-colors"
      >
        ×
      </button>
      <button
        onClick={handlePick}
        aria-label="重新选择模板"
        className="text-[var(--text-tertiary)] hover:text-[var(--accent-color)] transition-colors"
      >
        换一个
      </button>
    </div>
  )
}

import { useRef, useState, useCallback } from "react"
import { cn } from "@/lib/utils"

interface FileUploadProps {
  files: File[]
  onChange: (files: File[]) => void
  accept?: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileUpload({
  files,
  onChange,
  accept = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg",
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const addFiles = useCallback(
    (newFiles: FileList | null) => {
      if (!newFiles || newFiles.length === 0) return
      const arr = Array.from(newFiles)
      // Deduplicate by name + size
      const existing = new Set(files.map((f) => `${f.name}::${f.size}`))
      const unique = arr.filter((f) => !existing.has(`${f.name}::${f.size}`))
      if (unique.length > 0) {
        onChange([...files, ...unique])
      }
    },
    [files, onChange]
  )

  const removeFile = useCallback(
    (index: number) => {
      onChange(files.filter((_, i) => i !== index))
    },
    [files, onChange]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)
      addFiles(e.dataTransfer.files)
    },
    [addFiles]
  )

  const handleClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      addFiles(e.target.files)
      // Reset so the same file can be selected again
      e.target.value = ""
    },
    [addFiles]
  )

  return (
    <div data-slot="file-upload">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleClick()
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2",
          "border-2 border-dashed px-4 py-8",
          "transition-colors duration-[var(--dur-base)] ease-[var(--ease-standard)]",
          isDragOver
            ? "border-[var(--accent-color)] bg-[var(--accent-light)]"
            : "border-[var(--border)] bg-transparent hover:border-[var(--text-secondary)]/30"
        )}
      >
        <span
          className={cn(
            "text-[12px] font-medium",
            isDragOver ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
          )}
        >
          {isDragOver ? "松手放置" : "拖拽或点击上传"}
        </span>
        <span className="text-xs text-[var(--text-secondary)]/60">
          支持 PDF, Word, Excel, 图片
        </span>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        onChange={handleInputChange}
        className="hidden"
      />

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              className={cn(
                "flex items-center justify-between",
                "border border-[var(--border)] bg-[var(--background)] px-3 py-2",
                "group/file"
              )}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-medium",
                    "text-[var(--text-tertiary)]"
                  )}
                >
                  文件
                </span>
                <span className="truncate text-sm text-[var(--text-primary)]">
                  {file.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    "text-[var(--text-tertiary)]"
                  )}
                >
                  {formatFileSize(file.size)}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile(index)
                }}
                className={cn(
                  "ml-2 shrink-0 px-1.5 py-0.5",
                  "text-xs text-[var(--text-secondary)] hover:text-[var(--destructive)]",
                  "transition-colors duration-[var(--dur-base)]",
                  "opacity-0 group-hover/file:opacity-100"
                )}
                aria-label={`删除 ${file.name}`}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export { FileUpload }
export type { FileUploadProps }

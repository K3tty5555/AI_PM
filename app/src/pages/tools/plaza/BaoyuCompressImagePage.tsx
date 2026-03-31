import { useState, useRef } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

type OutputFormat = "webp" | "png"

export function BaoyuCompressImagePage() {
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [format, setFormat] = useState<OutputFormat>("webp")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-compress-image", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!imagePath) return
    run(`--format ${format} "${imagePath}"`)
  }

  function handleClear() {
    reset()
    setImagePath(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <PlazaSkillPage
      title="图片压缩"
      description="压缩为 WebP / PNG，自动选择最优工具"
      source="baoyu"
      category="content"
      categoryLabel="内容处理"
      onRun={handleRun}
      onClear={handleClear}
      running={isStreaming}
      output={text}
      error={error}
    >
      <div>
        <span className="text-xs text-[var(--text-secondary)] mb-1.5 block">选择图片</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="w-full text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--bg-secondary)] file:px-3 file:py-1.5 file:text-xs file:text-[var(--text-primary)] file:cursor-pointer"
          onChange={(e) => {
            const f = e.target.files?.[0]
            setImagePath(f ? (f as File & { path?: string }).path ?? f.name : null)
          }}
        />
        {imagePath && (
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            {imagePath.split("/").pop() ?? imagePath}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)] shrink-0">输出格式</span>
        <div className="flex gap-1">
          {(["webp", "png"] as OutputFormat[]).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={cn(
                "px-3 py-1 rounded text-xs font-medium border transition-colors uppercase",
                format === f
                  ? "border-[var(--accent-color)] bg-[var(--accent-light)] text-[var(--accent-color)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)]"
              )}
            >
              {f}
            </button>
          ))}
          <span className="text-xs text-[var(--text-tertiary)] self-center ml-1">
            （WebP 压缩率更高，推荐）
          </span>
        </div>
      </div>
    </PlazaSkillPage>
  )
}
